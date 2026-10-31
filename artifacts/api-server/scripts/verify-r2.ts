// Opt-in operator smoke test. Never runs in the offline unit suite.
// Usage: pnpm --filter @workspace/api-server exec tsx scripts/verify-r2.ts https://<dev-host>/api --temporary-upload
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { templateMetadata, saveTemplate, storageStatus } from "../src/lib/template-storage";

const root = process.argv[2]?.replace(/\/$/, "");
if (!root || process.argv[3] !== "--temporary-upload") {
  throw new Error("Supply API URL and --temporary-upload; this writes and removes one temporary test video.");
}
const id = "trend-06", asset = "result-preview.mp4";
const directory = await mkdtemp(join(tmpdir(), "danceflow-r2-smoke-"));
let ownedEtag: string | undefined;
let client: S3Client | undefined;
let failed = false;
try {
  let missing = false;
  try { await templateMetadata(id, asset); } catch (error) {
    if (storageStatus(error) !== 404) throw error;
    missing = true;
  }
  assert.ok(missing, "Smoke slot already contains media; refusing to overwrite it");
  const path = join(directory, "sample.mp4");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
    "color=c=black:s=160x160:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path]);
  const body = await readFile(path);
  client = new S3Client({
    region: "auto", endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!, secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY! },
  });
  const target = { Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!, Key: `dance-templates/${id}/${asset}` };
  const created = await client.send(new PutObjectCommand({
    ...target, Body: body, ContentType: "video/mp4", IfNoneMatch: "*",
  }));
  ownedEtag = created.ETag;
  assert.ok(ownedEtag);
  const saved = await saveTemplate(id, asset, body);
  ownedEtag = saved.ETag;
  assert.ok(ownedEtag);
  const url = `${root}/dance-templates/${id}/${asset}`;
  const full = await fetch(url);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("content-type"), "video/mp4");
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), body);
  const partial = await fetch(url, { headers: { Range: "bytes=0-31" } });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("content-range"), `bytes 0-31/${body.length}`);
  assert.deepEqual(Buffer.from(await partial.arrayBuffer()), body.subarray(0, 32));
  const suffix = await fetch(url, { headers: { Range: "bytes=-16" } });
  assert.equal(suffix.status, 206);
  assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), body.subarray(-16));
  const head = await fetch(url, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), String(body.length));
  const unchanged = await fetch(url, { headers: { "If-None-Match": ownedEtag, "Cache-Control": "max-age=0" } });
  assert.equal(unchanged.status, 304);
  const abort = new AbortController();
  const cancelled = fetch(url, { signal: abort.signal }).catch(() => undefined);
  abort.abort(); await cancelled;
  await Promise.all(Array.from({ length: 3 }, async () => {
    const response = await fetch(url, { headers: { Range: "bytes=0-15" } });
    assert.equal(response.status, 206); await response.arrayBuffer();
  }));
  console.log("R2 smoke passed: upload, replacement, full read, HEAD, byte ranges, ETag and concurrent requests.");
} catch {
  // Never print a raw SDK error: it may contain credentials or signed requests.
  failed = true;
  console.error("R2 smoke failed. Check R2 configuration, permissions, empty smoke slot and running API.");
} finally {
  if (client && ownedEtag) {
    try {
      await client.send(new DeleteObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!, Key: `dance-templates/${id}/${asset}`,
        IfMatch: ownedEtag,
      }));
      console.log("Temporary smoke object removed.");
    } catch {
      failed = true;
      console.error("Cleanup was not confirmed; inspect dance-templates/trend-06/result-preview.mp4 before retrying.");
    }
  }
  client?.destroy();
  await rm(directory, { recursive: true, force: true });
}
if (failed) process.exitCode = 1;
