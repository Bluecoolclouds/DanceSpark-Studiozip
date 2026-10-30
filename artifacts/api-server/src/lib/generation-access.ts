import { and, eq } from "drizzle-orm";
import { db, danceJobs } from "@workspace/db";
import { assertVideoProviderConfigured, getDanceVideoStatus, submitDanceVideo } from "./video-generation";
import { reserveGeneration, beginGeneration, finishGeneration, GenerationPolicyError } from "./generation-governance";
import type { VideoGenerationInput } from "@workspace/api-zod";

export class VideoNotFoundError extends Error {
  constructor() {
    super("Генерация не найдена.");
  }
}

export async function createOwnedGeneration(ownerId: string, input: VideoGenerationInput) {
  assertVideoProviderConfigured();
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
  try {
    const provider = await submitDanceVideo(input);
    await db.update(danceJobs)
      .set({ providerRequestId: provider.requestId })
      .where(eq(danceJobs.id, reservation.id));
    return { requestId: reservation.id };
  } catch (error) {
    await finishGeneration(reservation.id, "failed", "provider_error");
    throw error;
  }
}

export async function getOwnedGeneration(ownerId: string, requestId: string) {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(requestId)) throw new VideoNotFoundError();
  const [generation] = await db.select().from(danceJobs)
    .where(and(eq(danceJobs.userId, ownerId), eq(danceJobs.id, requestId)))
    .limit(1);
  if (!generation) throw new VideoNotFoundError();
  const base = { requestId, videoUrl: null, queuePosition: null };
  if (generation.status === "failed") {
    return { ...base, status: "failed" as const, error: "Генерация не выполнена. Проверь запросы в Higgsfield Console перед повторной платной попыткой." };
  }
  if (!generation.providerRequestId) {
    if (Date.now() - generation.createdAt.getTime() > 120000) {
      await finishGeneration(generation.id, "failed", "timeout");
      return { ...base, status: "failed" as const, error: "Отправка прервалась. Проверь запросы в Higgsfield Console." };
    }
    return { ...base, status: "queued" as const, error: null };
  }
  const status = await getDanceVideoStatus(generation.providerRequestId);
  if (status.status === "completed") await finishGeneration(generation.id, "succeeded");
  else if (status.status === "failed") await finishGeneration(generation.id, "failed", "provider_error");
  return { ...status, requestId };
}
