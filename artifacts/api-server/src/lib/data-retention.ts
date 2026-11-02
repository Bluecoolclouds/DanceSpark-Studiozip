import { pool } from "@workspace/db";
import { SOURCE_RETENTION_DAYS, hasUnsettledWork, processAccountDeletion } from "./account-lifecycle";
import { deleteOwnedCustomVideos } from "./custom-video-storage";
import { logger } from "./logger";

/** Bounded owner batches; accounts with any unresolved work keep all sources. */
export async function retentionBatch(after = "", now = new Date(),
  cleanupSources = deleteOwnedCustomVideos): Promise<string | null> {
  const client = await pool.connect();
  let locked = false;
  try {
    locked = (await client.query("SELECT pg_try_advisory_lock(60108,7) AS locked")).rows[0].locked;
    if (!locked) return after;
    const accounts = (await client.query(
      "SELECT id FROM df_accounts WHERE id>$1 ORDER BY id LIMIT 25", [after],
    )).rows;
    for (const { id } of accounts) {
      try {
        await client.query("BEGIN");
        const account = (await client.query("SELECT deletion_requested_at FROM df_accounts WHERE id=$1 FOR UPDATE", [id])).rows[0];
        if (account && !account.deletion_requested_at && !await hasUnsettledWork(client, id)) {
          await cleanupSources(id, new Date(now.getTime() - SOURCE_RETENTION_DAYS * 86400000));
        }
        await client.query("COMMIT");
      } catch {
        await client.query("ROLLBACK");
        logger.warn({ category: "source_retention_retry" }, "Private source cleanup will be retried");
      }
    }
    // Never expire pending/ambiguous submissions, regardless of their age.
    await client.query(`DELETE FROM df_jobs WHERE id IN (
      SELECT id FROM df_jobs WHERE status IN ('succeeded','failed')
        AND error_code IS DISTINCT FROM 'submission_unknown'
        AND COALESCE(completed_at,created_at) < $1::timestamptz - interval '30 days' LIMIT 250
    )`, [now]);
    await client.query("DELETE FROM df_erased_costs WHERE day<($1::timestamptz AT TIME ZONE 'UTC')::date-30", [now]);
    return accounts.length === 25 ? accounts[accounts.length - 1].id : null;
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(60108,7)");
    client.release();
  }
}

export function startAccountMaintenance() {
  let stopped = false;
  let busy = false;
  let cursor = "";
  let nextRetention = 0;
  async function tick() {
    if (busy || stopped) return;
    busy = true;
    try {
      const pending = (await pool.query("SELECT id FROM df_accounts WHERE deletion_requested_at IS NOT NULL ORDER BY deletion_requested_at LIMIT 10")).rows;
      for (const { id } of pending) {
        if (stopped) break;
        if (!await processAccountDeletion(id)) {
          logger.warn({ category: "account_deletion_retry" }, "Account deletion not complete; retry scheduled");
        }
      }
      // Preparation is non-destructive by default. Enable only after backup and
      // release configuration review; the agreed policy is tested independently.
      if (process.env.DANCEFLOW_DATA_CLEANUP_ENABLED === "true" && Date.now() >= nextRetention) {
        const next = await retentionBatch(cursor);
        cursor = next ?? "";
        nextRetention = Date.now() + (next === null ? 3600000 : 60000);
      }
    } catch {
      logger.error({ category: "account_maintenance_retry" }, "Account maintenance unavailable; retry scheduled");
    } finally { busy = false; }
  }
  const timer = setInterval(() => { void tick(); }, 60000);
  timer.unref();
  return () => { stopped = true; clearInterval(timer); };
}
