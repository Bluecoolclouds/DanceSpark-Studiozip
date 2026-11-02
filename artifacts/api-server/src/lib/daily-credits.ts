import { pool, type PoolClient } from "@workspace/db";
import { ensureControls } from "./admin-data";

export interface DailyCreditSnapshot {
  accountId: string;
  utcDay: string;
  grantedCredits: number;
  availableCredits: number;
  reservedCredits: number;
  spentCredits: number;
  resetAt: string;
}

function nextUtcReset(day: string) {
  const reset = new Date(`${day}T00:00:00.000Z`);
  reset.setUTCDate(reset.getUTCDate() + 1);
  return reset.toISOString();
}

/**
 * Issues one bucket per registered account for the current UTC day. The
 * account/day primary key makes startup, midnight and multi-server retries safe.
 */
export async function issueDailyCreditsForCurrentDay(): Promise<number> {
  await ensureControls();
  const result = await pool.query(`
    WITH today AS (
      SELECT (now() AT TIME ZONE 'UTC')::date AS utc_day
    ), inserted AS (
      INSERT INTO df_credit_daily_balances
        (account_id,utc_day,granted_credits,available_credits)
      SELECT a.id,today.utc_day,
        GREATEST(COALESCE(a.daily_credit_override,c.daily_free_credits),0),
        GREATEST(COALESCE(a.daily_credit_override,c.daily_free_credits),0)
      FROM df_accounts a CROSS JOIN df_controls c CROSS JOIN today
      WHERE c.id=1 AND a.deletion_requested_at IS NULL
      ON CONFLICT (account_id,utc_day) DO NOTHING
      RETURNING account_id,utc_day,granted_credits
    )
    INSERT INTO df_credit_ledger (idempotency_key,account_id,utc_day,event,amount)
    SELECT 'grant:'||account_id||':'||utc_day::text,account_id,utc_day,'daily_grant',granted_credits
    FROM inserted
    ON CONFLICT (idempotency_key) DO NOTHING
  `);
  return result.rowCount ?? 0;
}

/** Must be called inside the account's transaction, after reading its settings. */
export async function ensureDailyCreditBucket(
  client: PoolClient,
  accountId: string,
  dailyCreditOverride: number | null,
  globalDailyCredits: number,
) {
  const { rows: [today] } = await client.query(
    "SELECT (now() AT TIME ZONE 'UTC')::date::text AS utc_day",
  );
  const utcDay = today.utc_day as string;
  const grant = Math.max(0, dailyCreditOverride ?? globalDailyCredits);
  const inserted = await client.query(`
    INSERT INTO df_credit_daily_balances
      (account_id,utc_day,granted_credits,available_credits)
    VALUES ($1,$2,$3,$3)
    ON CONFLICT (account_id,utc_day) DO NOTHING
    RETURNING account_id
  `, [accountId, utcDay, grant]);
  if (inserted.rowCount === 1) {
    await client.query(`
      INSERT INTO df_credit_ledger (idempotency_key,account_id,utc_day,event,amount)
      VALUES ($1,$2,$3,'daily_grant',$4)
      ON CONFLICT (idempotency_key) DO NOTHING
    `, [`grant:${accountId}:${utcDay}`, accountId, utcDay, grant]);
  }
  const { rows: [balance] } = await client.query(`
    SELECT account_id AS "accountId",utc_day::text AS "utcDay",
      granted_credits AS "grantedCredits",available_credits AS "availableCredits",
      reserved_credits AS "reservedCredits",spent_credits AS "spentCredits"
    FROM df_credit_daily_balances
    WHERE account_id=$1 AND utc_day=$2
    FOR UPDATE
  `, [accountId, utcDay]);
  if (!balance) throw new Error("Daily credit bucket was not created");
  return {
    ...balance,
    grantedCredits: Number(balance.grantedCredits),
    availableCredits: Number(balance.availableCredits),
    reservedCredits: Number(balance.reservedCredits),
    spentCredits: Number(balance.spentCredits),
  } as DailyCreditSnapshot;
}

export async function getAccountDailyCredits(accountId: string): Promise<DailyCreditSnapshot> {
  await ensureControls();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [controls] } = await client.query(
      "SELECT daily_free_credits FROM df_controls WHERE id=1",
    );
    const { rows: [account] } = await client.query(
      "SELECT daily_credit_override,blocked,deletion_requested_at FROM df_accounts WHERE id=$1 FOR UPDATE",
      [accountId],
    );
    if (!account || account.blocked || account.deletion_requested_at) {
      throw new Error("Account is unavailable");
    }
    const bucket = await ensureDailyCreditBucket(
      client, accountId,
      account.daily_credit_override == null ? null : Number(account.daily_credit_override),
      Number(controls?.daily_free_credits ?? 0),
    );
    await client.query("COMMIT");
    return { ...bucket, resetAt: nextUtcReset(bucket.utcDay) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Run at process start and at each UTC midnight; all inserts are idempotent. */
export function startDailyCreditIssuance(onError: (error: unknown) => void) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    if (stopped) return;
    try {
      await issueDailyCreditsForCurrentDay();
    } catch (error) {
      onError(error);
    } finally {
      if (stopped) return;
      const now = new Date();
      const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 5));
      timer = setTimeout(() => void run(), Math.max(1_000, next.getTime() - Date.now()));
      timer.unref?.();
    }
  };
  void run();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
