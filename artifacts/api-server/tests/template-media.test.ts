import "./helpers/setup.mjs";
import assert from "node:assert/strict";
import { beforeEach, afterEach, mock, test } from "node:test";
import express from "express";
import { Readable } from "node:stream";
import type { AddressInfo } from "node:net";
import { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import publicRouter from "../src/routes/dance-template-media";
import adminRouter from "../src/routes/admin-template-media";
import app from "../src/app";
import { isolatedDatabase } from "./helpers/database";
import { logger } from "../src/lib/logger";
import { saveTemplate, templateMetadata, TemplateStorageConfigurationError } from "../src/lib/template-storage";

const pool = isolatedDatabase();
const original = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(20)]);
let data: Buffer | undefined;
let version = 0;
const calls: { name: string; input: any }[] = [];
beforeEach(async () => {
  process.env.CLOUDFLARE_R2_ACCOUNT_ID = "a".repeat(32);
  process.env.CLOUDFLARE_R2_BUCKET_NAME = "catalogue-test";
  process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = "synthetic-id";
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = "synthetic-secret";
  data = original; version = 1; calls.length = 0;
  await pool.query("TRUNCATE df_admin_audit,df_jobs,df_accounts,df_controls");
  await pool.query("INSERT INTO df_accounts(id,email,role) VALUES('owner','owner@example.invalid','admin')");
  mock.method(S3Client.prototype, "send", async (command: any) => {
    calls.push({ name: command.constructor.name, input: command.input });
    assert.equal(command.input.Bucket, "catalogue-test");
    assert.match(command.input.Key, /^dance-templates\/trend-0[1-6]\/(video\.mp4|poster\.jpg)$/);
    if (command instanceof PutObjectCommand) {
      data = Buffer.from(command.input.Body); version++;
      return { ETag: `"v${version}"` };
    }
    if (!data) throw { $metadata: { httpStatusCode: 404 } };
    if (command instanceof HeadObjectCommand) return {
      ContentLength: data.length, ETag: `"v${version}"`, LastModified: new Date("2026-01-01"),
    };
    assert.ok(command instanceof GetObjectCommand);
    assert.equal(command.input.IfMatch, `"v${version}"`);
    const range = command.input.Range?.match(/^bytes=(\d+)-(\d+)$/);
    return { Body: Readable.from(range ? data.subarray(Number(range[1]), Number(range[2]) + 1) : data) };
  });
});
afterEach(() => mock.restoreAll());

async function serve(application: express.Express, work: (root: string) => Promise<void>) {
  const server = application.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try { await work(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}
function publicApp() {
  const application = express();
  application.use((req, _res, next) => { req.log = logger; next(); });
  application.use(publicRouter);
  return application;
}
function uploadHarness() {
  // Only route handlers, never a production auth bypass.
  const layer = (adminRouter as any).stack.find((l: any) => l.route?.path === "/admin/dance-templates/:id/:asset");
  const handlers = layer.route.stack.slice(3).map((l: any) => l.handle);
  const application = publicApp();
  application.put("/admin/dance-templates/:id/:asset", (_req, res, next) => {
    res.locals.account = { id: "owner" }; next();
  }, ...handlers);
  return application;
}

test("full, HEAD, bounded/open/suffix ranges, validators and If-Range use correct bytes", async () => {
  await serve(publicApp(), async (root) => {
    const url = `${root}/dance-templates/trend-01/video.mp4`;
    const full = await fetch(url);
    assert.equal(full.status, 200);
    assert.equal(full.headers.get("content-type"), "video/mp4");
    assert.match(full.headers.get("cache-control")!, /must-revalidate/);
    assert.equal(full.headers.get("accept-ranges"), "bytes");
    assert.deepEqual(Buffer.from(await full.arrayBuffer()), original);
    const head = await fetch(url, { method: "HEAD" });
    assert.equal(head.headers.get("content-length"), String(original.length));
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    for (const [range, start, end] of [["bytes=2-7", 2, 7], ["bytes=20-", 20, 31], ["bytes=-4", 28, 31], ["bytes=0-999", 0, 31]] as const) {
      const response = await fetch(url, { headers: { Range: range } });
      assert.equal(response.status, 206);
      assert.equal(response.headers.get("content-range"), `bytes ${start}-${end}/32`);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), original.subarray(start, end + 1));
    }
    const unchanged = await fetch(url, { headers: { "If-None-Match": '"v1"', "Cache-Control": "max-age=0" } });
    assert.equal(unchanged.status, 304);
    const staleRange = await fetch(url, { headers: { Range: "bytes=1-2", "If-Range": '"old"' } });
    assert.equal(staleRange.status, 200);
    await staleRange.arrayBuffer();
    for (const range of ["bytes=-0", "bytes=-", "bytes=32-", "bytes=4-2", "bytes=1-2,4-5", "bytes=9007199254740992-", "items=0-2"]) {
      const response = await fetch(url, { headers: { Range: range } });
      assert.equal(response.status, 416, range);
      assert.equal(response.headers.get("content-range"), "bytes */32");
    }
  });
});

test("allowlist, missing file and missing configuration fail without exposing provider details", async () => {
  await assert.rejects(templateMetadata("../other", "video.mp4"));
  await assert.rejects(saveTemplate("trend-01", "../secret", original));
  assert.equal(calls.length, 0);
  await serve(publicApp(), async (root) => {
    assert.equal((await fetch(`${root}/dance-templates/trend-99/video.mp4`)).status, 404);
    data = undefined;
    assert.equal((await fetch(`${root}/dance-templates/trend-01/poster.jpg`)).status, 404);
    delete process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
    const response = await fetch(`${root}/dance-templates/trend-01/video.mp4`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "r2_not_configured");
    assert.equal(response.headers.get("cache-control"), "no-store");
    await assert.rejects(templateMetadata("trend-01", "video.mp4"), TemplateStorageConfigurationError);
  });
});

test("PUT creates/replaces atomically and reads reflect replacement rather than a local stale cache", async () => {
  await saveTemplate("trend-01", "video.mp4", original);
  const replacement = Buffer.concat([original, Buffer.from("replacement")]);
  await saveTemplate("trend-01", "video.mp4", replacement);
  assert.equal(calls.filter((c) => c.name === "PutObjectCommand").length, 2);
  assert.equal(calls[0].input.ContentType, "video/mp4");
  await serve(publicApp(), async (root) => {
    const response = await fetch(`${root}/dance-templates/trend-01/video.mp4`, { headers: { "If-None-Match": '"v1"' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("etag"), '"v3"');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), replacement);
  });
});

test("production mount rejects anonymous/forged uploads before storage or body parsing", async () => {
  await serve(app, async (root) => {
    for (const headers of [{}, { Authorization: "Bearer fabricated.invalid.token" }]) {
      const response = await fetch(`${root}/api/admin/dance-templates/trend-01/video.mp4`, {
        method: "PUT", headers: { ...headers, "Content-Type": "video/mp4" }, body: original,
      });
      assert.equal(response.status, 401);
    }
    assert.equal(calls.length, 0);
  });
});

test("upload middleware rejects wrong formats, keys, oversized bodies and releases its slot", async () => {
  // Handler harness only: real identity/role/CSRF gates are tested at the production mount above
  // and by admin-governance.test.ts. Never install a bypass in application code.
  const application = uploadHarness();
  await serve(application, async (root) => {
    const url = `${root}/admin/dance-templates/trend-01/video.mp4`;
    assert.equal((await fetch(url, { method: "PUT", headers: { "Content-Type": "text/plain" }, body: original })).status, 415);
    assert.equal((await fetch(`${root}/admin/dance-templates/not-allowed/video.mp4`, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: original })).status, 404);
    assert.equal((await fetch(url, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: "not a video" })).status, 400);
    const tooLarge = await fetch(`${root}/admin/dance-templates/trend-01/poster.jpg`, {
      method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: Buffer.alloc(10 * 1024 * 1024 + 1),
    });
    assert.equal(tooLarge.status, 413);
    const response = await fetch(url, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: original });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).size, original.length);
    const audit = await pool.query("SELECT action,target_id,details FROM df_admin_audit");
    assert.equal(audit.rows[0].action, "catalogue.media.put");
    assert.equal(audit.rows[0].target_id, "trend-01/video.mp4");
    assert.equal(audit.rows[0].details, "bytes=32");
  });
});

test("a pending R2 PUT holds the upload slot and a second upload cannot replace it", async () => {
  const send = S3Client.prototype.send;
  let release!: () => void, started!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { started = resolve; });
  mock.method(S3Client.prototype, "send", async function (this: S3Client, command: any) {
    if (command instanceof PutObjectCommand) { started(); await pending; }
    return Reflect.apply(send, this, [command]);
  });
  await serve(uploadHarness(), async (root) => {
    const url = `${root}/admin/dance-templates/trend-01/video.mp4`;
    const options = { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: original };
    const first = fetch(url, options);
    try {
      await entered;
      const second = await fetch(url, options);
      assert.equal(second.status, 429);
      assert.equal(second.headers.get("retry-after"), "5");
    } finally { release(); }
    assert.equal((await first).status, 200);
    assert.equal((await fetch(url, options)).status, 200);
  });
});

test("aborted and concurrent media requests do not terminate the server", async () => {
  await serve(publicApp(), async (root) => {
    const url = `${root}/dance-templates/trend-01/video.mp4`;
    const abort = new AbortController();
    const cancelled = fetch(url, { signal: abort.signal }).catch(() => undefined);
    abort.abort(); await cancelled;
    await Promise.all(Array.from({ length: 6 }, async () => {
      const response = await fetch(url, { headers: { Range: "bytes=0-3" } });
      assert.equal(response.status, 206);
      assert.equal((await response.arrayBuffer()).byteLength, 4);
    }));
  });
});

test("cancelling mid-body closes the upstream stream without crashing subsequent requests", async () => {
  const send = S3Client.prototype.send;
  let upstream: Readable | undefined;
  mock.method(S3Client.prototype, "send", async function (this: S3Client, command: any) {
    if (command instanceof GetObjectCommand && !command.input.Range) {
      upstream = Readable.from((async function* () {
        yield original.subarray(0, 8);
        await new Promise((resolve) => setTimeout(resolve, 50));
        yield original.subarray(8);
      })());
      return { Body: upstream };
    }
    return Reflect.apply(send, this, [command]);
  });
  await serve(publicApp(), async (root) => {
    const url = `${root}/dance-templates/trend-01/video.mp4`;
    const controller = new AbortController();
    const response = await fetch(url, { signal: controller.signal });
    await response.body!.getReader().read();
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(upstream?.destroyed, true);
    const next = await fetch(url, { headers: { Range: "bytes=0-3" } });
    assert.equal(next.status, 206);
    await next.arrayBuffer();
  });
});
