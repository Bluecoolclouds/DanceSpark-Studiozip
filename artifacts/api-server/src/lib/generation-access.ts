import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, danceJobs } from "@workspace/db";
import { getDanceVideoStatus } from "./video-generation";
import { finishGeneration, GenerationPolicyError } from "./generation-governance";
import type { VideoGenerationInput } from "@workspace/api-zod";
import { isSwapperModel } from "./swapper-models";

export class VideoNotFoundError extends Error {
  constructor() {
    super("Генерация не найдена.");
  }
}

export async function createOwnedGeneration(ownerId: string, input: VideoGenerationInput): Promise<{ requestId: string }> {
  void ownerId;
  void input;
  // PixVerse has no approved cost tariff in the server pricing table. Never
  // substitute the old global estimate or submit a billable request.
  throw new GenerationPolicyError("pricing_not_configured", 503);
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
  // An accepted job failing does not prove that the provider charged nothing.
  else if (status.status === "failed") await finishGeneration(generation.id, "failed", "billing_unconfirmed");
  return { ...status, requestId };
}
