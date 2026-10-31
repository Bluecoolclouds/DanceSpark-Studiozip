import "./helpers/setup.mjs";
import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { beforeEach, test } from "node:test";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  cachedTemplateFile,
  isAllowedTemplateAsset,
  TemplateMediaError,
  uploadTemplateFile,
} from "../src/lib/template-storage.ts";

beforeEach(() => {
  process.env.CLOUDFLARE_R2_ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
  process.env.CLOUDFLARE_R2_BUCKET_NAME = "danceflow-media-test";
  process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = "synthetic-access-key";
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = "synthetic-secret-key";
});

test("media allowlist rejects unknown IDs and arbitrary object paths", () => {
  assert.equal(isAllowedTemplateAsset("trend-01", "poster.jpg"), true);
  assert.equal(isAllowedTemplateAsset("../private", "poster.jpg"), false);
  assert.equal(isAllowedTemplateAsset("trend-01", "../private.jpg"), false);
});

test("concurrent media reads share an independent local cache", async (t) => {
  const media = Buffer.from("sample media");
  let reads = 0;
  t.mock.method(S3Client.prototype, "send", async (command) => {
    assert.ok(command instanceof GetObjectCommand);
    reads += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { Body: Readable.from([media]) };
  });

  const [first, second] = await Promise.all([
    cachedTemplateFile("trend-01", "poster.jpg"),
    cachedTemplateFile("trend-01", "poster.jpg"),
  ]);
  assert.equal(first.path, second.path);
  assert.deepEqual(await readFile(first.path), media);
  assert.equal(reads, 1);

  const abandonedResponse = createReadStream(first.path);
  abandonedResponse.destroy();
  const subsequent = await cachedTemplateFile("trend-01", "poster.jpg");
  assert.equal(subsequent.path, first.path);
  assert.equal(reads, 1);
});

test("uploads only validated media to its fixed R2 object key", async (t) => {
  const media = Buffer.from("replacement poster");
  let saved: { key?: string; bucket?: string; contentType?: string; body?: Buffer } = {};
  t.mock.method(S3Client.prototype, "send", async (command) => {
    assert.ok(command instanceof PutObjectCommand);
    saved.key = command.input.Key;
    saved.bucket = command.input.Bucket;
    saved.contentType = command.input.ContentType;
    const chunks: Buffer[] = [];
    for await (const chunk of command.input.Body as AsyncIterable<Buffer>) {
      chunks.push(Buffer.from(chunk));
    }
    saved.body = Buffer.concat(chunks);
    return {};
  });

  await uploadTemplateFile(
    "trend-02",
    "poster.jpg",
    Readable.from([media]),
    media.length,
    "image/jpeg",
  );
  assert.deepEqual(saved, {
    key: "dance-templates/trend-02/poster.jpg",
    bucket: "danceflow-media-test",
    contentType: "image/jpeg",
    body: media,
  });
});

test("rejects mismatched types, oversized uploads, and unsafe object paths before R2", async (t) => {
  let writes = 0;
  t.mock.method(S3Client.prototype, "send", async () => {
    writes += 1;
    return {};
  });

  await assert.rejects(
    uploadTemplateFile("trend-03", "poster.jpg", Readable.from(["x"]), 1, "video/mp4"),
    (error: unknown) => error instanceof TemplateMediaError && error.statusCode === 415,
  );
  await assert.rejects(
    uploadTemplateFile("trend-03", "poster.jpg", Readable.from(["x"]), 257 * 1024 * 1024, "image/jpeg"),
    (error: unknown) => error instanceof TemplateMediaError && error.statusCode === 413,
  );
  await assert.rejects(
    uploadTemplateFile("../outside", "poster.jpg", Readable.from(["x"]), 1, "image/jpeg"),
    (error: unknown) => error instanceof TemplateMediaError && error.statusCode === 404,
  );
  assert.equal(writes, 0);
});

test("rejects a truncated request stream without writing the object", async (t) => {
  let writes = 0;
  t.mock.method(S3Client.prototype, "send", async () => {
    writes += 1;
    return {};
  });

  await assert.rejects(
    uploadTemplateFile("trend-04", "poster.jpg", Readable.from(["short"]), 20, "image/jpeg"),
    /Content-Length/,
  );
  assert.equal(writes, 0);
});
