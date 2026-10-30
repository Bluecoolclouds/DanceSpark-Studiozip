import "./helpers/setup.mjs";
import assert from "node:assert/strict";
import { beforeEach, test, type TestContext } from "node:test";
import { isolatedDatabase } from "./helpers/database";
import { createOwnedGeneration, getOwnedGeneration, VideoNotFoundError } from "../src/lib/generation-access";
import { GenerationPolicyError } from "../src/lib/generation-governance";

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
  assert.equal(calls.length, 3);
});

test("unlimited accounts have no hidden prototype daily count cap", async (t) => {
  const calls = provider(t);
  const first = await createOwnedGeneration("u1", input);
  const second = await createOwnedGeneration("u1", { ...input, clientRequestId: "draft-request-456" });
  assert.notEqual(first.requestId, second.requestId);
  assert.equal(calls.length, 6);
});
