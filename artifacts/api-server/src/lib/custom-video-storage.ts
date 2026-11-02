import { createHash } from "node:crypto";
import {
  S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { pool } from "@workspace/db";
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

export function ownedVideoPrefix(ownerId: string) {
  if (!ownerId) throw new Error("Owned video scope required");
  return `danceflow-user-videos/${createHash("sha256").update(ownerId).digest("hex")}/`;
}

export function isOwnedSourceKey(ownerId: string, key: string) {
  const prefix = ownedVideoPrefix(ownerId);
  return key.startsWith(prefix) && /^[a-f0-9-]{36}\.mp4$/i.test(key.slice(prefix.length)) &&
    validId(key.slice(prefix.length, -4));
}

function objectKey(ownerId: string, sourceVideoId: string) {
  if (!ownerId || !validId(sourceVideoId)) throw new Error("Invalid owned video identifier");
  return `${ownedVideoPrefix(ownerId)}${sourceVideoId}.mp4`;
}

export async function saveOwnedCustomVideo(ownerId: string, sourceVideoId: string, bytes: Buffer) {
  const Key = objectKey(ownerId, sourceVideoId);
  const { client, bucket } = storage();
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    const account = (await connection.query(
      "SELECT blocked,deletion_requested_at FROM df_accounts WHERE id=$1 FOR UPDATE", [ownerId],
    )).rows[0];
    if (!account || account.blocked || account.deletion_requested_at) throw new CustomVideoStorageError("source_storage_unavailable");
    await client.send(new PutObjectCommand({
      Bucket: bucket, Key, Body: bytes, ContentLength: bytes.length,
      ContentType: "video/mp4", CacheControl: "private, no-store",
    }));
    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally { connection.release(); client.destroy(); }
}

/**
 * Private namespace only. `before` is used by retention; absent means explicit
 * account deletion. Verify every returned key before sending a delete batch.
 * Do not add a bucket-wide lifecycle rule: catalogue media shares this bucket.
 */
export async function deleteOwnedCustomVideos(ownerId: string, before?: Date): Promise<void> {
  const { client, bucket } = storage();
  try {
    let continuation: string | undefined;
    do {
      const page = await client.send(new ListObjectsV2Command({
        Bucket: bucket, Prefix: ownedVideoPrefix(ownerId), MaxKeys: 500,
        ContinuationToken: continuation,
      }));
      const objects = (page.Contents ?? []).filter(object => {
        if (!object.Key || !isOwnedSourceKey(ownerId, object.Key)) throw new Error("Unexpected private media key");
        return !before || (object.LastModified && object.LastModified < before);
      });
      if (objects.length) {
        const response = await client.send(new DeleteObjectsCommand({
          Bucket: bucket, Delete: { Objects: objects.map(object => ({ Key: object.Key! })), Quiet: true },
        }));
        if (response.Errors?.length) throw new Error("Private media cleanup incomplete");
      }
      continuation = page.IsTruncated ? page.NextContinuationToken : undefined;
      if (page.IsTruncated && !continuation) throw new Error("Private media cleanup pagination incomplete");
    } while (continuation);
    if (!before) {
      const remaining = await client.send(new ListObjectsV2Command({
        Bucket: bucket, Prefix: ownedVideoPrefix(ownerId), MaxKeys: 1,
      }));
      if (remaining.Contents?.length) throw new Error("Private media cleanup not yet confirmed");
    }
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
