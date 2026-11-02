import { randomUUID } from "node:crypto";
import { pool, type PoolClient } from "@workspace/db";

export async function ensureControls() {
  await pool.query("INSERT INTO df_controls (id) VALUES (1) ON CONFLICT DO NOTHING");
}

export async function audit(
  client: PoolClient, actorId: string, action: string, targetId: string | null, details: string,
) {
  await client.query(
    "INSERT INTO df_admin_audit (id,actor_id,action,target_id,details) VALUES ($1,$2,$3,$4,$5)",
    [randomUUID(), actorId, action, targetId, details],
  );
}

export function settingsResponse(row: Record<string, unknown>) {
  return {
    version: Number(row.version),
    paused: Boolean(row.paused),
    maxConcurrent: Number(row.max_concurrent),
    perUserConcurrent: Number(row.per_user_concurrent),
    maxDailySpendRub: row.max_daily_spend_rub == null ? null : Number(row.max_daily_spend_rub),
    dailyFreeCredits: Number(row.daily_free_credits ?? 0),
    usdRubRate: Number(row.usd_rub_rate),
    usdRubSource: String(row.usd_rub_source ?? ""),
    usdRubDate: String(row.usd_rub_date),
    providerKeyConfigured: Boolean(process.env.higgs_api?.trim()),
    provider: "Higgsfield",
    keyStorage: "Серверные секреты окружения; значение не передаётся в браузер",
    telemetryConnected: false,
    quotaTimezone: "UTC",
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

export const userProjection = `
  a.id,a.email,a.role,a.blocked,a.plan,
  a.subscription_until AS "subscriptionUntil",
  a.daily_limit_override AS "dailyLimitOverride",
  a.daily_credit_override AS "dailyCreditOverride",
  COALESCE((SELECT b.granted_credits FROM df_credit_daily_balances b WHERE b.account_id=a.id
    AND b.utc_day=(now() AT TIME ZONE 'UTC')::date),
    COALESCE(a.daily_credit_override,(SELECT daily_free_credits FROM df_controls WHERE id=1),0))::int
    AS "todayCreditGrant",
  COALESCE((SELECT b.available_credits FROM df_credit_daily_balances b WHERE b.account_id=a.id
    AND b.utc_day=(now() AT TIME ZONE 'UTC')::date),0)::int AS "todayCreditBalance",
  COALESCE((SELECT b.reserved_credits FROM df_credit_daily_balances b WHERE b.account_id=a.id
    AND b.utc_day=(now() AT TIME ZONE 'UTC')::date),0)::int AS "todayCreditReserved",
  a.created_at AS "createdAt",
  (SELECT count(*)::int FROM df_jobs j WHERE j.user_id=a.id) AS "totalGenerations",
  (SELECT count(*)::int FROM df_jobs j WHERE j.user_id=a.id AND
    j.access_source IS DISTINCT FROM 'credits' AND
    (j.status != 'failed' OR j.error_code IN ('submission_unknown','timeout','billing_unconfirmed')) AND
    j.created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
    AS "todayGenerations"`;

export function serializeUser(row: Record<string, unknown>) {
  return {
    ...row,
    createdAt: (row.createdAt as Date).toISOString(),
    subscriptionUntil: row.subscriptionUntil ? (row.subscriptionUntil as Date).toISOString() : null,
  };
}
