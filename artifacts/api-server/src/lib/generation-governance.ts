import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { ensureControls } from "./admin-data";

export class GenerationPolicyError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
    this.name = "GenerationPolicyError";
  }
}

/**
 * Trusted server-only boundary. Call BEFORE submitting a paid provider request.
 * The user identity must come from Clerk, never from a caller-provided userId.
 * Global row locking makes quota, budget and concurrency reservations atomic
 * across multiple processes. An idempotent replay must NEVER call the provider.
 */
export async function reserveGeneration(input: {
  userId: string; idempotencyKey: string; templateId: string;
  fingerprint?: string; model?: string;
  minimumCostRub?: number;
}): Promise<{ id: string; status: string; reused: boolean }> {
  if (!input.userId || !/^[A-Za-z0-9_-]{8,150}$/.test(input.idempotencyKey) ||
    !/^[A-Za-z0-9_-]{1,150}$/.test(input.templateId)) {
    throw new GenerationPolicyError("invalid_request", 400);
  }
  await ensureControls();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const controls = (await client.query("SELECT * FROM df_controls WHERE id=1 FOR UPDATE")).rows[0];
    const user = (await client.query("SELECT * FROM df_accounts WHERE id=$1 FOR UPDATE", [input.userId])).rows[0];
    if (!user || user.blocked) throw new GenerationPolicyError("account_blocked", 403);
    const previous = (await client.query(
      "SELECT id,status,template_id,request_fingerprint FROM df_jobs WHERE user_id=$1 AND idempotency_key=$2",
      [input.userId, input.idempotencyKey],
    )).rows[0];
    if (previous) {
      if (previous.template_id !== input.templateId) throw new GenerationPolicyError("idempotency_conflict", 409);
      if ((previous.request_fingerprint ?? undefined) !== input.fingerprint) throw new GenerationPolicyError("idempotency_conflict", 409);
      await client.query("COMMIT");
      return { id: previous.id, status: previous.status, reused: true };
    }
    if (controls.paused) throw new GenerationPolicyError("generation_paused", 503);
    if (!process.env.higgs_api?.trim()) throw new GenerationPolicyError("provider_not_configured", 503);
    if (!user.subscription_until || new Date(user.subscription_until) <= new Date() || user.plan === "none") {
      throw new GenerationPolicyError("subscription_required", 403);
    }
    const limits: Record<string, number | null> = { warmup: 10, dancefloor: 25, stage: null };
    if (!(user.plan in limits)) throw new GenerationPolicyError("subscription_required", 403);
    const limit = user.daily_limit_override ?? limits[user.plan];
    const { rows: [usage] } = await client.query(`
      SELECT count(*) FILTER (WHERE status IN ('queued','running'))::int AS active,
        count(*) FILTER (WHERE user_id=$1 AND status IN ('queued','running'))::int AS user_active,
        count(*) FILTER (WHERE user_id=$1 AND (status!='failed' OR error_code='submission_unknown') AND
          created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::int AS today,
        COALESCE(sum(estimated_cost_rub) FILTER (WHERE
          created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),0)::float AS spend
      FROM df_jobs`, [input.userId]);
    if (limit != null && usage.today >= limit) throw new GenerationPolicyError("daily_limit_reached", 429);
    if (usage.active >= controls.max_concurrent || usage.user_active >= controls.per_user_concurrent) {
      throw new GenerationPolicyError("concurrency_limit_reached", 429);
    }
    if (controls.cost_per_generation_rub == null || controls.max_daily_spend_rub == null) {
      throw new GenerationPolicyError("budget_not_configured", 503);
    }
    if (input.minimumCostRub !== undefined &&
        (!Number.isFinite(input.minimumCostRub) || input.minimumCostRub <= 0)) {
      throw new GenerationPolicyError("budget_not_configured", 503);
    }
    const cost = Math.max(Number(controls.cost_per_generation_rub), input.minimumCostRub ?? 0);
    if (usage.spend + cost > Number(controls.max_daily_spend_rub)) {
      throw new GenerationPolicyError("daily_budget_reached", 429);
    }
    const id = randomUUID();
    await client.query(
      "INSERT INTO df_jobs(id,user_id,idempotency_key,template_id,estimated_cost_rub,request_fingerprint,provider_model) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [id, input.userId, input.idempotencyKey, input.templateId, cost, input.fingerprint ?? null, input.model ?? null],
    );
    await client.query("COMMIT");
    return { id, status: "queued", reused: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

/** Returns true only for the worker that acquired the job. Recheck global pause. */
export async function beginGeneration(id: string, recheckAccount = false): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [controls] } = await client.query("SELECT paused FROM df_controls WHERE id=1 FOR UPDATE");
    if (!controls || controls.paused) {
      await client.query("ROLLBACK");
      return false;
    }
    if (recheckAccount) {
      const { rows: [account] } = await client.query(
        "SELECT a.* FROM df_accounts a JOIN df_jobs j ON j.user_id=a.id WHERE j.id=$1 FOR UPDATE OF a", [id],
      );
      if (!account || account.blocked) throw new GenerationPolicyError("account_blocked", 403);
      if (!["warmup", "dancefloor", "stage"].includes(account.plan) ||
          !account.subscription_until || new Date(account.subscription_until) <= new Date()) {
        throw new GenerationPolicyError("subscription_required", 403);
      }
    }
    const result = await client.query(
      "UPDATE df_jobs SET status='running' WHERE id=$1 AND status='queued' RETURNING id", [id],
    );
    await client.query("COMMIT");
    return result.rowCount === 1;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

/** Ambiguous submissions retain daily quota; every attempt retains estimated spend. */
export async function finishGeneration(id: string, status: "succeeded" | "failed", errorCode?: "provider_error" | "timeout" | "cancelled" | "submission_unknown"): Promise<boolean> {
  if (!["succeeded", "failed"].includes(status)) throw new GenerationPolicyError("invalid_status", 400);
  const safeCode = status === "failed"
    ? (["provider_error", "timeout", "cancelled", "submission_unknown"].includes(errorCode ?? "") ? errorCode : "provider_error")
    : null;
  const result = await pool.query(
    "UPDATE df_jobs SET status=$2,error_code=$3,completed_at=now() WHERE id=$1 AND status IN ('queued','running') RETURNING id",
    [id, status, safeCode],
  );
  return result.rowCount === 1;
}
