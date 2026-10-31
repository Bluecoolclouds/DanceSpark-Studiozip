import "./helpers/setup.mjs";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { beforeEach, test } from "node:test";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  allowedTemplateFile, readTemplate, saveTemplate, validTemplateBytes,
} from "../src/lib/template-storage";

beforeEach(() => {
  process.env.CLOUDFLARE_R2_ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
  process.env.CLOUDFLARE_R2_BUCKET_NAME = "danceflow-media-test";
  process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = "synthetic-access-key";
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = "synthetic-secret-key";
});

test("media allowlist rejects unknown IDs and arbitrary object paths", () => {
  assert.equal(allowedTemplateFile("trend-01", "poster.jpg"), true);
  assert.equal(allowedTemplateFile("../private", "poster.jpg"), false);
  assert.equal(allowedTemplateFile("trend-01", "../private.jpg"), false);
});

test("concurrent R2 reads have independent lifecycles and pin the object version", async (t) => {
  const media = Buffer.from("sample media");
  let reads = 0;
  t.mock.method(S3Client.prototype, "send", async (command: any) => {
    assert.ok(command instanceof GetObjectCommand);
    assert.equal(command.input.IfMatch, '"current"');
    reads++;
    return { Body: Readable.from([media]) };
  });
  const [first, second] = await Promise.all([
    readTemplate("trend-01", "poster.jpg", '"current"'),
    readTemplate("trend-01", "poster.jpg", '"current"'),
  ]);
  try {
    (first.result.Body as Readable).destroy();
    const chunks: Buffer[] = [];
    for await (const chunk of second.result.Body as Readable) chunks.push(Buffer.from(chunk));
    assert.deepEqual(Buffer.concat(chunks), media);
    assert.equal(reads, 2);
  } finally { first.dispose(); second.dispose(); }
});

test("uploads only validated media to its fixed R2 object key", async (t) => {
  const media = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
  let saved: { key?: string; bucket?: string; contentType?: string; body?: Buffer } = {};
  t.mock.method(S3Client.prototype, "send", async (command: any) => {
    assert.ok(command instanceof PutObjectCommand);
    saved = {
      key: command.input.Key, bucket: command.input.Bucket,
      contentType: command.input.ContentType, body: command.input.Body,
    };
    return {};
  });
  await saveTemplate("trend-02", "poster.jpg", media);
  assert.deepEqual(saved, {
    key: "dance-templates/trend-02/poster.jpg", bucket: "danceflow-media-test",
    contentType: "image/jpeg", body: media,
  });
});

test("rejects mismatched formats, oversized uploads and unsafe paths before R2", async (t) => {
  let writes = 0;
  t.mock.method(S3Client.prototype, "send", async () => { writes++; return {}; });
  await assert.rejects(saveTemplate("trend-03", "poster.jpg", Buffer.from("ftyp video")));
  await assert.rejects(saveTemplate("trend-03", "poster.jpg", Buffer.alloc(10 * 1024 * 1024 + 1)));
  await assert.rejects(saveTemplate("../outside", "poster.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0])));
  assert.equal(writes, 0);
});

test("rejects empty and truncated signatures without writing an object", async (t) => {
  let writes = 0;
  t.mock.method(S3Client.prototype, "send", async () => { writes++; return {}; });
  assert.equal(validTemplateBytes("poster.jpg", Buffer.from([0xff, 0xd8, 0xff])), false);
  await assert.rejects(saveTemplate("trend-04", "poster.jpg", Buffer.alloc(0)));
  await assert.rejects(saveTemplate("trend-04", "video.mp4", Buffer.from("ftyp")));
  assert.equal(writes, 0);
});
