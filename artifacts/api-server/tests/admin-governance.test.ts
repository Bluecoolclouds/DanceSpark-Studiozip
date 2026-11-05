import "./helpers/setup.mjs";
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { isolatedDatabase } from "./helpers/database";
import { testPricing } from "./helpers/pricing";
import { reserveGeneration, beginGeneration, finishGeneration } from "../src/lib/generation-governance";
import { requireAdmin, protectAdminMutation } from "../src/middlewares/admin-auth";
import { settingsResponse } from "../src/lib/admin-data";
import { UpdateAdminSettingsBody, UpdateAdminUserBody } from "@workspace/api-zod";
import app from "../src/app";
import type { AddressInfo } from "node:net";
import type { Request, Response } from "express";
import adminRouter from "../src/routes/admin";

const pool = isolatedDatabase();
beforeEach(async () => {
  process.env.higgs_api = "unit-test-id:unit-test-secret";
  await pool.query("TRUNCATE df_jobs,df_accounts,df_controls,df_admin_audit CASCADE");
  await pool.query(`INSERT INTO df_controls(id,paused,max_concurrent,per_user_concurrent,max_daily_spend_rub,cost_per_generation_rub)
    VALUES(1,false,10,5,10000,5)`);
  await pool.query(`INSERT INTO df_accounts(id,email,plan,subscription_until)
    VALUES('u1','one@example.invalid','warmup',now()+interval '1 day'),
          ('u2','two@example.invalid','dancefloor',now()+interval '1 day'),
          ('u3','three@example.invalid','stage',now()+interval '1 day')`);
});

const reserve = (key = randomUUID(), userId = "u1") => reserveGeneration({ userId, idempotencyKey: key, templateId: "bubblegum", pricing: testPricing });
const expectPolicy = (work: Promise<unknown>, code: string) => assert.rejects(work, (e: unknown) => e instanceof Error && e.message === code);

test("missing provider configuration still fails closed without reserving spend", async () => {
  delete process.env.higgs_api;
  await expectPolicy(reserve(), "provider_not_configured");
  assert.equal((await pool.query("SELECT count(*)::int n FROM df_jobs")).rows[0].n, 0);
});

test("fixtures cannot modify or fall through to public application tables", async () => {
  const { rows: [row] } = await pool.query("SELECT current_schema() AS schema, current_setting('search_path') AS path");
  assert.match(row.schema, /^df_test_[a-f0-9]+$/);
  assert.equal(row.path, row.schema);
  assert.equal((await pool.query("SELECT count(*)::int n FROM public.df_accounts")).rows[0].n, 0);
  assert.equal((await pool.query("SELECT count(*)::int n FROM df_accounts")).rows[0].n, 3);
  await assert.rejects(pool.query("INSERT INTO df_jobs(id,user_id,idempotency_key,template_id) VALUES('bad','missing','some-key','bubblegum')"),
    (error: any) => error.code === "23503");
});

test("pause, unpaid, expired and blocked accounts fail closed", async () => {
  await pool.query("UPDATE df_controls SET paused=true");
  await expectPolicy(reserve(), "generation_paused");
  await pool.query("UPDATE df_controls SET paused=false");
  await pool.query("UPDATE df_accounts SET plan='none' WHERE id='u1'");
  await expectPolicy(reserve(), "insufficient_credits");
  await pool.query("UPDATE df_accounts SET plan='warmup',subscription_until=now()-interval '1 day' WHERE id='u1'");
  await expectPolicy(reserve(), "insufficient_credits");
  await pool.query("UPDATE df_accounts SET blocked=true WHERE id='u1'");
  await expectPolicy(reserve(), "account_blocked");
});

test("concurrent duplicate requests reserve only one paid operation", async () => {
  const key = randomUUID();
  const results = await Promise.all(Array.from({ length: 8 }, () => reserve(key)));
  assert.equal(new Set(results.map((r) => r.id)).size, 1);
  assert.equal(results.filter((r) => !r.reused).length, 1);
  assert.equal((await pool.query("SELECT count(*)::int n FROM df_jobs")).rows[0].n, 1);
  await expectPolicy(reserveGeneration({ userId: "u1", idempotencyKey: key, templateId: "different" }), "idempotency_conflict");
});

test("the tenth generation wins an atomic daily quota race", async () => {
  for (let i = 0; i < 9; i++) {
    const job = await reserve();
    await finishGeneration(job.id, "succeeded");
  }
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => reserve()));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await pool.query("SELECT count(*)::int n FROM df_jobs")).rows[0].n, 10);
});

test("25/day and unlimited plans differ, and an override is enforced", async () => {
  for (const userId of ["u2", "u3"]) {
    for (let i = 0; i < 25; i++) {
      const job = await reserve(randomUUID(), userId);
      await finishGeneration(job.id, "succeeded");
    }
  }
  await expectPolicy(reserve(randomUUID(), "u2"), "daily_limit_reached");
  assert.equal((await reserve(randomUUID(), "u3")).reused, false);
  await pool.query("UPDATE df_accounts SET daily_limit_override=0 WHERE id='u1'");
  await expectPolicy(reserve(), "daily_limit_reached");
});

test("budget and parallel limits cannot overshoot under concurrent requests", async () => {
  await pool.query("UPDATE df_controls SET max_daily_spend_rub=9,cost_per_generation_rub=5");
  const outcomes = await Promise.allSettled(["u1", "u2", "u3"].map((u) => reserve(randomUUID(), u)));
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  await pool.query("UPDATE df_controls SET max_daily_spend_rub=10000,max_concurrent=1");
  await expectPolicy(reserve(randomUUID(), "u2"), "concurrency_limit_reached");
});

test("pause prevents provider submission; claiming and terminal updates are idempotent", async () => {
  const job = await reserve();
  await pool.query("UPDATE df_controls SET paused=true");
  assert.equal(await beginGeneration(job.id), false);
  await pool.query("UPDATE df_controls SET paused=false");
  assert.equal(await beginGeneration(job.id), true);
  assert.equal(await beginGeneration(job.id), false);
  assert.equal(await finishGeneration(job.id, "failed", "timeout"), true);
  assert.equal(await finishGeneration(job.id, "succeeded"), false);
  const row = (await pool.query("SELECT status,error_code,estimated_cost_rub FROM df_jobs WHERE id=$1", [job.id])).rows[0];
  assert.equal(row.status, "failed");
  assert.equal(row.error_code, "timeout");
  assert.equal(Number(row.estimated_cost_rub), 5);
});

test("configured owner email alone cannot grant an administrator role", async () => {
  await pool.query("UPDATE df_accounts SET email='owner@example.invalid' WHERE id='u1'");
  assert.equal((await pool.query("SELECT role FROM df_accounts WHERE id='u1'")).rows[0].role, "user");
  assert.equal((await pool.query("SELECT count(*)::int n FROM df_admin_audit")).rows[0].n, 0);
});

test("role and cross-origin mutation checks are enforced independently of UI", () => {
  let status = 0; let next = false;
  const response = { locals: { account: { role: "user" } }, status(n: number) { status = n; return this; }, json() {} } as unknown as Response;
  requireAdmin({} as Request, response, () => { next = true; });
  assert.equal(status, 403); assert.equal(next, false);
  const request = { method: "PATCH", headers: { host: "admin.example" }, get(name: string) { return name === "origin" ? "https://attacker.example" : undefined; } } as unknown as Request;
  status = 0;
  protectAdminMutation(request, response, () => { next = true; });
  assert.equal(status, 403); assert.equal(next, false);
});

test("validation rejects invalid limits; settings contain presence, never credentials", async () => {
  assert.equal(UpdateAdminUserBody.safeParse({ blocked: false, dailyLimitOverride: -1 }).success, false);
  assert.equal(UpdateAdminSettingsBody.safeParse({ version: 0, paused: true, maxConcurrent: 0, perUserConcurrent: 1, maxDailySpendRub: null, costPerGenerationRub: null }).success, false);
  const row = (await pool.query("SELECT * FROM df_controls WHERE id=1")).rows[0];
  const data = settingsResponse(row);
  assert.equal(typeof data.providerKeyConfigured, "boolean");
  assert.equal(Object.keys(data).some((key) => /secret|token|apikey|password/i.test(key)), false);
  assert.equal(data.telemetryConnected, false);
});

test("HTTP admin endpoints reject anonymous access and fake bearer tokens", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    const health = await fetch(`${root}/healthz`, { headers: { Accept: "application/json" } });
    assert.equal(health.status, 200);
    for (const path of ["/admin/session", "/admin/overview", "/admin/users", "/admin/settings", "/admin/generations", "/admin/audit"]) {
      const result = await fetch(`${root}${path}`, { headers: { Accept: "application/json" } });
      assert.equal(result.status, 401, path);
    }
    const forged = await fetch(`${root}/admin/overview`, { headers: { Accept: "application/json", Authorization: "Bearer fabricated.invalid.token" } });
    assert.equal(forged.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});

test("admin endpoint handlers return live data, persist edits, audit them and reject stale versions", async () => {
  // Invoke route handlers only; production authentication middleware remains untouched.
  // The independent HTTP test above confirms that mounting does not bypass it.
  const call = async (method: string, path: string, input: Partial<Request> = {}) => {
    let status = 200;
    let body: any;
    const layer = (adminRouter as unknown as {
      stack: { route?: { path: string; methods: Record<string, boolean>; stack: { handle: Function }[] } }[];
    }).stack.find((l) => l.route?.path === path && l.route.methods[method]);
    assert.ok(layer?.route, `handler ${method} ${path}`);
    const response = {
      locals: { account: { id: "u1", role: "admin", email: "one@example.invalid" } },
      status(value: number) { status = value; return this; },
      json(value: unknown) { body = value; },
    };
    await layer.route.stack[0].handle({ params: {}, query: {}, ...input }, response);
    return { status, body };
  };
  const overview = await call("get", "/admin/overview");
  assert.equal(overview.body.users, 3);
  assert.equal(overview.body.generations, 0);
  assert.equal(overview.body.telemetryConnected, false);
  const users = await call("get", "/admin/users", { query: { q: "two@" } });
  assert.equal(users.body.total, 1);
  assert.equal(users.body.items[0].id, "u2");
  const updated = await call("patch", "/admin/users/:id", { params: { id: "u2" }, body: { blocked: true, dailyLimitOverride: 7, dailyCreditOverride: 40 } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.blocked, true);
  assert.equal(updated.body.dailyLimitOverride, 7);
  assert.equal(updated.body.dailyCreditOverride, 40);
  const rejectedGrant = await call("patch", "/admin/users/:id", { params: { id: "u2" }, body: { blocked: false, dailyLimitOverride: null, role: "admin" } });
  assert.equal(rejectedGrant.status, 400);
  const selfBlock = await call("patch", "/admin/users/:id", { params: { id: "u1" }, body: { blocked: true, dailyLimitOverride: null } });
  assert.equal(selfBlock.status, 400);
  const settings = await call("get", "/admin/settings");
  const newSettings = { version: settings.body.version, paused: true, maxConcurrent: 3, perUserConcurrent: 1, maxDailySpendRub: 100, dailyFreeCredits: 10, usdRubRate: 80.5573, usdRubSource: "ЦБ РФ", usdRubDate: "2026-11-02" };
  const saved = await call("patch", "/admin/settings", { body: newSettings });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.version, newSettings.version + 1);
  assert.equal(saved.body.paused, true);
  assert.equal(saved.body.dailyFreeCredits, 10);
  const economy = await call("get", "/admin/credit-economy");
  assert.equal(economy.status, 200);
  assert.equal(economy.body.effectiveDailyCredits, 60);
  assert.equal(economy.body.rows.length, 12);
  assert.equal(economy.body.rows.find((row: any) => row.model.includes("light") && row.resolution === "720p").credits, 278);
  assert.equal((await call("patch", "/admin/settings", { body: newSettings })).status, 409);
  const generations = await call("get", "/admin/generations");
  assert.equal(generations.body.total, 0);
  const audit = await call("get", "/admin/audit");
  assert.equal(audit.body.total, 2);
  assert.deepEqual(new Set(audit.body.items.map((e: { action: string }) => e.action)), new Set(["user.controls.update", "generation.settings.update"]));
});
