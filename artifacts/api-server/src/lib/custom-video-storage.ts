import { createHash } from "node:crypto";
import {
  S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import { MAX_CUSTOM_VIDEO_BYTES } from "./custom-video-validation";

const validId = (id: string) => /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id);

export class CustomVideoStorageError extends Error {
  constructor(public readonly code: "source_storage_unavailable" | "source_video_not_found") {
    super(code);
    this.name = "CustomVideoStorageError";
  }
}

function storage() {
  const account = process.env.CLOUDFLARE_R2_ACCOUNT_ID?.trim();
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME?.trim();
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  if (!account || !/^[a-f0-9]{32}$/.test(account) || !bucket ||
      !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) || !accessKeyId || !secretAccessKey) {
    throw new CustomVideoStorageError("source_storage_unavailable");
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

function objectKey(ownerId: string, sourceVideoId: string) {
  if (!ownerId || !validId(sourceVideoId)) throw new Error("Invalid owned video identifier");
  const ownerScope = createHash("sha256").update(ownerId).digest("hex");
  return `danceflow-user-videos/${ownerScope}/${sourceVideoId}.mp4`;
}

export async function saveOwnedCustomVideo(ownerId: string, sourceVideoId: string, bytes: Buffer) {
  const Key = objectKey(ownerId, sourceVideoId);
  const { client, bucket } = storage();
  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket, Key, Body: bytes, ContentLength: bytes.length,
      ContentType: "video/mp4", CacheControl: "private, no-store",
    }));
  } finally { client.destroy(); }
}

export async function readOwnedCustomVideo(ownerId: string, sourceVideoId: string): Promise<Buffer> {
  const Key = objectKey(ownerId, sourceVideoId);
  const { client, bucket } = storage();
  try {
    let head;
    try {
      head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key }));
    } catch (error) {
      const code = (error as { name?: string; $metadata?: { httpStatusCode?: number } })?.name;
      const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      throw new CustomVideoStorageError(code === "NotFound" || code === "NoSuchKey" || status === 404
        ? "source_video_not_found" : "source_storage_unavailable");
    }
    if (!head.ETag || head.ContentType !== "video/mp4" ||
        !Number.isSafeInteger(head.ContentLength) || !head.ContentLength ||
        head.ContentLength > MAX_CUSTOM_VIDEO_BYTES) {
      throw new CustomVideoStorageError("source_video_not_found");
    }
    const result = await client.send(new GetObjectCommand({
      Bucket: bucket, Key, IfMatch: head.ETag,
    }), { abortSignal: AbortSignal.timeout(60000) });
    const body = result.Body as Readable | undefined;
    if (!body) throw new CustomVideoStorageError("source_video_not_found");
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of body) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_CUSTOM_VIDEO_BYTES) throw new CustomVideoStorageError("source_video_not_found");
      chunks.push(bytes);
    }
    if (size !== head.ContentLength) throw new CustomVideoStorageError("source_video_not_found");
    return Buffer.concat(chunks);
  } catch (error) {
    if (error instanceof CustomVideoStorageError) throw error;
    throw new CustomVideoStorageError("source_storage_unavailable");
  } finally { client.destroy(); }
}
