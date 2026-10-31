import "./helpers/setup.mjs";
import assert from "node:assert/strict";
import { beforeEach, test, type TestContext } from "node:test";
import { Readable } from "node:stream";
import { S3Client, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import type { AddressInfo } from "node:net";
import { isolatedDatabase } from "./helpers/database";
import { createOwnedLightSwapper } from "../src/lib/light-swapper";
import { getOwnedGeneration, VideoNotFoundError } from "../src/lib/generation-access";
import { GenerationPolicyError } from "../src/lib/generation-governance";
import { VideoSubmissionUnknownError } from "../src/lib/video-generation";
import type { LightSwapperInput } from "@workspace/api-zod";
import app from "../src/app";
import { recoverStaleSubmissions } from "../src/lib/generation-recovery";

const pool = isolatedDatabase();
const models = [
  "higgsfield/genjutsu-light/motion-transfer/v1.0",
  "higgsfield/genjutsu-light/object-swap/v1.0",
] as const;
const photo = (n: number) => `data:image/jpeg;base64,${Buffer.from([255, 216, 255, n]).toString("base64")}`;
const original = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(20)]);
const input: LightSwapperInput = {
  clientRequestId: "light-draft-request", model: models[0], templateId: "trend-01",
  photos: [photo(1), photo(2)], prompt: "Сохрани двух персонажей, поменяй одежду.", resolution: "720p",
};
beforeEach(async () => {
  process.env.higgs_api = "unit-test-id:unit-test-secret";
  process.env.DANCEFLOW_LIGHT_USD_RUB = "1";
  process.env.CLOUDFLARE_R2_ACCOUNT_ID = "a".repeat(32);
  process.env.CLOUDFLARE_R2_BUCKET_NAME = "test-media";
  process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = "synthetic-id";
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = "synthetic-secret";
  await pool.query("TRUNCATE df_jobs,df_accounts,df_controls,df_admin_audit,dance_catalogue");
  await pool.query(`INSERT INTO df_controls(id,paused,max_concurrent,per_user_concurrent,max_daily_spend_rub,cost_per_generation_rub)
    VALUES(1,false,10,5,100,10)`);
  await pool.query(`INSERT INTO df_accounts(id,email,plan,subscription_until)
    VALUES('u1','one@example.invalid','stage',now()+interval '1 day'),
    ('u2','two@example.invalid','none',null)`);
  await pool.query(`INSERT INTO dance_catalogue(id,metadata,published) VALUES('trend-01','{"sourceDurationSeconds":13}',true)`);
});

function boundaries(t: TestContext, options: {
  paid?: "timeout" | "malformed" | "server_error"; uploadFails?: boolean;
  headSize?: number; bytes?: Buffer; beforePaid?: () => Promise<void>; statusFails?: boolean;
} = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  let uploads = 0;
  let storageReads = 0;
  t.mock.method(S3Client.prototype, "send", async (command: any) => {
    storageReads++;
    assert.equal(command.input.Key, "dance-templates/trend-01/video.mp4", "never a preview or arbitrary key");
    if (command instanceof HeadObjectCommand) return {
      ETag: '"original-v1"', ContentLength: options.headSize ?? original.length, ContentType: "video/mp4",
    };
    assert.ok(command instanceof GetObjectCommand);
    assert.equal(command.input.IfMatch, '"original-v1"');
    return { Body: Readable.from([options.bytes ?? original]) };
  });
  const localFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const address = String(url);
    if (address.startsWith("http://127.0.0.1:")) return localFetch(url, init);
    calls.push({ url: address, init });
    if (address.endsWith("/files/generate-upload-url")) {
      uploads++;
      const mime = JSON.parse(String(init?.body)).content_type;
      return Response.json({
        upload_url: `https://storage.example.test/upload-${uploads}`,
        public_url: `https://cdn.example.test/input-${uploads}`,
        upload_headers: { "Content-Type": mime },
      });
    }
    if (address.startsWith("https://storage.example.test/")) {
      assert.equal((init?.headers as Record<string, string>).Authorization, undefined);
      if (options.beforePaid && uploads === input.photos.length + 1) await options.beforePaid();
      return new Response(null, { status: options.uploadFails ? 403 : 200 });
    }
    if (models.some(model => address === `https://api.higgsfield.ai/${model}`)) {
      if (options.paid === "timeout") throw new Error("sensitive upstream information");
      if (options.paid === "malformed") return new Response("not-json");
      if (options.paid === "server_error") return Response.json({ secret: "never expose" }, { status: 500 });
      return Response.json({ status: "queued", request_id: "light-provider-id" });
    }
    if (address.endsWith("/requests/light-provider-id/status")) {
      if (options.statusFails) return Response.json({ detail: "sensitive" }, { status: 503 });
      return Response.json({ status: "completed", video: { url: "https://cdn.example.test/result.mp4" } });
    }
    assert.fail(`Unexpected provider operation`);
  });
  return { calls, get storageReads() { return storageReads; } };
}

for (const model of models) for (const resolution of ["480p", "720p", "1080p"] as const) {
  test(`${model}: ${resolution} sends original and all eight ordered photos without altering prompt`, async t => {
    const { calls } = boundaries(t);
    const photos = Array.from({ length: 8 }, (_, i) => photo(i));
    const result = await createOwnedLightSwapper("u1", { ...input, photos, model, resolution });
    assert.equal(calls.length, 19);
    const request = calls.at(-1)!;
    assert.equal(request.url, `https://api.higgsfield.ai/${model}`);
    assert.deepEqual(JSON.parse(String(request.init?.body)), {
      video_url: "https://cdn.example.test/input-1",
      image_urls: Array.from({ length: 8 }, (_, i) => `https://cdn.example.test/input-${i + 2}`),
      prompt: input.prompt, resolution,
    });
    assert.deepEqual(Buffer.from(await (calls[1].init!.body as Blob).arrayBuffer()), original);
    for (let i = 0; i < 8; i++) {
      assert.deepEqual(Buffer.from(await (calls[3 + i * 2].init!.body as Blob).arrayBuffer()), Buffer.from([255, 216, 255, i]));
    }
    const row = (await pool.query("SELECT * FROM df_jobs WHERE id=$1", [result.requestId])).rows[0];
    assert.equal(row.provider_model, model);
    assert.equal(row.provider_request_id, "light-provider-id");
    assert.equal(row.estimated_cost_rub, "10.00");
    assert.match(row.request_fingerprint, /^[a-f0-9]{64}$/);
    assert.ok(!JSON.stringify(row).includes(input.prompt));
  });
}

test("all parameter changes conflict; concurrent exact replays spend once", async t => {
  const { calls } = boundaries(t);
  const [first, replay] = await Promise.all([createOwnedLightSwapper("u1", input), createOwnedLightSwapper("u1", input)]);
  assert.deepEqual(first, replay);
  for (const changed of [
    { model: models[1] }, { resolution: "480p" as const }, { prompt: "different" },
    { photos: [...input.photos].reverse() }, { photos: [photo(3), photo(2)] },
    { photos: [photo(1)] },
  ]) {
    await assert.rejects(createOwnedLightSwapper("u1", { ...input, ...changed }),
      (e: unknown) => e instanceof GenerationPolicyError && e.code === "idempotency_conflict");
  }
  assert.equal(calls.length, 7);
});

test("malformed, local, remote, excess and oversized photos fail without storage or provider operations", async t => {
  const boundary = boundaries(t);
  for (const changed of [
    { photos: ["file:///local/photo.jpg"] }, { photos: ["https://attacker.invalid/a.jpg"] },
    { photos: ["data:image/png;base64,YmFk"] }, { photos: [] },
    { photos: Array.from({ length: 9 }, () => photo(1)) },
    { templateId: "../outside" }, { model: "pixverse/v6/image-to-video" },
    { videoUrl: "https://attacker.invalid/video.mp4" }, { duration: 10 },
    { photos: [photo(1), `data:image/jpeg;base64,${Buffer.concat([Buffer.from([255,216,255]), Buffer.alloc(12 * 1024 * 1024 - 3)]).toString("base64")}`] },
  ]) await assert.rejects(createOwnedLightSwapper("u1", { ...input, ...changed } as LightSwapperInput));
  assert.equal(boundary.calls.length, 0);
  assert.equal(boundary.storageReads, 0);
  assert.equal((await pool.query("SELECT count(*)::int n FROM df_jobs")).rows[0].n, 0);
});

test("draft and deleted templates never cause uploads or reservations", async t => {
  const boundary = boundaries(t);
  await pool.query("UPDATE dance_catalogue SET published=false");
  await assert.rejects(createOwnedLightSwapper("u1", input));
  await pool.query("DELETE FROM dance_catalogue");
  await assert.rejects(createOwnedLightSwapper("u1", input));
  assert.equal(boundary.calls.length, 0);
  assert.equal(boundary.storageReads, 0);
});

for (const [sql, owner, code] of [
  ["UPDATE df_accounts SET blocked=true WHERE id='u1'", "u1", "account_blocked"],
  ["SELECT 1", "u2", "subscription_required"],
  ["UPDATE df_accounts SET subscription_until=now()-interval '1 second' WHERE id='u1'", "u1", "subscription_required"],
  ["UPDATE df_controls SET paused=true", "u1", "generation_paused"],
  ["UPDATE df_controls SET max_daily_spend_rub=null", "u1", "budget_not_configured"],
  ["UPDATE df_controls SET max_daily_spend_rub=9", "u1", "daily_budget_reached"],
  ["UPDATE df_accounts SET daily_limit_override=0 WHERE id='u1'", "u1", "daily_limit_reached"],
  ["UPDATE df_controls SET max_concurrent=0", "u1", "concurrency_limit_reached"],
] as const) test(`access guard ${code} prevents any upload`, async t => {
  const boundary = boundaries(t);
  await pool.query(sql);
  await assert.rejects(createOwnedLightSwapper(owner, input),
    (e: unknown) => e instanceof GenerationPolicyError && e.code === code);
  assert.equal(boundary.calls.length, 0);
  assert.equal(boundary.storageReads, 0);
});

for (const sql of [
  "UPDATE df_controls SET paused=true",
  "UPDATE df_accounts SET blocked=true WHERE id='u1'",
  "UPDATE df_accounts SET subscription_until=now()-interval '1 day' WHERE id='u1'",
  "UPDATE dance_catalogue SET published=false",
]) test(`access changes during upload stop paid submission: ${sql}`, async t => {
  const { calls } = boundaries(t, { beforePaid: async () => { await pool.query(sql); } });
  await assert.rejects(createOwnedLightSwapper("u1", input));
  assert.equal(calls.length, 6);
  assert.equal((await pool.query("SELECT error_code FROM df_jobs")).rows[0].error_code, "provider_error");
});

test("budget races reserve once before any uploads", async t => {
  const { calls } = boundaries(t);
  await pool.query("UPDATE df_controls SET max_daily_spend_rub=10");
  const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) =>
    createOwnedLightSwapper("u1", { ...input, clientRequestId: `race-light-${i}` })));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  for (const result of results) if (result.status === "rejected") assert.equal(result.reason.code, "daily_budget_reached");
  assert.equal(calls.length, 7);
});

test("nine sequential media uploads have sufficient recovery time without permitting replay", async t => {
  const { calls } = boundaries(t, { beforePaid: async () => {
    await pool.query("UPDATE df_jobs SET created_at=now()-interval '20 minutes'");
    assert.equal(await recoverStaleSubmissions(), 0);
  } });
  const result = await createOwnedLightSwapper("u1", input);
  assert.deepEqual(await createOwnedLightSwapper("u1", input), result);
  assert.equal(calls.length, 7);
  await pool.query("UPDATE df_jobs SET created_at=now()-interval '31 minutes',provider_request_id=null");
  assert.equal(await recoverStaleSubmissions(), 1);
  assert.deepEqual(await createOwnedLightSwapper("u1", input), result);
  assert.equal(calls.length, 7);
  assert.equal((await pool.query("SELECT error_code FROM df_jobs")).rows[0].error_code, "submission_unknown");
});

test("resolution and full source duration set a conservative RUB reservation floor", async t => {
  const { calls } = boundaries(t);
  await pool.query(`UPDATE dance_catalogue SET metadata='{"sourceDurationSeconds":32.5}'`);
  process.env.DANCEFLOW_LIGHT_USD_RUB = "100";
  await pool.query("UPDATE df_controls SET max_daily_spend_rub=949");
  await assert.rejects(createOwnedLightSwapper("u1", { ...input, resolution: "1080p" }),
    (e: unknown) => e instanceof GenerationPolicyError && e.code === "daily_budget_reached");
  assert.equal(calls.length, 0);
  await pool.query("UPDATE df_controls SET max_daily_spend_rub=950");
  await createOwnedLightSwapper("u1", { ...input, resolution: "1080p" });
  assert.equal((await pool.query("SELECT estimated_cost_rub FROM df_jobs")).rows[0].estimated_cost_rub, "950.00");
});

test("unconfigured conversion or unknown duration blocks spending; exact replay does not require a new quote", async t => {
  const { calls } = boundaries(t);
  delete process.env.DANCEFLOW_LIGHT_USD_RUB;
  await assert.rejects(createOwnedLightSwapper("u1", input),
    (e: unknown) => e instanceof GenerationPolicyError && e.code === "light_pricing_not_configured");
  process.env.DANCEFLOW_LIGHT_USD_RUB = "1";
  await pool.query("UPDATE dance_catalogue SET metadata='{}'");
  await assert.rejects(createOwnedLightSwapper("u1", input));
  assert.equal(calls.length, 0);
  await pool.query(`UPDATE dance_catalogue SET metadata='{"sourceDurationSeconds":13}'`);
  const result = await createOwnedLightSwapper("u1", input);
  delete process.env.DANCEFLOW_LIGHT_USD_RUB;
  assert.deepEqual(await createOwnedLightSwapper("u1", input), result);
  assert.equal(calls.length, 7);
});

for (const options of [
  { headSize: 100 * 1024 * 1024 + 1 }, { bytes: Buffer.alloc(original.length) },
  { bytes: original.subarray(0, 12) }, { uploadFails: true },
]) test(`source and upload failures do not start paid generation ${JSON.stringify(Object.keys(options))}`, async t => {
  const { calls } = boundaries(t, options);
  await assert.rejects(createOwnedLightSwapper("u1", input));
  assert.ok(!calls.some(call => models.some(model => call.url.endsWith(model))));
  const count = calls.length;
  await createOwnedLightSwapper("u1", input);
  assert.equal(calls.length, count);
  assert.equal((await pool.query("SELECT error_code FROM df_jobs")).rows[0].error_code, "provider_error");
});

for (const paid of ["timeout", "malformed", "server_error"] as const) {
  test(`uncertain ${paid} retains quota/spend and never retries either model`, async t => {
    const { calls } = boundaries(t, { paid });
    for (const [i, model] of models.entries()) {
      const request = { ...input, model, clientRequestId: `uncertain-light-${i}` };
      await assert.rejects(createOwnedLightSwapper("u1", request), VideoSubmissionUnknownError);
      const replay = await createOwnedLightSwapper("u1", request);
      assert.equal((await getOwnedGeneration("u1", replay.requestId)).status, "failed");
    }
    assert.equal(calls.length, 14);
    const rows = (await pool.query("SELECT error_code,estimated_cost_rub FROM df_jobs")).rows;
    assert.ok(rows.every(row => row.error_code === "submission_unknown" && row.estimated_cost_rub === "10.00"));
  });
}

test("transient status failures leave the job active; owner alone retrieves and caches completion", async t => {
  const options = { statusFails: true };
  const { calls } = boundaries(t, options);
  const { requestId } = await createOwnedLightSwapper("u1", input);
  await assert.rejects(getOwnedGeneration("u2", requestId), VideoNotFoundError);
  assert.equal(calls.length, 7);
  await assert.rejects(getOwnedGeneration("u1", requestId));
  assert.equal((await pool.query("SELECT status FROM df_jobs")).rows[0].status, "running");
  options.statusFails = false;
  const status = await getOwnedGeneration("u1", requestId);
  assert.equal(status.videoUrl, "https://cdn.example.test/result.mp4");
  assert.equal(status.requestId, requestId);
  assert.equal(status.status, "completed");
  const count = calls.length;
  assert.deepEqual(await getOwnedGeneration("u1", requestId), status);
  assert.equal(calls.length, count, "completed result survives provider status unavailability");
});

test("production route rejects signed-out and forged identities before provider access", async t => {
  const boundary = boundaries(t);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    for (const headers of [{}, { "x-user-id": "u1", "x-admin": "true" }]) {
      const response = await fetch(`${root}/api/light-swapper/generations`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(input),
      });
      assert.equal(response.status, 401);
    }
    assert.equal(boundary.calls.length, 0);
    assert.equal(boundary.storageReads, 0);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
