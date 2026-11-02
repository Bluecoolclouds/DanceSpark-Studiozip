import "./helpers/setup.mjs";
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { isolatedDatabase } from "./helpers/database";
import { testPricing } from "./helpers/pricing";
import { requestDeletion, processAccountDeletion, deletionStatus, hasUnsettledWork } from "../src/lib/account-lifecycle";
import { retentionBatch } from "../src/lib/data-retention";
import { ownedVideoPrefix, isOwnedSourceKey } from "../src/lib/custom-video-storage";
import { reserveGeneration } from "../src/lib/generation-governance";
import { RequestAccountDeletionBody } from "@workspace/api-zod";

const pool = isolatedDatabase(["df_auth_identities"]);
beforeEach(async () => {
  await pool.query("TRUNCATE df_auth_identities,df_jobs,df_accounts,df_controls,df_admin_audit,df_erased_costs,dance_video_generations CASCADE");
  await pool.query(`INSERT INTO df_accounts(id,email,plan,subscription_until)
    VALUES ('erase-a','a@example.invalid','stage',now()+interval '1 day'),
           ('keep-b','b@example.invalid','stage',now()+interval '1 day')`);
  await pool.query(`INSERT INTO df_controls(id,paused,max_daily_spend_rub,cost_per_generation_rub,max_concurrent,per_user_concurrent)
    VALUES (1,false,100,5,10,5)`);
});
async function job(id: string, status: string, code: string | null = null, old = false) {
  await pool.query(`INSERT INTO df_jobs(id,user_id,idempotency_key,template_id,status,error_code,estimated_cost_rub,
    provider_request_id,result_url,created_at,completed_at)
    VALUES($1,'erase-a',$1,'trend-06',$2,$3,97,'private-provider-id','https://private.example.invalid/result',
    now()-($4::int*interval '1 day'),now()-($4::int*interval '1 day'))`, [id, status, code, old ? 40 : 0]);
}

test("confirmation is exact and an arbitrary target account is rejected", () => {
  assert.equal(RequestAccountDeletionBody.strict().safeParse({ confirmation: "УДАЛИТЬ" }).success, true);
  for (const body of [{ confirmation: "да" }, {}, { confirmation: "УДАЛИТЬ", accountId: "keep-b" }]) {
    assert.equal(RequestAccountDeletionBody.strict().safeParse(body).success, false);
  }
});

test("active and uncertain jobs of any age block deletion without losing access", async () => {
  for (const [status, code] of [["queued", null], ["running", null], ["failed", "submission_unknown"]] as const) {
    await pool.query("DELETE FROM df_jobs");
    await job("unsettled", status, code, true);
    await assert.rejects(requestDeletion("erase-a"), /unsettled_generation/);
    assert.equal(await deletionStatus("erase-a"), "not_requested");
    assert.equal((await pool.query("SELECT blocked FROM df_accounts WHERE id='erase-a'")).rows[0].blocked, false);
  }
});

test("legacy reserved work is not silently discarded", async () => {
  await pool.query("INSERT INTO dance_video_generations(owner_id,client_request_id) VALUES('erase-a','legacy-id')");
  assert.equal(await hasUnsettledWork(pool, "erase-a"), true);
  await assert.rejects(requestDeletion("erase-a"), /unsettled_generation/);
});

test("the last administrator and an unimplemented linked provider are explicit blockers", async () => {
  await pool.query("UPDATE df_accounts SET role='admin' WHERE id='erase-a'");
  await assert.rejects(requestDeletion("erase-a"), /last_administrator/);
  await pool.query("UPDATE df_accounts SET role='admin' WHERE id='keep-b'");
  await pool.query("INSERT INTO df_auth_identities(issuer,subject,account_id) VALUES('https://logto.example.invalid','subject','erase-a')");
  await assert.rejects(requestDeletion("erase-a"), /linked_identity/);
});

test("repeated requests are idempotent and new spending is blocked immediately", async () => {
  await Promise.all([requestDeletion("erase-a"), requestDeletion("erase-a")]);
  assert.equal(await deletionStatus("erase-a"), "pending");
  await assert.rejects(reserveGeneration({ userId: "erase-a", idempotencyKey: "new-job-key", templateId: "trend-06" }), /account_blocked/);
  await pool.query("UPDATE df_accounts SET blocked=false WHERE id='erase-a'");
  await assert.rejects(reserveGeneration({ userId: "erase-a", idempotencyKey: "new-job-key", templateId: "trend-06" }), /account_blocked/);
});

test("partial media/provider failures retain durable state and retry without touching another account", async () => {
  await job("settled", "succeeded");
  await requestDeletion("erase-a");
  let providerCalls = 0;
  assert.equal(await processAccountDeletion("erase-a", {
    deleteMedia: async id => { assert.equal(id, "erase-a"); throw new Error("signed URL must not be stored"); },
    deleteIdentity: async () => { providerCalls++; },
  }), false);
  assert.equal(providerCalls, 0);
  assert.equal(await deletionStatus("erase-a"), "retrying");
  assert.equal((await pool.query("SELECT deletion_error FROM df_accounts WHERE id='erase-a'")).rows[0].deletion_error, "cleanup_retry_required");
  assert.equal(await processAccountDeletion("erase-a", {
    deleteMedia: async () => {},
    deleteIdentity: async () => { providerCalls++; throw new Error("provider unavailable"); },
  }), false);
  assert.equal((await pool.query("SELECT count(*)::int n FROM df_jobs")).rows[0].n, 1);
  assert.equal(await processAccountDeletion("erase-a", {
    deleteMedia: async id => { assert.equal(id, "erase-a"); },
    deleteIdentity: async id => { assert.equal(id, "erase-a"); providerCalls++; },
  }), true);
  assert.equal(await deletionStatus("erase-a"), "completed");
  assert.equal((await pool.query("SELECT count(*)::int n FROM df_jobs WHERE user_id='erase-a'")).rows[0].n, 0);
  assert.equal((await pool.query("SELECT email FROM df_accounts WHERE id='keep-b'")).rows[0].email, "b@example.invalid");
  assert.equal((await pool.query("SELECT cost_rub FROM df_erased_costs")).rows[0].cost_rub, "97.00");
  await assert.rejects(reserveGeneration({ userId: "keep-b", idempotencyKey: "other-job-key", templateId: "trend-06", pricing: testPricing }), /daily_budget_reached/);
  const before = providerCalls;
  assert.equal(await processAccountDeletion("erase-a", {
    deleteMedia: async () => { throw new Error("must not run"); },
    deleteIdentity: async () => { providerCalls++; },
  }), true);
  assert.equal(providerCalls, before);
});

test("two deletion workers cannot remove an identity twice or double the spend aggregate", async () => {
  await job("settled", "succeeded");
  await requestDeletion("erase-a");
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const wait = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  const first = processAccountDeletion("erase-a", {
    deleteMedia: async () => { entered(); await wait; },
    deleteIdentity: async () => { calls++; },
  });
  await started;
  assert.equal(await processAccountDeletion("erase-a", {
    deleteMedia: async () => { throw new Error("must not run"); },
    deleteIdentity: async () => { calls++; },
  }), false);
  release();
  assert.equal(await first, true);
  assert.equal(calls, 1);
  assert.equal((await pool.query("SELECT cost_rub FROM df_erased_costs")).rows[0].cost_rub, "97.00");
});

test("7/30 retention keeps unresolved work, uses an exact owner, and never changes the catalogue", async () => {
  await job("expired-done", "succeeded", null, true);
  await job("expired-unknown", "failed", "submission_unknown", true);
  await job("expired-running", "running", null, true);
  await job("recent-done", "succeeded");
  const seen: string[] = [];
  const now = new Date("2026-11-02T12:00:00Z");
  await retentionBatch("", now, async (id, before) => {
    seen.push(id);
    assert.equal(before?.toISOString(), "2026-10-26T12:00:00.000Z");
  });
  assert.deepEqual(seen, ["keep-b"]);
  assert.deepEqual((await pool.query("SELECT id FROM df_jobs ORDER BY id")).rows.map(r => r.id),
    ["expired-running", "expired-unknown", "recent-done"]);
  const uuid = "11111111-1111-4111-8111-111111111111";
  assert.equal(isOwnedSourceKey("erase-a", `${ownedVideoPrefix("erase-a")}${uuid}.mp4`), true);
  assert.equal(isOwnedSourceKey("erase-a", `${ownedVideoPrefix("keep-b")}${uuid}.mp4`), false);
  assert.equal(isOwnedSourceKey("erase-a", `danceflow-catalogue/${uuid}.mp4`), false);
  assert.equal(isOwnedSourceKey("erase-a", `${ownedVideoPrefix("erase-a")}../${uuid}.mp4`), false);
});
