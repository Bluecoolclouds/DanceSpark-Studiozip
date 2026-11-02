import "./helpers/setup.mjs";
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { isolatedDatabase } from "./helpers/database";
import { testPricing } from "./helpers/pricing";
import { createOwnedGeneration, getOwnedGeneration, findOwnedLightSwapperGeneration, VideoNotFoundError } from "../src/lib/generation-access";
import { reserveGeneration } from "../src/lib/generation-governance";
import { recoverStaleSubmissions } from "../src/lib/generation-recovery";

const pool = isolatedDatabase();
beforeEach(async () => {
  process.env.higgs_api = "synthetic:test-only";
  await pool.query("TRUNCATE df_jobs,df_accounts,df_controls,df_admin_audit CASCADE");
  await pool.query("INSERT INTO df_controls(id,paused,max_daily_spend_rub,per_user_concurrent) VALUES(1,false,10000,5)");
  await pool.query("INSERT INTO df_accounts(id,email,plan,subscription_until) VALUES('u1','one@example.invalid','stage',now()+interval '1 day'),('u2','two@example.invalid','none',null)");
});
const reserve = (key = "draft-request-123", model?: string) => reserveGeneration({
  userId: "u1", idempotencyKey: key, templateId: "dance-one", model, pricing: testPricing,
});

test("unpriced PixVerse creation fails closed for all accounts without provider or ledger operations", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("No network allowed"); });
  for (const user of ["u1", "u2"]) {
    await assert.rejects(createOwnedGeneration(user, {
      clientRequestId: "legacy-unpriced", imageDataUrl: "data:image/jpeg;base64,/9j/", styleId: "bubblegum-rush", duration: 5,
    }), /pricing_not_configured/);
  }
  assert.equal(calls, 0);
  assert.equal((await pool.query("SELECT count(*)::int n FROM df_jobs")).rows[0].n, 0);
});

test("Light recovery is owner-scoped, read-only and excludes legacy PixVerse jobs", async () => {
  const job = await reserve("light-recovery-123", "higgsfield/genjutsu-light/object-swap/v1.0");
  assert.equal((await findOwnedLightSwapperGeneration("u1", "light-recovery-123"))?.requestId, job.id);
  assert.equal(await findOwnedLightSwapperGeneration("u2", "light-recovery-123"), null);
  await reserve();
  assert.equal(await findOwnedLightSwapperGeneration("u1", "draft-request-123"), null);
  await assert.rejects(getOwnedGeneration("u2", job.id), VideoNotFoundError);
});

test("stale reservation is recovered once and exact replay remains read-only while paused", async () => {
  const job = await reserve();
  await pool.query("UPDATE df_jobs SET created_at=now()-interval '40 minutes'");
  assert.equal(await recoverStaleSubmissions(), 1);
  assert.equal(await recoverStaleSubmissions(), 0);
  await pool.query("UPDATE df_controls SET paused=true");
  delete process.env.higgs_api;
  assert.equal((await reserve()).id, job.id);
  const result = await getOwnedGeneration("u1", job.id);
  assert.equal(result.status, "failed");
  assert.match(result.error!, /Higgsfield Console/);
});

test("status reads do not mutate fresh reservations or cached completed results", async () => {
  const job = await reserve();
  assert.equal((await getOwnedGeneration("u1", job.id)).status, "queued");
  await pool.query("UPDATE df_jobs SET status='succeeded',completed_at=now()");
  const before = (await pool.query("SELECT * FROM df_jobs")).rows[0];
  assert.equal((await getOwnedGeneration("u1", job.id)).status, "completed");
  assert.deepEqual((await pool.query("SELECT * FROM df_jobs")).rows[0], before);
});
