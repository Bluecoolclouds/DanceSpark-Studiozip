import "./helpers/setup.mjs";
import assert from "node:assert/strict";
import { beforeEach, test, type TestContext } from "node:test";
import { isolatedDatabase } from "./helpers/database";
import { createOwnedGeneration, getOwnedGeneration, findOwnedLightSwapperGeneration, VideoNotFoundError } from "../src/lib/generation-access";
import { GenerationPolicyError, reserveGeneration } from "../src/lib/generation-governance";
import { recoverStaleSubmissions } from "../src/lib/generation-recovery";
import { userProjection } from "../src/lib/admin-data";

const pool = isolatedDatabase();
const input = {
  clientRequestId: "draft-request-123",
  imageDataUrl: `data:image/jpeg;base64,${Buffer.concat([Buffer.from([255, 216, 255]), Buffer.alloc(100)]).toString("base64")}`,
  styleId: "bubblegum-rush" as const,
  duration: 5 as const,
};
beforeEach(async () => {
  process.env.higgs_api = "unit-test-id:unit-test-secret";
  await pool.query("TRUNCATE df_jobs,df_accounts,df_controls,df_admin_audit");
  await pool.query(`INSERT INTO df_controls(id,paused,max_concurrent,per_user_concurrent,max_daily_spend_rub,cost_per_generation_rub)
    VALUES(1,false,10,5,10000,5)`);
  await pool.query(`INSERT INTO df_accounts(id,email,plan,subscription_until)
    VALUES('u1','one@example.invalid','stage',now()+interval '1 day'),
          ('u2','two@example.invalid','none',null)`);
});

function provider(t: TestContext, failSubmission = false) {
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    const address = String(url);
    calls.push(address);
    if (address.endsWith("/files/generate-upload-url")) {
      return Response.json({
        upload_url: "https://storage.example.test/photo",
        public_url: "https://cdn.example.test/photo.jpg",
        upload_headers: { "Content-Type": "image/jpeg" },
      });
    }
    if (address === "https://storage.example.test/photo") return new Response(null, { status: 200 });
    if (address.endsWith("/pixverse/v6/image-to-video")) {
      if (failSubmission) throw new Error("Simulated submission failure");
      return Response.json({ status: "queued", request_id: "provider-request-123" });
    }
    if (address.endsWith("/requests/provider-request-123/status")) {
      return Response.json({ status: "completed", video: { url: "https://cdn.example.test/dance.mp4" } });
    }
    throw new Error("Unexpected provider HTTP request");
  });
  return calls;
}

test("Light recovery is owner-scoped, read-only and cannot return PixVerse jobs", async (t) => {
  const calls = provider(t);
  const reservation = await reserveGeneration({
    userId: "u1", idempotencyKey: "light-recovery-123", templateId: "dance-one",
    model: "higgsfield/genjutsu-light/object-swap/v1.0", fingerprint: "fixed", minimumCostRub: 5,
  });
  const found = await findOwnedLightSwapperGeneration("u1", "light-recovery-123");
  assert.equal(found?.requestId, reservation.id);
  assert.equal(found?.status, "queued");
  assert.equal(await findOwnedLightSwapperGeneration("u2", "light-recovery-123"), null);
  assert.equal(await findOwnedLightSwapperGeneration("u1", "missing-request"), null);
  await reserveGeneration({ userId: "u1", idempotencyKey: input.clientRequestId, templateId: input.styleId });
  assert.equal(await findOwnedLightSwapperGeneration("u1", input.clientRequestId), null);
  assert.equal(calls.length, 0);
  assert.equal((await pool.query("SELECT count(*)::int AS total FROM df_jobs")).rows[0].total, 2);
});

test("unpaid users cannot spend provider balance", async (t) => {
  const calls = provider(t);
  await assert.rejects(createOwnedGeneration("u2", input), (e: unknown) =>
    e instanceof GenerationPolicyError && e.code === "subscription_required");
  assert.equal(calls.length, 0);
  assert.equal((await pool.query("SELECT count(*)::int AS total FROM df_jobs")).rows[0].total, 0);
});

test("admin pause and missing budget prevent provider submission", async (t) => {
  const calls = provider(t);
  await pool.query("UPDATE df_controls SET paused=true");
  await assert.rejects(createOwnedGeneration("u1", input), (e: unknown) =>
    e instanceof GenerationPolicyError && e.code === "generation_paused");
  await pool.query("UPDATE df_controls SET paused=false,max_daily_spend_rub=null");
  await assert.rejects(createOwnedGeneration("u1", input), (e: unknown) =>
    e instanceof GenerationPolicyError && e.code === "budget_not_configured");
  assert.equal(calls.length, 0);
});

test("concurrent duplicate requests submit to the provider exactly once", async (t) => {
  const calls = provider(t);
  const results = await Promise.all([
    createOwnedGeneration("u1", input),
    createOwnedGeneration("u1", input),
  ]);
  assert.equal(results[0].requestId, results[1].requestId);
  assert.equal(calls.length, 3);
  assert.equal((await pool.query("SELECT count(*)::int AS total FROM df_jobs")).rows[0].total, 1);
});

test("budget and concurrency races never submit rejected requests to the provider", async (t) => {
  const calls = provider(t);
  for (const controls of [
    "max_daily_spend_rub=9,max_concurrent=10,per_user_concurrent=5",
    "max_daily_spend_rub=10000,max_concurrent=1,per_user_concurrent=5",
    "max_daily_spend_rub=10000,max_concurrent=10,per_user_concurrent=1",
  ]) {
    await pool.query("TRUNCATE df_jobs");
    await pool.query(`UPDATE df_controls SET ${controls}`);
    calls.length = 0;
    const outcomes = await Promise.allSettled(Array.from({ length: 6 }, (_, i) =>
      createOwnedGeneration("u1", { ...input, clientRequestId: `race-request-${i}` })));
    assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
    const failures = outcomes.filter((r) => r.status === "rejected");
    assert.equal(failures.length, 5);
    for (const failure of failures) {
      assert.ok(failure.reason instanceof GenerationPolicyError);
      assert.equal(failure.reason.code, controls.startsWith("max_daily_spend_rub=9,")
        ? "daily_budget_reached" : "concurrency_limit_reached");
    }
    assert.equal(calls.length, 3, "one upload and one mocked paid submission");
    const ledger = (await pool.query("SELECT count(*)::int n,sum(estimated_cost_rub)::float spend FROM df_jobs")).rows[0];
    assert.equal(ledger.n, 1);
    assert.equal(ledger.spend, 5);
  }
});

test("results require ownership and completed provider jobs update the admin ledger", async (t) => {
  const calls = provider(t);
  const { requestId } = await createOwnedGeneration("u1", input);
  await assert.rejects(getOwnedGeneration("u2", requestId), VideoNotFoundError);
  assert.equal(calls.length, 3);
  const result = await getOwnedGeneration("u1", requestId);
  assert.equal(result.status, "completed");
  assert.equal(result.videoUrl, "https://cdn.example.test/dance.mp4");
  assert.equal(result.requestId, requestId);
  assert.equal((await pool.query("SELECT status FROM df_jobs WHERE id=$1", [requestId])).rows[0].status, "succeeded");
});

test("failed submissions are recorded and replay never silently spends again", async (t) => {
  const calls = provider(t, true);
  await assert.rejects(createOwnedGeneration("u1", input));
  const replay = await createOwnedGeneration("u1", input);
  assert.equal(calls.length, 3);
  const result = await getOwnedGeneration("u1", replay.requestId);
  assert.equal(result.status, "failed");
  assert.equal(result.videoUrl, null);
  assert.match(result.error!, /Higgsfield Console/);
  const row = (await pool.query("SELECT error_code,estimated_cost_rub FROM df_jobs")).rows[0];
  assert.equal(row.error_code, "submission_unknown");
  assert.equal(Number(row.estimated_cost_rub), 5);
  assert.equal(calls.length, 3);
});

test("recovered replay never sends a paid request, even while generation is paused or unconfigured", async (t) => {
  const calls = provider(t);
  const reserved = await reserveGeneration({ userId: "u1", idempotencyKey: input.clientRequestId, templateId: input.styleId });
  await pool.query("UPDATE df_jobs SET created_at=now()-interval '20 minutes'");
  assert.equal(await recoverStaleSubmissions(), 1);
  await pool.query("UPDATE df_controls SET paused=true");
  delete process.env.higgs_api;
  assert.deepEqual(await createOwnedGeneration("u1", input), { requestId: reserved.id });
  const result = await getOwnedGeneration("u1", reserved.id);
  assert.equal(result.status, "failed");
  assert.match(result.error!, /Higgsfield Console/);
  assert.equal(calls.length, 0);
  assert.equal((await pool.query("SELECT count(*)::int n FROM df_jobs")).rows[0].n, 1);
});

test("recovery frees global and per-user slots but retains daily quota and estimated spend", async (t) => {
  const calls = provider(t);
  await pool.query("UPDATE df_controls SET max_concurrent=1,per_user_concurrent=1,max_daily_spend_rub=10");
  await pool.query("UPDATE df_accounts SET daily_limit_override=1 WHERE id='u1'");
  const reserved = await reserveGeneration({ userId: "u1", idempotencyKey: input.clientRequestId, templateId: input.styleId });
  await pool.query("UPDATE df_jobs SET created_at=now()-interval '20 minutes' WHERE id=$1", [reserved.id]);
  await assert.rejects(createOwnedGeneration("u1", { ...input, clientRequestId: "second-request" }),
    (e: unknown) => e instanceof GenerationPolicyError && e.code === "daily_limit_reached");
  assert.equal(await recoverStaleSubmissions(), 1);
  await assert.rejects(createOwnedGeneration("u1", { ...input, clientRequestId: "second-request" }),
    (e: unknown) => e instanceof GenerationPolicyError && e.code === "daily_limit_reached");
  const account = (await pool.query(`SELECT ${userProjection} FROM df_accounts a WHERE a.id='u1'`)).rows[0];
  assert.equal(account.todayGenerations, 1);
  await pool.query("UPDATE df_accounts SET daily_limit_override=3 WHERE id='u1'");
  await createOwnedGeneration("u1", { ...input, clientRequestId: "second-request" });
  assert.equal(calls.length, 3, "both concurrency slots were released");
  await pool.query("UPDATE df_jobs SET status='succeeded' WHERE status='running'");
  await assert.rejects(createOwnedGeneration("u1", { ...input, clientRequestId: "third-request" }),
    (e: unknown) => e instanceof GenerationPolicyError && e.code === "daily_budget_reached");
  assert.equal(calls.length, 3);
  assert.equal((await pool.query("SELECT sum(estimated_cost_rub)::float spend FROM df_jobs")).rows[0].spend, 10);
});

test("proven pre-submission failures release quota but still never replay automatically", async (t) => {
  const calls = provider(t);
  await pool.query("UPDATE df_accounts SET daily_limit_override=1 WHERE id='u1'");
  await assert.rejects(createOwnedGeneration("u1", { ...input, imageDataUrl: "not-an-image" }));
  assert.equal((await pool.query("SELECT error_code FROM df_jobs")).rows[0].error_code, "provider_error");
  const replay = await createOwnedGeneration("u1", input);
  assert.equal((await getOwnedGeneration("u1", replay.requestId)).status, "failed");
  assert.equal(calls.length, 0);
  await createOwnedGeneration("u1", { ...input, clientRequestId: "different-request" });
  assert.equal(calls.length, 3);
});

test("status reads do not time out a fresh upload or mutate already-completed records", async (t) => {
  const calls = provider(t);
  const reservation = await reserveGeneration({ userId: "u1", idempotencyKey: input.clientRequestId, templateId: input.styleId });
  await pool.query("UPDATE df_jobs SET created_at=now()-interval '3 minutes'");
  assert.equal((await getOwnedGeneration("u1", reservation.id)).status, "queued");
  assert.equal((await pool.query("SELECT status FROM df_jobs")).rows[0].status, "queued");
  await pool.query("UPDATE df_jobs SET status='succeeded',created_at=now()-interval '20 minutes',completed_at=now()");
  const before = (await pool.query("SELECT * FROM df_jobs")).rows[0];
  assert.equal((await getOwnedGeneration("u1", reservation.id)).status, "completed");
  assert.deepEqual((await pool.query("SELECT * FROM df_jobs")).rows[0], before);
  assert.equal(calls.length, 0);
});

test("a late provider response cannot revive a recovered attempt or cause a replay", async (t) => {
  const calls = provider(t);
  const fetch = globalThis.fetch;
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const pending = new Promise<void>((resolve) => { entered = resolve; });
  t.mock.method(globalThis, "fetch", async (...args: Parameters<typeof fetch>) => {
    if (String(args[0]).endsWith("/pixverse/v6/image-to-video")) {
      entered();
      await gate;
    }
    return fetch(...args);
  });
  const submission = createOwnedGeneration("u1", input);
  try {
    await pending;
    await pool.query("UPDATE df_jobs SET created_at=now()-interval '20 minutes'");
    assert.equal(await recoverStaleSubmissions(), 1);
  } finally { release(); }
  const result = await submission;
  assert.equal((await getOwnedGeneration("u1", result.requestId)).status, "failed");
  await createOwnedGeneration("u1", input);
  assert.equal(calls.length, 3);
  assert.equal((await pool.query("SELECT error_code FROM df_jobs")).rows[0].error_code, "submission_unknown");
});

test("unlimited accounts have no hidden prototype daily count cap", async (t) => {
  const calls = provider(t);
  const first = await createOwnedGeneration("u1", input);
  const second = await createOwnedGeneration("u1", { ...input, clientRequestId: "draft-request-456" });
  assert.notEqual(first.requestId, second.requestId);
  assert.equal(calls.length, 6);
});
