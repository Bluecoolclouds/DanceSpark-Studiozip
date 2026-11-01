import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, danceJobs } from "@workspace/db";
import { getDanceVideoStatus, submitDanceVideo, VideoSubmissionUnknownError } from "./video-generation";
import { reserveGeneration, beginGeneration, finishGeneration, GenerationPolicyError } from "./generation-governance";
import type { VideoGenerationInput } from "@workspace/api-zod";
import { isSwapperModel } from "./swapper-models";

export class VideoNotFoundError extends Error {
  constructor() {
    super("Генерация не найдена.");
  }
}

export async function createOwnedGeneration(ownerId: string, input: VideoGenerationInput) {
  // Shared with the admin app: subscription, block, pause, budget, quota and
  // concurrency checks are atomic. Never submit again on an idempotent replay.
  const reservation = await reserveGeneration({
    userId: ownerId,
    idempotencyKey: input.clientRequestId,
    templateId: input.styleId,
  });
  if (reservation.reused) return { requestId: reservation.id };
  if (!await beginGeneration(reservation.id)) {
    await finishGeneration(reservation.id, "failed", "cancelled");
    throw new GenerationPolicyError("generation_paused", 503);
  }
  let acceptedByProvider = false;
  try {
    const provider = await submitDanceVideo(input);
    acceptedByProvider = true;
    await db.update(danceJobs)
      .set({ providerRequestId: provider.requestId })
      .where(and(eq(danceJobs.id, reservation.id), inArray(danceJobs.status, ["queued", "running"]), isNull(danceJobs.providerRequestId)));
    return { requestId: reservation.id };
  } catch (error) {
    await finishGeneration(reservation.id, "failed",
      acceptedByProvider || error instanceof VideoSubmissionUnknownError ? "submission_unknown" : "provider_error");
    if (acceptedByProvider) throw new VideoSubmissionUnknownError();
    throw error;
  }
}

export async function findOwnedLightSwapperGeneration(ownerId: string, clientRequestId: string) {
  const [job] = await db.select({ id: danceJobs.id, model: danceJobs.providerModel }).from(danceJobs)
    .where(and(eq(danceJobs.userId, ownerId), eq(danceJobs.idempotencyKey, clientRequestId))).limit(1);
  if (!job?.model || !isSwapperModel(job.model)) return null;
  return getOwnedGeneration(ownerId, job.id);
}

export async function getOwnedGeneration(ownerId: string, requestId: string) {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(requestId)) throw new VideoNotFoundError();
  const [generation] = await db.select().from(danceJobs)
    .where(and(eq(danceJobs.userId, ownerId), eq(danceJobs.id, requestId)))
    .limit(1);
  if (!generation) throw new VideoNotFoundError();
  const base = { requestId, videoUrl: null, queuePosition: null };
  if (generation.providerModel && generation.status === "succeeded" && generation.resultUrl) {
    return { ...base, status: "completed" as const, videoUrl: generation.resultUrl, error: null };
  }
  if (generation.status === "failed") {
    return { ...base, status: "failed" as const, error: "Генерация не выполнена. Проверь запросы в Higgsfield Console перед повторной платной попыткой." };
  }
  if (!generation.providerRequestId) {
    // Recovery owns the age threshold and conditional transition. A status read
    // must not race an upload or mutate a completed record.
    if (generation.status === "succeeded") return { ...base, status: "completed" as const, error: null };
    return { ...base, status: "queued" as const, error: null };
  }
  const status = await getDanceVideoStatus(generation.providerRequestId);
  if (status.status === "completed") {
    if (generation.providerModel) await db.update(danceJobs).set({ resultUrl: status.videoUrl })
      .where(and(eq(danceJobs.id, generation.id), inArray(danceJobs.status, ["queued", "running", "succeeded"])));
    await finishGeneration(generation.id, "succeeded");
  }
  else if (status.status === "failed") await finishGeneration(generation.id, "failed", "provider_error");
  return { ...status, requestId };
}
