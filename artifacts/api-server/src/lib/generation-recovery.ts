import { pool } from "@workspace/db";
import { logger } from "./logger";

// Upload URL (45s), photo upload (60s), paid submission (45s), plus ample
// scheduling/DB headroom. Use database time so API instance clock skew is safe.
export const SUBMISSION_RECOVERY_AGE_MS = 10 * 60 * 1000;
export const SUBMISSION_RECOVERY_BATCH_SIZE = 100;
export const SUBMISSION_RECOVERY_INTERVAL_MS = 60 * 1000;

/** One bounded, atomic batch. No provider calls and no automatic resubmission. */
export async function recoverStaleSubmissions(): Promise<number> {
  const result = await pool.query(`
    WITH candidates AS (
      SELECT id FROM df_jobs
      WHERE status IN ('queued','running') AND provider_request_id IS NULL
        AND created_at < now() - ($1::double precision * interval '1 millisecond')
      ORDER BY created_at, id
      LIMIT $2 FOR UPDATE SKIP LOCKED
    )
    UPDATE df_jobs AS job
    SET status='failed', error_code='submission_unknown', completed_at=now()
    FROM candidates
    WHERE job.id=candidates.id AND job.status IN ('queued','running')
      AND job.provider_request_id IS NULL
      AND job.created_at < now() - ($1::double precision * interval '1 millisecond')
    RETURNING job.id
  `, [SUBMISSION_RECOVERY_AGE_MS, SUBMISSION_RECOVERY_BATCH_SIZE]);
  return result.rowCount ?? 0;
}

/** Start asynchronously; skip overlapping ticks and don't keep Node alive. */
export function startSubmissionRecovery(): () => void {
  let running = false;
  let stopped = false;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      const recovered = await recoverStaleSubmissions();
      if (recovered) logger.info({ recovered }, "Recovered ambiguous generation submissions");
    } catch (err) {
      logger.error({ err }, "Generation submission recovery failed");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => { void tick(); }, SUBMISSION_RECOVERY_INTERVAL_MS);
  timer.unref();
  void tick();
  return () => { stopped = true; clearInterval(timer); };
}
