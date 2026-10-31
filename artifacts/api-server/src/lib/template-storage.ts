import { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

// A fixed namespace, never a client-provided object path.
export const templateIds = new Set(["trend-01", "trend-02", "trend-03", "trend-04", "trend-05", "trend-06"]);
export const templateAssets = new Set([
  "video.mp4", "preview.mp4", "preview.webm", "poster.jpg",
  "character-01.jpg", "character-02.jpg", "reference-poster.jpg",
  "result.mp4", "result-preview.mp4", "result.webm",
]);
export const templateMime = (asset: string) =>
  asset.endsWith(".webm") ? "video/webm" : asset.endsWith(".mp4") ? "video/mp4" : "image/jpeg";
export const templateLimit = (asset: string) => asset.endsWith(".jpg") ? 10 * 1024 * 1024 : 100 * 1024 * 1024;
export const allowedTemplateFile = (id: string, asset: string) => templateIds.has(id) && templateAssets.has(asset);

export class TemplateStorageConfigurationError extends Error {
  constructor() { super("R2 storage is not configured"); }
}

function storage() {
  const account = process.env.CLOUDFLARE_R2_ACCOUNT_ID?.trim();
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME?.trim();
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  if (!account || !/^[a-f0-9]{32}$/.test(account) || !bucket ||
      !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) || !accessKeyId || !secretAccessKey) {
    throw new TemplateStorageConfigurationError();
  }
  return {
    bucket,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${account}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
      maxAttempts: 2,
      requestHandler: { connectionTimeout: 5000, requestTimeout: 60000 },
    }),
  };
}

function key(id: string, asset: string) {
  if (!allowedTemplateFile(id, asset)) throw new Error("Invalid catalogue media");
  return `dance-templates/${id}/${asset}`;
}

export async function templateMetadata(id: string, asset: string) {
  const Key = key(id, asset);
  const { client, bucket } = storage();
  try {
    return await client.send(new HeadObjectCommand({ Bucket: bucket, Key }));
  } finally { client.destroy(); }
}

export async function readTemplate(id: string, asset: string, etag: string, range?: string, abortSignal?: AbortSignal) {
  const Key = key(id, asset);
  const { client, bucket } = storage();
  try {
    const result = await client.send(new GetObjectCommand({
      Bucket: bucket, Key, IfMatch: etag, Range: range,
    }), { abortSignal });
    // The caller owns the body until pipeline completes, including client cancellation.
    return { result, dispose: () => client.destroy() };
  } catch (error) { client.destroy(); throw error; }
}

export function validTemplateBytes(asset: string, body: Buffer) {
  if (!body.length || body.length > templateLimit(asset)) return false;
  if (asset.endsWith(".jpg")) return body.length >= 4 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  if (asset.endsWith(".webm")) return body.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  return body.length >= 12 && body.toString("ascii", 4, 8) === "ftyp";
}

export async function saveTemplate(id: string, asset: string, body: Buffer) {
  const Key = key(id, asset);
  if (!validTemplateBytes(asset, body)) throw new Error("Invalid media content");
  const { client, bucket } = storage();
  try {
    // R2 PUT replaces a single object atomically. No delete/list/arbitrary-key API.
    return await client.send(new PutObjectCommand({
      Bucket: bucket, Key, Body: body, ContentLength: body.length,
      ContentType: templateMime(asset), CacheControl: "public, max-age=0, must-revalidate",
    }));
  } finally { client.destroy(); }
}

export function storageStatus(error: unknown): number | undefined {
  return (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
}
