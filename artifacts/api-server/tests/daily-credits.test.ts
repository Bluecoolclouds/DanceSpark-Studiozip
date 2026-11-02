import "./helpers/setup.mjs";
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { isolatedDatabase } from "./helpers/database";
import { testPricing } from "./helpers/pricing";
import { getAccountDailyCredits, issueDailyCreditsForCurrentDay } from "../src/lib/daily-credits";
import { reserveGeneration, beginGeneration, finishGeneration } from "../src/lib/generation-governance";
import { quoteSwapperPrice, PRICED_SWAPPER_MODELS } from "../src/lib/generation-pricing";
import { hasUnsettledWork } from "../src/lib/account-lifecycle";

const pool = isolatedDatabase();
beforeEach(async () => {
  process.env.higgs_api = "synthetic:test-only";
  await pool.query("TRUNCATE df_jobs,df_accounts,df_controls,df_admin_audit,dance_video_generations CASCADE");
  await pool.query("INSERT INTO df_controls(id,paused,max_concurrent,per_user_concurrent,max_daily_spend_rub) VALUES(1,false,20,20,10000)");
  await pool.query(`INSERT INTO df_accounts(id,email,plan,subscription_until)
    VALUES('free','free@example.invalid','none',null),('paid','paid@example.invalid','warmup',now()+interval '1 day'),
      ('other','other@example.invalid','none',null)`);
});
const reserve = (userId = "free", key = randomUUID()) => reserveGeneration({
  userId, idempotencyKey: key, templateId: "trend-01", model: testPricing.model, pricing: testPricing,
});

test("global default is zero, guests fail closed and grants are account-specific", async () => {
  assert.equal((await getAccountDailyCredits("free")).availableCredits, 0);
  await assert.rejects(getAccountDailyCredits("guest"), /unavailable/);
  await assert.rejects(reserve(), /insufficient_credits/);
  await assert.rejects(reserveGeneration({ userId: "guest", idempotencyKey: randomUUID(), templateId: "trend-01", pricing: testPricing }), /account_blocked/);
});

test("concurrent global and account issuance grants exactly once to paid and free accounts", async () => {
  await pool.query("UPDATE df_controls SET daily_free_credits=20");
  await pool.query("UPDATE df_accounts SET daily_credit_override=0 WHERE id='other'");
  await Promise.all(Array.from({ length: 8 }, (_, i) => i % 2 ? issueDailyCreditsForCurrentDay() : getAccountDailyCredits("free")));
  for (const id of ["free", "paid"]) assert.equal((await getAccountDailyCredits(id)).grantedCredits, 20);
  assert.equal((await getAccountDailyCredits("other")).grantedCredits, 0);
  assert.equal((await pool.query("SELECT count(*)::int n FROM df_credit_ledger WHERE event='daily_grant'")).rows[0].n, 3);
  await pool.query("UPDATE df_controls SET daily_free_credits=100");
  assert.equal((await getAccountDailyCredits("free")).grantedCredits, 20, "no mid-day second grant");
});

test("old UTC balances never carry forward and reset points to next UTC midnight", async () => {
  await pool.query("UPDATE df_controls SET daily_free_credits=7");
  await pool.query(`INSERT INTO df_credit_daily_balances(account_id,utc_day,granted_credits,available_credits)
    VALUES('free',(now() AT TIME ZONE 'UTC')::date-1,100,100)`);
  const balance = await getAccountDailyCredits("free");
  assert.equal(balance.availableCredits, 7);
  assert.equal(balance.resetAt, new Date(new Date(`${balance.utcDay}T00:00:00Z`).getTime() + 86400000).toISOString());
  assert.equal((await pool.query("SELECT count(*)::int n FROM df_credit_daily_balances WHERE account_id='free'")).rows[0].n, 2);
});

test("concurrent reservations cannot overspend and duplicate requests debit only once", async () => {
  await pool.query("UPDATE df_controls SET daily_free_credits=6");
  const outcomes = await Promise.allSettled(Array.from({ length: 8 }, () => reserve()));
  assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1);
  const row = (await pool.query("SELECT * FROM df_jobs")).rows[0];
  const same = await Promise.all(Array.from({ length: 6 }, () => reserve("free", row.idempotency_key)));
  assert.ok(same.every(r => r.reused && r.id === row.id));
  assert.equal((await getAccountDailyCredits("free")).reservedCredits, 6);
  assert.equal((await getAccountDailyCredits("other")).availableCredits, 6);
  assert.equal((await pool.query("SELECT count(*)::int n FROM df_credit_ledger WHERE event='reserve'")).rows[0].n, 1);
  assert.deepEqual(row.price_snapshot, testPricing);
});

test("subscribers use credits first without spending quota, then use the separate subscription lane", async () => {
  await pool.query("UPDATE df_controls SET daily_free_credits=6");
  await pool.query("UPDATE df_accounts SET daily_limit_override=1 WHERE id='paid'");
  const first = await reserve("paid");
  assert.equal(await beginGeneration(first.id, true), true);
  await finishGeneration(first.id, "succeeded");
  const second = await reserve("paid");
  assert.equal((await pool.query("SELECT access_source FROM df_jobs WHERE id=$1", [second.id])).rows[0].access_source, "subscription");
  await assert.rejects(reserve("paid"), /daily_limit_reached/);
  assert.equal((await getAccountDailyCredits("paid")).spentCredits, 6);
});

test("safe pre-submission failure refunds once; success settles once", async () => {
  await pool.query("UPDATE df_controls SET daily_free_credits=12");
  const first = await reserve();
  assert.equal(await finishGeneration(first.id, "failed", "provider_error"), true);
  assert.equal(await finishGeneration(first.id, "failed", "provider_error"), false);
  assert.equal((await getAccountDailyCredits("free")).availableCredits, 12);
  const second = await reserve();
  await finishGeneration(second.id, "succeeded");
  await finishGeneration(second.id, "succeeded");
  const balance = await getAccountDailyCredits("free");
  assert.equal(balance.availableCredits, 6);
  assert.equal(balance.spentCredits, 6);
  assert.equal(balance.reservedCredits, 0);
});

test("a refund after UTC rollover stays in the expired original bucket", async () => {
  await pool.query("UPDATE df_controls SET daily_free_credits=6");
  const job = await reserve();
  await pool.query("UPDATE df_credit_daily_balances SET utc_day=utc_day-1 WHERE account_id='free'");
  await pool.query("UPDATE df_jobs SET credit_day=credit_day-1 WHERE id=$1", [job.id]);
  const today = await getAccountDailyCredits("free");
  assert.equal(today.availableCredits, 6);
  await finishGeneration(job.id, "failed", "provider_error");
  assert.equal((await getAccountDailyCredits("free")).availableCredits, 6);
  const yesterday = (await pool.query("SELECT available_credits,reserved_credits FROM df_credit_daily_balances WHERE account_id='free' AND utc_day=$1::date-1", [today.utcDay])).rows[0];
  assert.equal(yesterday.available_credits, 6);
  assert.equal(yesterday.reserved_credits, 0);
});

test("uncertain and possibly billed provider failures keep reserves and block deletion", async () => {
  await pool.query("UPDATE df_controls SET daily_free_credits=30");
  for (const code of ["submission_unknown", "timeout", "billing_unconfirmed"] as const) {
    const job = await reserve();
    await finishGeneration(job.id, "failed", code);
    assert.equal(await finishGeneration(job.id, "failed", "provider_error"), false);
  }
  const balance = await getAccountDailyCredits("free");
  assert.equal(balance.availableCredits, 12);
  assert.equal(balance.reservedCredits, 18);
  assert.equal(await hasUnsettledWork(pool, "free"), true);
});

test("pause, API spend budget, ownership and missing prices still block credit-funded work", async () => {
  await pool.query("UPDATE df_controls SET daily_free_credits=100,paused=true");
  await assert.rejects(reserve(), /generation_paused/);
  await pool.query("UPDATE df_controls SET paused=false,max_daily_spend_rub=4");
  await assert.rejects(reserve(), /daily_budget_reached/);
  await pool.query("UPDATE df_controls SET max_daily_spend_rub=1000");
  await assert.rejects(reserveGeneration({ userId: "free", idempotencyKey: randomUUID(), templateId: "trend-01" }), /pricing_not_configured/);
  assert.equal((await getAccountDailyCredits("free")).availableCredits, 100);
  assert.equal((await pool.query("SELECT count(*)::int n FROM df_jobs")).rows[0].n, 0);
});

test("official USD rates convert to whole ruble credits with a 15 percent markup", () => {
  const fx = { rate: 80.5573, source: "ЦБ РФ", date: "2026-11-02" };
  for (const model of PRICED_SWAPPER_MODELS) {
    for (const [index, resolution] of (["480p", "720p", "1080p"] as const).entries()) {
      const price = quoteSwapperPrice(model.id, 15, resolution, fx)!;
      assert.equal(price.credits, (model.family === "light" ? [139, 278, 556] : [442, 947, 2268])[index]);
      assert.ok(price.credits >= price.providerCostUsd * fx.rate * 1.15);
      assert.equal(price.billableSeconds, model.family === "light" ? 30 : 15);
    }
  }
  assert.equal(quoteSwapperPrice("unknown", 15, "720p", fx), null);
  assert.equal(quoteSwapperPrice(PRICED_SWAPPER_MODELS[0].id, NaN, "720p", fx), null);
  assert.equal(quoteSwapperPrice(PRICED_SWAPPER_MODELS[0].id, 15, "720p", { ...fx, rate: 0 }), null);
});
