import { randomUUID } from "node:crypto";
import type { VideoGenerationInput } from "@workspace/api-zod";

// https://docs.higgsfield.ai/docs/models/pixverse-v6/image-to-video
const HIGGSFIELD_API = "https://api.higgsfield.ai";
const VIDEO_ENDPOINT = "/pixverse/v6/image-to-video";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export class VideoProviderNotConfiguredError extends Error {
  constructor() {
    super("Higgsfield не настроен. Добавьте секрет higgs_api в формате ID:secret из Higgsfield Console.");
    this.name = "VideoProviderNotConfiguredError";
  }
}

export class VideoProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoProviderError";
  }
}

/** The paid POST may have reached the provider. Never retry or refund quota automatically. */
export class VideoSubmissionUnknownError extends VideoProviderError {
  constructor() {
    super("Higgsfield не подтвердил запуск. Проверь запросы в Higgsfield Console перед повторной платной попыткой.");
    this.name = "VideoSubmissionUnknownError";
  }
}

const stylePrompts: Record<VideoGenerationInput["styleId"], string> = {
  "bubblegum-rush":
    "An energetic K-pop chorus dance with sharp arm accents, a shoulder wave, a cross-step turn, and a joyful star pose. Bright, playful stage presence.",
  "lime-voltage":
    "A confident street-dance groove with a rhythmic torso bounce, a knee lift, a pointed accent, and a clean one-leg freeze. Grounded footwork.",
  "hexa-star":
    "A smooth disco routine with flowing arms, a high kick, a classic disco point, and a graceful turn on the toes. Elegant, sparkling stage energy.",
  "confetti-cannon":
    "A short viral dance loop with a double clap, a springy knee bounce, and a playful camera-facing finish.",
  "grid-runner":
    "Fast, crisp shuffle footwork with a forward shuffle, rolling steps, a lateral slide, and a sharp final freeze.",
  "velvet-orbit":
    "A smooth, relaxed disco dance with gentle hip sways, a wide arm arc, and a slow, elegant turn.",
  "seoul-sparkle":
    "A cute, precise K-pop dance with finger hearts, a step-touch, and a playful side lean toward the camera.",
};

export function decodeImageDataUrl(imageDataUrl: string): { bytes: Buffer; mimeType: string } {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(imageDataUrl);
  if (!match) {
    throw new VideoProviderError("Выбери фото в формате JPG, PNG или WebP.");
  }

  const mimeType = match[1]!.toLowerCase();
  const bytes = Buffer.from(match[2]!, "base64");
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    throw new VideoProviderError("Фото слишком большое. Выбери снимок до 12 МБ.");
  }

  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  const isWebp =
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP";
  if (
    (mimeType === "image/jpeg" && !isJpeg) ||
    (mimeType === "image/png" && !isPng) ||
    (mimeType === "image/webp" && !isWebp)
  ) {
    throw new VideoProviderError("Не удалось прочитать фото. Выбери другое изображение.");
  }

  return { bytes, mimeType };
}

function getCredentials(): string {
  const credentials = process.env["higgs_api"]?.trim();
  if (!credentials) throw new VideoProviderNotConfiguredError();
  if (!/^[^\s:]+:[^\s:]+$/.test(credentials)) {
    throw new VideoProviderError(
      "Секрет higgs_api должен содержать ID:secret из Higgsfield Console, а не только одну часть ключа.",
    );
  }
  return credentials;
}

export function assertVideoProviderConfigured(): void {
  getCredentials();
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new VideoProviderError("Higgsfield вернул некорректный ответ. Проверь статус позже.");
  }
  return value as Record<string, unknown>;
}

function httpsUrl(value: unknown): string {
  if (typeof value === "string") {
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && !url.username && !url.password) return value;
    } catch { /* Report an invalid provider response below. */ }
  }
  throw new VideoProviderError("Higgsfield не вернул доступную ссылку на файл. Проверь статус позже.");
}

async function apiRequest(
  path: string,
  credentials: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`${HIGGSFIELD_API}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Key ${credentials}`,
        ...(body ? { "Content-Type": "application/json", "Idempotency-Key": randomUUID() } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(45000),
      redirect: "error",
    });
  } catch {
    throw new VideoProviderError(
      body && path === VIDEO_ENDPOINT
        ? "Higgsfield не подтвердил запуск. Проверь запросы в Higgsfield Console перед повтором, чтобы не оплатить дубликат."
        : "Нет ответа от Higgsfield. Проверь подключение и попробуй позже.",
    );
  }
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: "Higgsfield не принял ключ. Проверь ID и secret в секрете higgs_api.",
      402: "Недостаточно средств на балансе Higgsfield.",
      403: "Для этого ключа Higgsfield нет доступа к генерации.",
      404: body ? "Модель недоступна для этого аккаунта Higgsfield." : "Запрос Higgsfield не найден или срок его хранения истёк.",
      422: "Higgsfield не принял фото или параметры. Попробуй другое фото.",
      423: "Модель Higgsfield временно недоступна.",
      429: "Лимит запросов Higgsfield достигнут. Попробуй позже.",
    };
    throw new VideoProviderError(messages[response.status] ?? "Ошибка Higgsfield. Проверь запрос в Console и попробуй позже.");
  }
  try {
    return record(await response.json());
  } catch (error) {
    if (error instanceof VideoProviderError) throw error;
    throw new VideoProviderError("Не удалось прочитать ответ Higgsfield. Проверь статус позже.");
  }
}

async function uploadPhoto(credentials: string, bytes: Buffer, mimeType: string): Promise<string> {
  // Keep the photo in the provider's temporary media storage, not in application logs or a database.
  const upload = await apiRequest("/files/generate-upload-url", credentials, { content_type: mimeType });
  const uploadUrl = httpsUrl(upload.upload_url);
  const publicUrl = httpsUrl(upload.public_url);
  const returnedHeaders = record(upload.upload_headers);
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(returnedHeaders)) {
    if (typeof value !== "string" || /^(authorization|cookie|host)$/i.test(name)) {
      throw new VideoProviderError("Higgsfield вернул некорректные параметры загрузки.");
    }
    headers[name] = value;
  }
  try {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      // Only presigned-upload headers go to storage. Never send Higgsfield credentials here.
      headers,
      body: new Blob([Uint8Array.from(bytes)], { type: mimeType }),
      signal: AbortSignal.timeout(60000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Upload rejected");
  } catch {
    throw new VideoProviderError("Не удалось загрузить фото в Higgsfield. Попробуй позже.");
  }
  return publicUrl;
}

/** Shared upload boundary; credentials and storage handles never leave the server. */
export async function uploadGenerationMedia(bytes: Buffer, mimeType: string): Promise<string> {
  return uploadPhoto(getCredentials(), bytes, mimeType);
}

export async function submitLightSwapper(
  model: string, input: { video_url: string; image_urls: string[]; prompt: string; resolution: string },
): Promise<{ requestId: string }> {
  if (!["higgsfield/genjutsu-light/motion-transfer/v1.0", "higgsfield/genjutsu-light/object-swap/v1.0"].includes(model)) {
    throw new VideoProviderError("Неподдерживаемая модель.");
  }
  const credentials = getCredentials();
  try {
    const queued = await apiRequest(`/${model}`, credentials, input);
    if (typeof queued.request_id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(queued.request_id)) {
      throw new VideoSubmissionUnknownError();
    }
    return { requestId: queued.request_id };
  } catch { throw new VideoSubmissionUnknownError(); }
}

export async function submitDanceVideo(input: VideoGenerationInput): Promise<{
  requestId: string;
}> {
  const credentials = getCredentials();
  const { bytes, mimeType } = decodeImageDataUrl(input.imageDataUrl);
  const imageUrl = await uploadPhoto(credentials, bytes, mimeType);
  const prompt = [
    "Animate the person in the supplied full-body photo as the only dancer.",
    stylePrompts[input.styleId],
    "Keep the person's identity, clothing, body proportions, and background consistent with the reference image.",
    "Show the full body throughout the vertical video; use natural, anatomically correct movement and smooth continuous choreography.",
    "One dancer only, fixed camera, no cuts, no extra people, no text, no logos.",
  ].join(" ");
  // Everything before this point is a proven pre-submission failure. Once the
  // paid POST starts, even a transport/response error cannot prove non-acceptance.
  try {
    const queued = await apiRequest(VIDEO_ENDPOINT, credentials, {
      image_url: imageUrl,
      prompt,
      duration: input.duration,
      resolution: "720p",
      generate_audio: false,
      negative_prompt:
        "extra limbs, extra people, face changes, identity changes, warped hands, distorted body, camera cuts, blurry image, text, logos",
    });
    if (typeof queued.request_id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(queued.request_id)) {
      throw new VideoSubmissionUnknownError();
    }
    return { requestId: queued.request_id };
  } catch {
    throw new VideoSubmissionUnknownError();
  }
}

export async function getDanceVideoStatus(requestId: string): Promise<{
  requestId: string;
  status: "queued" | "processing" | "completed" | "failed";
  videoUrl: string | null;
  error: string | null;
  queuePosition: number | null;
}> {
  const credentials = getCredentials();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(requestId)) {
    throw new VideoProviderError("Некорректный номер запроса Higgsfield.");
  }
  // Canonical status endpoint documented in Higgsfield's REST quickstart; survives server restarts.
  const result = await apiRequest(`/requests/${encodeURIComponent(requestId)}/status`, credentials);
  const base = { requestId, videoUrl: null, error: null, queuePosition: null };
  switch (result.status) {
    case "queued": return { ...base, status: "queued" };
    case "in_progress": return { ...base, status: "processing" };
    case "completed": return { ...base, status: "completed", videoUrl: httpsUrl(record(result.video).url) };
    case "nsfw": return { ...base, status: "failed", error: "Фото или видео отклонено модерацией Higgsfield. Выбери другое фото." };
    case "canceled": return { ...base, status: "failed", error: "Генерация отменена в Higgsfield." };
    case "failed": return { ...base, status: "failed", error: "Higgsfield не смог создать видео. Проверь запрос в Console перед повтором." };
    default: throw new VideoProviderError("Неизвестный статус Higgsfield. Проверь генерацию позже.");
  }
}
