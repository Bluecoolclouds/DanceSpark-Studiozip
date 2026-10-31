import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const templateIds = new Set([
  "trend-01",
  "trend-02",
  "trend-03",
  "trend-04",
  "trend-05",
  "trend-06",
]);
const templateAssets = new Set([
  "video.mp4",
  "preview.mp4",
  "preview.webm",
  "poster.jpg",
  "character-01.jpg",
  "character-02.jpg",
  "reference-poster.jpg",
  "result.mp4",
  "result-preview.mp4",
  "result.webm",
]);
const maxTemplateMediaBytes = 256 * 1024 * 1024;
const cacheTtlMs = 60_000;
const cacheDir = mkdtemp(join(tmpdir(), "danceflow-r2-media-"));
const downloads = new Map<
  string,
  { promise: Promise<{ path: string; size: number }>; expiresAt: number }
>();
const objectVersions = new Map<string, number>();
let s3Client: S3Client | undefined;

export class TemplateMediaError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "TemplateMediaError";
  }
}

export function isAllowedTemplateAsset(id: string, asset: string): boolean {
  return templateIds.has(id) && templateAssets.has(asset);
}

function assertAllowedTemplateAsset(id: string, asset: string): void {
  if (!isAllowedTemplateAsset(id, asset)) {
    throw new TemplateMediaError("Недопустимый файл каталога", 404);
  }
}

function getBucketName(): string {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME?.trim();
  if (!bucket) {
    throw new TemplateMediaError("Cloudflare R2 не настроен", 503);
  }
  return bucket;
}

function getS3Client(): S3Client {
  if (s3Client) return s3Client;

  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim();
  if (
    !accountId ||
    !/^[a-f0-9]{32}$/i.test(accountId) ||
    !accessKeyId ||
    !secretAccessKey
  ) {
    throw new TemplateMediaError("Cloudflare R2 не настроен", 503);
  }

  s3Client = new S3Client({
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    region: "auto",
    credentials: { accessKeyId, secretAccessKey },
  });
  return s3Client;
}

function objectKey(id: string, asset: string): string {
  assertAllowedTemplateAsset(id, asset);
  return `dance-templates/${id}/${asset}`;
}

function cacheKey(id: string, asset: string): string {
  return `${id}-${asset}`;
}

async function downloadTemplateFile(
  id: string,
  asset: string,
  version: number,
): Promise<{ path: string; size: number }> {
  const bucket = getBucketName();
  const key = objectKey(id, asset);
  const directory = await cacheDir;
  const path = join(directory, cacheKey(id, asset));
  const temporaryPath = join(directory, `${cacheKey(id, asset)}-${crypto.randomUUID()}.tmp`);

  try {
    const response = await getS3Client().send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!response.Body) throw new Error("R2 returned an empty media body");
    await pipeline(
      response.Body as Readable,
      createWriteStream(temporaryPath, { flags: "wx" }),
    );
    const { size } = await stat(temporaryPath);
    if (!Number.isSafeInteger(size) || size <= 0) {
      throw new Error("R2 returned an invalid media size");
    }

    if ((objectVersions.get(cacheKey(id, asset)) ?? 0) !== version) {
      await rm(temporaryPath, { force: true });
      return cachedTemplateFile(id, asset);
    }

    await rename(temporaryPath, path);
    return { path, size };
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

/**
 * Read-through cache keeps client cancellations away from the remote R2 stream.
 * A client only ever streams the completed local cache file.
 */
export function cachedTemplateFile(id: string, asset: string) {
  objectKey(id, asset);
  const cacheId = cacheKey(id, asset);
  const cached = downloads.get(cacheId);
  if (cached && (!cached.expiresAt || cached.expiresAt > Date.now())) {
    return cached.promise;
  }
  downloads.delete(cacheId);

  const version = objectVersions.get(cacheId) ?? 0;
  let entry: { promise: Promise<{ path: string; size: number }>; expiresAt: number };
  const promise = downloadTemplateFile(id, asset, version).then(
    (file) => {
      if (downloads.get(cacheId) === entry) {
        entry.expiresAt = Date.now() + cacheTtlMs;
      }
      return file;
    },
    (error: unknown) => {
      if (downloads.get(cacheId) === entry) downloads.delete(cacheId);
      throw error;
    },
  );
  entry = { promise, expiresAt: 0 };
  downloads.set(cacheId, entry);
  return promise;
}

export async function uploadTemplateFile(
  id: string,
  asset: string,
  body: NodeJS.ReadableStream,
  declaredSize: number,
  contentType: string,
): Promise<void> {
  const key = objectKey(id, asset);
  const expectedContentType = asset.endsWith(".webm")
    ? "video/webm"
    : asset.endsWith(".mp4")
      ? "video/mp4"
      : "image/jpeg";
  if (contentType.toLowerCase() !== expectedContentType) {
    throw new TemplateMediaError("Тип файла не соответствует расширению", 415);
  }
  if (!Number.isSafeInteger(declaredSize) || declaredSize <= 0) {
    throw new TemplateMediaError("Нужно указать корректный размер файла", 411);
  }
  if (declaredSize > maxTemplateMediaBytes) {
    throw new TemplateMediaError("Файл слишком большой (максимум 256 МБ)", 413);
  }

  const directory = await mkdtemp(join(tmpdir(), "danceflow-r2-upload-"));
  const path = join(directory, "upload");
  let receivedSize = 0;
  const sizeLimit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      receivedSize += chunk.length;
      if (receivedSize > declaredSize || receivedSize > maxTemplateMediaBytes) {
        callback(new TemplateMediaError("Размер файла превышен", 413));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(body, sizeLimit, createWriteStream(path, { flags: "wx" }));
    if (receivedSize !== declaredSize) {
      throw new TemplateMediaError("Размер файла не совпадает с Content-Length", 400);
    }

    await getS3Client().send(
      new PutObjectCommand({
        Bucket: getBucketName(),
        Key: key,
        Body: createReadStream(path),
        ContentLength: receivedSize,
        ContentType: expectedContentType,
        CacheControl: "public, max-age=60",
      }),
    );

    const cacheId = cacheKey(id, asset);
    objectVersions.set(cacheId, (objectVersions.get(cacheId) ?? 0) + 1);
    downloads.delete(cacheId);
    await rm(join(await cacheDir, cacheId), { force: true });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
