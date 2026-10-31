import { createHash } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, danceJobs, danceCatalogue } from "@workspace/db";
import {
  CreateLightSwapperGenerationBody, CreateCustomVideoLightSwapperGenerationBody,
  type LightSwapperInput, type CustomVideoLightSwapperInput,
} from "@workspace/api-zod";
import { beginGeneration, finishGeneration, GenerationPolicyError, reserveGeneration } from "./generation-governance";
import {
  assertVideoProviderConfigured, decodeImageDataUrl, submitLightSwapper,
  uploadGenerationMedia, VideoSubmissionUnknownError,
} from "./video-generation";
import { readTemplate, templateLimit, templateMetadata, validTemplateBytes } from "./template-storage";
import { CustomVideoStorageError, readOwnedCustomVideo } from "./custom-video-storage";
import { CustomVideoValidationError, inspectCustomVideo } from "./custom-video-validation";
import type { Readable } from "node:stream";

async function publishedTemplate(id: string) {
  const [template] = await db.select().from(danceCatalogue)
    .where(and(eq(danceCatalogue.id, id), eq(danceCatalogue.published, true))).limit(1);
  if (!template) throw new GenerationPolicyError("invalid_template", 400);
  return template;
}

function minimumCostRub(seconds: number, resolution: LightSwapperInput["resolution"]) {
  // An operator-provided conservative USD/RUB rate, not a customer tariff.
  // Never silently assume parity or use a client-supplied duration/quote.
  const usdRub = Number(process.env.DANCEFLOW_LIGHT_USD_RUB);
  if (!Number.isFinite(usdRub) || usdRub <= 0 || typeof seconds !== "number" ||
      !Number.isFinite(seconds) || seconds <= 0 || seconds > 300) {
    throw new GenerationPolicyError("light_pricing_not_configured", 503);
  }
  const rate = { "480p": 0.05, "720p": 0.1, "1080p": 0.2 }[resolution];
  // Full input duration is billable even though output uses only the first 15s.
  return Math.ceil((seconds + Math.ceil(Math.min(seconds, 15))) * rate * usdRub * 100) / 100;
}

async function originalVideo(templateId: string) {
  try {
    const head = await templateMetadata(templateId, "video.mp4");
    if (!head.ETag || head.ContentType !== "video/mp4" ||
        !Number.isSafeInteger(head.ContentLength) || !head.ContentLength ||
        head.ContentLength > templateLimit("video.mp4")) throw new Error();
    const media = await readTemplate(templateId, "video.mp4", head.ETag, undefined, AbortSignal.timeout(60000));
    try {
      const body = media.result.Body as Readable | undefined;
      if (!body) throw new Error();
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of body) {
        const bytes = Buffer.from(chunk);
        size += bytes.length;
        if (size > templateLimit("video.mp4")) throw new Error();
        chunks.push(bytes);
      }
      const bytes = Buffer.concat(chunks);
      if (size !== head.ContentLength || !validTemplateBytes("video.mp4", bytes)) throw new Error();
      return bytes;
    } finally { media.dispose(); }
  } catch { throw new GenerationPolicyError("original_unavailable", 503); }
}

export async function createOwnedLightSwapper(ownerId: string, value: LightSwapperInput) {
  return createOwnedLightSwapperForVideo(ownerId, value, false);
}

export async function createOwnedCustomVideoLightSwapper(
  ownerId: string, value: CustomVideoLightSwapperInput,
) {
  return createOwnedLightSwapperForVideo(ownerId, value, true);
}

async function createOwnedLightSwapperForVideo(
  ownerId: string, value: LightSwapperInput | CustomVideoLightSwapperInput, custom: boolean,
) {
  const parsed = custom
    ? CreateCustomVideoLightSwapperGenerationBody.strict().safeParse(value)
    : CreateLightSwapperGenerationBody.strict().safeParse(value);
  if (!parsed.success) throw new GenerationPolicyError("invalid_request", 400);
  const input = parsed.data as LightSwapperInput | CustomVideoLightSwapperInput;
  const photos = input.photos.map(photo => {
    try { return decodeImageDataUrl(photo); }
    catch { throw new GenerationPolicyError("invalid_request", 400); }
  });
  if (photos.reduce((sum, photo) => sum + photo.bytes.length, 0) > 12 * 1024 * 1024) {
    throw new GenerationPolicyError("input_too_large", 413);
  }
  const customInput = custom ? input as CustomVideoLightSwapperInput : null;
  let customVideo: Buffer | undefined;
  let sourceDurationSeconds: number;
  let template: Awaited<ReturnType<typeof publishedTemplate>> | undefined;
  if (customInput) {
    try {
      customVideo = await readOwnedCustomVideo(ownerId, customInput.sourceVideoId);
      sourceDurationSeconds = await inspectCustomVideo(customVideo);
    } catch (error) {
      if (error instanceof CustomVideoValidationError) {
        throw new GenerationPolicyError(error.code, error.code === "source_validation_unavailable" ? 503 : 400);
      }
      if (error instanceof CustomVideoStorageError) {
        throw new GenerationPolicyError(
          error.code === "source_storage_unavailable" ? error.code : "invalid_source_video",
          error.code === "source_storage_unavailable" ? 503 : 400,
        );
      }
      throw new GenerationPolicyError("invalid_source_video", 400);
    }
  } else {
    const catalogInput = input as LightSwapperInput;
    template = await publishedTemplate(catalogInput.templateId);
    const duration = template.metadata.sourceDurationSeconds;
    if (typeof duration !== "number") throw new GenerationPolicyError("light_pricing_not_configured", 503);
    sourceDurationSeconds = duration;
  }
  // Fingerprint every selected parameter and the ordered decoded photo contents,
  // never persist local URIs, prompts, photos or temporary upload URLs.
  const fingerprint = createHash("sha256").update(JSON.stringify([
    input.model,
    customInput ? ["custom", customInput.sourceVideoId, createHash("sha256").update(customVideo!).digest("hex")] :
      ["catalogue", (input as LightSwapperInput).templateId],
    input.prompt, input.resolution,
    photos.map(photo => [photo.mimeType, createHash("sha256").update(photo.bytes).digest("hex")]),
  ])).digest("hex");
  // Replays must remain readable even after pricing configuration is removed.
  const [previous] = await db.select({ fingerprint: danceJobs.requestFingerprint }).from(danceJobs)
    .where(and(eq(danceJobs.userId, ownerId), eq(danceJobs.idempotencyKey, input.clientRequestId))).limit(1);
  const reservation = await reserveGeneration({
    userId: ownerId, idempotencyKey: input.clientRequestId,
    templateId: customInput ? `custom-${customInput.sourceVideoId}` : (input as LightSwapperInput).templateId,
    fingerprint, model: input.model,
    minimumCostRub: previous ? undefined : minimumCostRub(sourceDurationSeconds, input.resolution),
  });
  if (reservation.reused) return { requestId: reservation.id };
  let paidStarted = false;
  try {
    assertVideoProviderConfigured();
    const video = customVideo ?? await originalVideo((input as LightSwapperInput).templateId);
    const videoUrl = await uploadGenerationMedia(video, "video/mp4");
    const imageUrls: string[] = [];
    // Sequential upload preserves the caller's exact selection order.
    for (const photo of photos) imageUrls.push(await uploadGenerationMedia(photo.bytes, photo.mimeType));
    if (!customInput) await publishedTemplate((input as LightSwapperInput).templateId);
    // Upload can be slow. Recheck pause, account and subscription immediately
    // before acquiring the worker and starting the one paid POST.
    if (!await beginGeneration(reservation.id, true)) throw new GenerationPolicyError("generation_paused", 503);
    paidStarted = true;
    const provider = await submitLightSwapper(input.model, {
      video_url: videoUrl, image_urls: imageUrls, prompt: input.prompt, resolution: input.resolution,
    });
    const saved = await db.update(danceJobs).set({ providerRequestId: provider.requestId })
      .where(and(eq(danceJobs.id, reservation.id), inArray(danceJobs.status, ["queued", "running"]), isNull(danceJobs.providerRequestId)))
      .returning({ id: danceJobs.id });
    if (!saved.length) throw new VideoSubmissionUnknownError();
    return { requestId: reservation.id };
  } catch (error) {
    await finishGeneration(reservation.id, "failed", paidStarted ? "submission_unknown" : "provider_error");
    if (paidStarted) throw new VideoSubmissionUnknownError();
    throw error;
  }
}
