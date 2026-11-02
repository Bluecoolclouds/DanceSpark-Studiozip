import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { ensureControls } from "./admin-data";
import { ensureDailyCreditBucket } from "./daily-credits";
import type { GenerationPrice } from "./generation-pricing";

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
  pricing?: GenerationPrice;
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
    if (!user || user.blocked || user.deletion_requested_at) throw new GenerationPolicyError("account_blocked", 403);
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
    const price = input.pricing;
    if (!price || !Number.isFinite(price.providerCostUsd) || price.providerCostUsd <= 0 ||
        !Number.isFinite(price.providerCostRub) || price.providerCostRub <= 0 ||
        !Number.isFinite(price.customerPriceRub) || price.customerPriceRub <= 0 ||
        !Number.isSafeInteger(price.credits) || price.credits < 1 ||
        !Number.isFinite(price.usdRubRate) || price.usdRubRate <= 0 ||
        !price.usdRubSource.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(price.usdRubDate)) {
      throw new GenerationPolicyError("pricing_not_configured", 503);
    }
    if (controls.max_daily_spend_rub == null) throw new GenerationPolicyError("budget_not_configured", 503);
    const dailyCredits = await ensureDailyCreditBucket(
      client, input.userId,
      user.daily_credit_override == null ? null : Number(user.daily_credit_override),
      Number(controls.daily_free_credits ?? 0),
    );
    const { rows: [usage] } = await client.query(`
      SELECT count(*) FILTER (WHERE status IN ('queued','running'))::int AS active,
        count(*) FILTER (WHERE user_id=$1 AND status IN ('queued','running'))::int AS user_active,
        COALESCE(sum(estimated_cost_rub) FILTER (WHERE (status!='failed' OR error_code IN ('submission_unknown','timeout')) AND
          created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),0)::float AS spend
      FROM df_jobs`, [input.userId]);
    if (usage.active >= controls.max_concurrent || usage.user_active >= controls.per_user_concurrent) {
      throw new GenerationPolicyError("concurrency_limit_reached", 429);
    }
    const cost = price.providerCostRub;
    const erasedSpend = Number((await client.query(
      "SELECT COALESCE(sum(cost_rub),0) AS spend FROM df_erased_costs WHERE day=(now() AT TIME ZONE 'UTC')::date",
    )).rows[0].spend);
    if (usage.spend + erasedSpend + cost > Number(controls.max_daily_spend_rub)) {
      throw new GenerationPolicyError("daily_budget_reached", 429);
    }

    let accessSource: "credits" | "subscription";
    let creditDay: string | null = null;
    let creditState: "reserved" | null = null;
    let creditsReserved = 0;
    if (dailyCredits.availableCredits >= price.credits) {
      accessSource = "credits";
      creditDay = dailyCredits.utcDay;
      creditState = "reserved";
      creditsReserved = price.credits;
    } else {
      const planLimits: Record<string, number | null> = { warmup: 10, dancefloor: 25, stage: null };
      const subscriptionActive = user.plan in planLimits && user.plan !== "none" &&
        !!user.subscription_until && new Date(user.subscription_until) > new Date();
      if (!subscriptionActive) throw new GenerationPolicyError("insufficient_credits", 403);
      const limit = user.daily_limit_override ?? planLimits[user.plan];
      const { rows: [todayUsage] } = await client.query(`
        SELECT count(*)::int AS today FROM df_jobs
        WHERE user_id=$1 AND access_source IS DISTINCT FROM 'credits' AND
          (status!='failed' OR error_code IN ('submission_unknown','timeout')) AND
          created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      `, [input.userId]);
      if (limit != null && Number(todayUsage.today) >= Number(limit)) {
        throw new GenerationPolicyError("daily_limit_reached", 429);
      }
      accessSource = "subscription";
    }

    const id = randomUUID();
    if (accessSource === "credits") {
      const debited = await client.query(`
        UPDATE df_credit_daily_balances
        SET available_credits=available_credits-$3,reserved_credits=reserved_credits+$3
        WHERE account_id=$1 AND utc_day=$2 AND available_credits >= $3
        RETURNING account_id
      `, [input.userId, creditDay, creditsReserved]);
      if (debited.rowCount !== 1) throw new GenerationPolicyError("insufficient_credits", 409);
      await client.query(`
        INSERT INTO df_credit_ledger (idempotency_key,account_id,utc_day,job_id,event,amount)
        VALUES ($1,$2,$3,$4,'reserve',$5)
      `, [`reserve:${id}`, input.userId, creditDay, id, -creditsReserved]);
    }
    await client.query(
      `INSERT INTO df_jobs
        (id,user_id,idempotency_key,template_id,estimated_cost_rub,estimated_cost_usd,
         usd_rub_rate,usd_rub_source,usd_rub_date,customer_price_rub,credits_reserved,
         credit_day,access_source,credit_state,request_fingerprint,provider_model)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        id, input.userId, input.idempotencyKey, input.templateId, cost, price.providerCostUsd,
        price.usdRubRate, price.usdRubSource, price.usdRubDate, price.customerPriceRub,
        creditsReserved, creditDay, accessSource, creditState,
        input.fingerprint ?? null, input.model ?? null,
      ],
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
        `SELECT a.*,j.access_source AS job_access_source,j.credit_state AS job_credit_state
         FROM df_accounts a JOIN df_jobs j ON j.user_id=a.id WHERE j.id=$1 FOR UPDATE OF a,j`, [id],
      );
      if (!account || account.blocked || account.deletion_requested_at) throw new GenerationPolicyError("account_blocked", 403);
      if (account.job_access_source === "credits" && account.job_credit_state !== "reserved") {
        throw new GenerationPolicyError("credit_reservation_unavailable", 409);
      }
      if (account.job_access_source !== "credits" &&
          (!["warmup", "dancefloor", "stage"].includes(account.plan) ||
          !account.subscription_until || new Date(account.subscription_until) <= new Date())) {
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
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [job] } = await client.query(
      "SELECT id,user_id,credit_day,credits_reserved,credit_state FROM df_jobs WHERE id=$1 AND status IN ('queued','running') FOR UPDATE",
      [id],
    );
    if (!job) { await client.query("COMMIT"); return false; }

    if (job.credit_state === "reserved" && Number(job.credits_reserved) > 0) {
      const refund = status === "failed" && (safeCode === "provider_error" || safeCode === "cancelled");
      if (refund) {
        const updated = await client.query(`
          UPDATE df_credit_daily_balances
          SET reserved_credits=reserved_credits-$3,available_credits=available_credits+$3
          WHERE account_id=$1 AND utc_day=$2 AND reserved_credits >= $3
          RETURNING account_id
        `, [job.user_id, job.credit_day, job.credits_reserved]);
        if (updated.rowCount !== 1) throw new Error("Credit refund ledger invariant failed");
        await client.query(`
          INSERT INTO df_credit_ledger (idempotency_key,account_id,utc_day,job_id,event,amount)
          VALUES ($1,$2,$3,$4,'refund',$5)
        `, [`refund:${id}`, job.user_id, job.credit_day, id, job.credits_reserved]);
      } else if (status === "succeeded") {
        const updated = await client.query(`
          UPDATE df_credit_daily_balances
          SET reserved_credits=reserved_credits-$3,spent_credits=spent_credits+$3
          WHERE account_id=$1 AND utc_day=$2 AND reserved_credits >= $3
          RETURNING account_id
        `, [job.user_id, job.credit_day, job.credits_reserved]);
        if (updated.rowCount !== 1) throw new Error("Credit settlement ledger invariant failed");
        await client.query(`
          INSERT INTO df_credit_ledger (idempotency_key,account_id,utc_day,job_id,event,amount)
          VALUES ($1,$2,$3,$4,'settle',0)
        `, [`settle:${id}`, job.user_id, job.credit_day, id]);
      }
    }
    const creditState = job.credit_state === "reserved"
      ? (status === "succeeded" ? "settled"
        : (safeCode === "provider_error" || safeCode === "cancelled") ? "refunded" : "reserved")
      : job.credit_state;
    await client.query(
      "UPDATE df_jobs SET status=$2,error_code=$3,credit_state=$4,completed_at=now() WHERE id=$1",
      [id, status, safeCode, creditState],
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
