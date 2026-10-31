import "./helpers/setup.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { beforeEach, test } from "node:test";
import { isolatedDatabase } from "./helpers/database";
import { beginGeneration, finishGeneration } from "../src/lib/generation-governance";
import {
  recoverStaleSubmissions, startSubmissionRecovery,
  SUBMISSION_RECOVERY_AGE_MS, SUBMISSION_RECOVERY_BATCH_SIZE,
} from "../src/lib/generation-recovery";

const pool = isolatedDatabase();
beforeEach(async () => {
  await pool.query("TRUNCATE df_jobs,df_accounts,df_controls");
  await pool.query("INSERT INTO df_accounts(id,email) VALUES('u1','one@example.invalid')");
  await pool.query("INSERT INTO df_controls(id,paused) VALUES(1,false)");
});

async function job(status = "queued", ageMs = SUBMISSION_RECOVERY_AGE_MS + 60_000, providerId: string | null = null) {
  const id = randomUUID();
  await pool.query(`INSERT INTO df_jobs(id,user_id,idempotency_key,template_id,status,provider_request_id,created_at,estimated_cost_rub)
    VALUES($1,'u1',$1,'bubblegum-rush',$2,$3,now()-($4::double precision * interval '1 millisecond'),5)`,
  [id, status, providerId, ageMs]);
  return id;
}

test("only sufficiently old active jobs without provider IDs change; repeated recovery is a no-op", async () => {
  const oldQueued = await job();
  const oldRunning = await job("running");
  await job("queued", SUBMISSION_RECOVERY_AGE_MS - 5000);
  await job("running", SUBMISSION_RECOVERY_AGE_MS - 5000);
  await job("queued", 0);
  await job("running", 0);
  await job("queued", undefined, "provider-queued");
  await job("running", undefined, "provider-running");
  await job("succeeded");
  await job("failed");
  const before = (await pool.query("SELECT * FROM df_jobs ORDER BY id")).rows;
  assert.equal(await recoverStaleSubmissions(), 2);
  const after = (await pool.query("SELECT * FROM df_jobs ORDER BY id")).rows;
  for (const row of after) {
    const original = before.find((item) => item.id === row.id);
    if ([oldQueued, oldRunning].includes(row.id)) {
      assert.equal(row.status, "failed");
      assert.equal(row.error_code, "submission_unknown");
      assert.ok(row.completed_at instanceof Date);
      assert.equal(row.estimated_cost_rub, original.estimated_cost_rub);
    } else assert.deepEqual(row, original);
  }
  assert.equal(await recoverStaleSubmissions(), 0);
  assert.deepEqual((await pool.query("SELECT * FROM df_jobs ORDER BY id")).rows, after);
  assert.equal(await beginGeneration(oldQueued), false);
  assert.equal(await finishGeneration(oldRunning, "succeeded"), false);
});

test("concurrent recoverers finish each job once in bounded batches", async () => {
  const count = SUBMISSION_RECOVERY_BATCH_SIZE * 2 + 7;
  await pool.query(`INSERT INTO df_jobs(id,user_id,idempotency_key,template_id,created_at)
    SELECT 'batch-'||i,'u1','batch-'||i,'bubblegum',now()-interval '20 minutes' FROM generate_series(1,$1) i`, [count]);
  const outcomes = await Promise.all(Array.from({ length: 6 }, () => recoverStaleSubmissions()));
  assert.equal(outcomes.reduce((a, b) => a + b, 0), count);
  assert.ok(outcomes.every((n) => n <= SUBMISSION_RECOVERY_BATCH_SIZE));
  assert.equal((await pool.query("SELECT count(*)::int n FROM df_jobs WHERE status='failed' AND error_code='submission_unknown'")).rows[0].n, count);
  assert.equal(await recoverStaleSubmissions(), 0);
});

test("provider-ID persistence and terminal transitions winning a race are never overwritten", async () => {
  const id = await job("running");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE df_jobs SET provider_request_id='accepted-provider-id' WHERE id=$1", [id]);
    assert.equal(await recoverStaleSubmissions(), 0, "locked dispatch is skipped, not blocked");
    await client.query("COMMIT");
    assert.equal(await recoverStaleSubmissions(), 0);
    assert.equal(await finishGeneration(id, "succeeded"), true);
    const before = (await pool.query("SELECT * FROM df_jobs WHERE id=$1", [id])).rows[0];
    assert.equal(await recoverStaleSubmissions(), 0);
    assert.deepEqual((await pool.query("SELECT * FROM df_jobs WHERE id=$1", [id])).rows[0], before);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("background recovery starts without a request and uses a stoppable unreferenced timer", async (t) => {
  await job();
  const original = globalThis.setInterval;
  let timer: ReturnType<typeof setInterval> | undefined;
  t.mock.method(globalThis, "setInterval", (...args: Parameters<typeof setInterval>) => {
    timer = original(...args);
    return timer;
  });
  const stop = startSubmissionRecovery();
  try {
    assert.equal(timer?.hasRef(), false);
    // Wait for the asynchronous startup batch, not the minute-long interval.
    for (let i = 0; i < 100; i++) {
      if ((await pool.query("SELECT status FROM df_jobs")).rows[0].status === "failed") return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail("startup recovery did not finish");
  } finally { stop(); }
});
