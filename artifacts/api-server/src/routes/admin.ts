import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import {
  GetAdminSessionResponse, GetAdminOverviewResponse, ListAdminUsersQueryParams,
  ListAdminUsersResponse, UpdateAdminUserParams, UpdateAdminUserBody, UpdateAdminUserResponse,
  ListAdminGenerationsQueryParams, ListAdminGenerationsResponse,
  GetAdminSettingsResponse, UpdateAdminSettingsBody, UpdateAdminSettingsResponse,
  GetAdminCreditEconomyQueryParams, GetAdminCreditEconomyResponse,
  ListAdminAuditQueryParams, ListAdminAuditResponse,
} from "@workspace/api-zod";
import { requireAccount, requireAdmin, protectAdminMutation, type ServerAccount } from "../middlewares/admin-auth";
import { ensureControls, audit, settingsResponse, userProjection, serializeUser } from "../lib/admin-data";
import {
  CREDIT_VALUE_RUB, GENERATION_MARKUP_RATE, PRICED_SWAPPER_MODELS, quoteSwapperPrice,
} from "../lib/generation-pricing";

const router: IRouter = Router();
const PAGE_SIZE = 25;
router.use("/admin", requireAccount);
router.get("/admin/session", (_req, res): void => {
  const account = res.locals.account as ServerAccount;
  res.json(GetAdminSessionResponse.parse({
    userId: account.id, email: account.email, isAdmin: account.role === "admin",
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
  }));
});
router.use("/admin", requireAdmin, protectAdminMutation);

router.get("/admin/overview", async (_req, res): Promise<void> => {
  const { rows } = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM df_accounts) AS users,
      (SELECT count(*)::int FROM df_accounts WHERE blocked) AS "blockedUsers",
      (SELECT count(*)::int FROM df_accounts WHERE plan!='none' AND subscription_until>now()) AS "activeSubscriptions",
      count(*)::int AS generations,
      count(*) FILTER (WHERE status='succeeded')::int AS succeeded,
      count(*) FILTER (WHERE status='failed')::int AS failed,
      count(*) FILTER (WHERE status='queued')::int AS queued,
      count(*) FILTER (WHERE status='running')::int AS running,
      count(*) FILTER (WHERE created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::int AS "todayGenerations",
      (COALESCE(sum(estimated_cost_rub),0)+(SELECT COALESCE(sum(cost_rub),0) FROM df_erased_costs))::float AS "estimatedCostRub",
      (COALESCE(sum(estimated_cost_rub) FILTER (WHERE created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),0)+
        (SELECT COALESCE(sum(cost_rub),0) FROM df_erased_costs WHERE day=(now() AT TIME ZONE 'UTC')::date))::float AS "todayEstimatedCostRub",
      (count(*) FILTER (WHERE estimated_cost_rub IS NULL)+(SELECT COALESCE(sum(unpriced),0) FROM df_erased_costs))::int AS "unpricedGenerations"
    FROM df_jobs`);
  res.json(GetAdminOverviewResponse.parse({ ...rows[0], generatedAt: new Date().toISOString(), telemetryConnected: false }));
});

router.get("/admin/users", async (req, res): Promise<void> => {
  const query = ListAdminUsersQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Некорректные параметры поиска" }); return; }
  const { q = "", page = 1 } = query.data;
  const search = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const where = "WHERE (a.email ILIKE $1 OR a.id ILIKE $1)";
  const [items, count] = await Promise.all([
    pool.query(`SELECT ${userProjection} FROM df_accounts a ${where} ORDER BY a.created_at DESC,a.id LIMIT $2 OFFSET $3`, [search, PAGE_SIZE, (page - 1) * PAGE_SIZE]),
    pool.query(`SELECT count(*)::int AS total FROM df_accounts a ${where}`, [search]),
  ]);
  res.json(ListAdminUsersResponse.parse({ items: items.rows.map(serializeUser), total: count.rows[0].total, page, pageSize: PAGE_SIZE }));
});

router.patch("/admin/users/:id", async (req, res): Promise<void> => {
  const params = UpdateAdminUserParams.safeParse(req.params);
  const body = UpdateAdminUserBody.strict().safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Некорректный пользователь или лимит" }); return; }
  const actor = res.locals.account as ServerAccount;
  if (params.data.id === actor.id && body.data.blocked) {
    res.status(400).json({ error: "Нельзя заблокировать собственный административный аккаунт" }); return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      "UPDATE df_accounts SET blocked=$2,daily_limit_override=$3,daily_credit_override=$4 WHERE id=$1 AND deletion_requested_at IS NULL RETURNING id",
      [params.data.id, body.data.blocked, body.data.dailyLimitOverride, body.data.dailyCreditOverride],
    );
    if (!updated.rowCount) { await client.query("ROLLBACK"); res.status(404).json({ error: "Пользователь не найден" }); return; }
    await audit(client, actor.id, "user.controls.update", params.data.id, JSON.stringify(body.data));
    await client.query("COMMIT");
    const { rows } = await pool.query(`SELECT ${userProjection} FROM df_accounts a WHERE a.id=$1`, [params.data.id]);
    res.json(UpdateAdminUserResponse.parse(serializeUser(rows[0])));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});

router.get("/admin/generations", async (req, res): Promise<void> => {
  const query = ListAdminGenerationsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Некорректный фильтр" }); return; }
  const { page = 1, status = "all" } = query.data;
  const where = "WHERE ($1::text='all' OR j.status::text=$1)";
  const [items, count] = await Promise.all([
    pool.query(`SELECT j.id,j.user_id AS "userId",a.email AS "userEmail",j.template_id AS "templateId",
      j.status,j.estimated_cost_rub::float AS "estimatedCostRub",
      j.estimated_cost_usd::float AS "estimatedCostUsd",j.customer_price_rub::float AS "customerPriceRub",
      j.credits_reserved AS "creditsReserved",j.access_source AS "accessSource",j.error_code AS "errorCode",
      j.created_at AS "createdAt",j.completed_at AS "completedAt"
      FROM df_jobs j JOIN df_accounts a ON a.id=j.user_id ${where}
      ORDER BY j.created_at DESC,j.id LIMIT $2 OFFSET $3`, [status, PAGE_SIZE, (page - 1) * PAGE_SIZE]),
    pool.query(`SELECT count(*)::int AS total FROM df_jobs j ${where}`, [status]),
  ]);
  res.json(ListAdminGenerationsResponse.parse({
    items: items.rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null })),
    total: count.rows[0].total, page, pageSize: PAGE_SIZE,
  }));
});

router.get("/admin/settings", async (_req, res): Promise<void> => {
  await ensureControls();
  const { rows } = await pool.query("SELECT * FROM df_controls WHERE id=1");
  res.json(GetAdminSettingsResponse.parse(settingsResponse(rows[0])));
});

router.patch("/admin/settings", async (req, res): Promise<void> => {
  const body = UpdateAdminSettingsBody.strict().safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Проверьте лимиты и стоимость: значения должны быть положительными" }); return; }
  const b = body.data;
  if (b.perUserConcurrent > b.maxConcurrent) {
    res.status(400).json({ error: "Лимит пользователя не может превышать общий лимит" }); return;
  }
  if (!b.paused && (b.maxDailySpendRub == null || !process.env.higgs_api?.trim())) {
    res.status(400).json({ error: "Перед снятием паузы задайте дневной бюджет и серверный AI-ключ" }); return;
  }
  await ensureControls();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE df_controls SET version=version+1,paused=$2,max_concurrent=$3,per_user_concurrent=$4,
       max_daily_spend_rub=$5,cost_per_generation_rub=NULL,daily_free_credits=$6,
       usd_rub_rate=$7,usd_rub_source=$8,usd_rub_date=$9,updated_at=now()
       WHERE id=1 AND version=$1 RETURNING *`,
      [b.version, b.paused, b.maxConcurrent, b.perUserConcurrent, b.maxDailySpendRub,
        b.dailyFreeCredits, b.usdRubRate, b.usdRubSource.trim(), b.usdRubDate],
    );
    if (!rows[0]) { await client.query("ROLLBACK"); res.status(409).json({ error: "Настройки уже изменены. Обновите их перед сохранением" }); return; }
    await audit(client, (res.locals.account as ServerAccount).id, "generation.settings.update", null, JSON.stringify(b));
    await client.query("COMMIT");
    res.json(UpdateAdminSettingsResponse.parse(settingsResponse(rows[0])));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});

router.get("/admin/credit-economy", async (req, res): Promise<void> => {
  const parsed = GetAdminCreditEconomyQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Укажи длительность от 4 до 300 секунд." }); return; }
  await ensureControls();
  const [controls, accounts, spend] = await Promise.all([
    pool.query("SELECT daily_free_credits,usd_rub_rate,usd_rub_source,usd_rub_date::text AS usd_rub_date FROM df_controls WHERE id=1"),
    pool.query(`
      SELECT count(*)::int AS registered_accounts,
        COALESCE(sum(GREATEST(COALESCE(a.daily_credit_override,c.daily_free_credits),0)),0)::bigint AS effective_daily_credits
      FROM df_accounts a CROSS JOIN df_controls c
      WHERE c.id=1 AND a.deletion_requested_at IS NULL
    `),
    pool.query(`
      SELECT
        (COALESCE(sum(estimated_cost_rub) FILTER (WHERE status!='failed' OR error_code IN ('submission_unknown','timeout','billing_unconfirmed')),0)
          + (SELECT COALESCE(sum(cost_rub),0) FROM df_erased_costs WHERE day=(now() AT TIME ZONE 'UTC')::date))::float
          AS today_estimated_api_cost_rub,
        COALESCE(sum(estimated_cost_rub) FILTER (WHERE access_source='credits' AND
          (status!='failed' OR error_code IN ('submission_unknown','timeout','billing_unconfirmed'))),0)::float
          AS today_credit_api_cost_rub
      FROM df_jobs
      WHERE created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    `),
  ]);
  const setting = controls.rows[0];
  const rate = Number(setting.usd_rub_rate);
  const fx = { rate, source: String(setting.usd_rub_source), date: String(setting.usd_rub_date) };
  const seconds = parsed.data.seconds ?? 15;
  const rows = PRICED_SWAPPER_MODELS.flatMap((model) =>
    (["480p", "720p", "1080p"] as const).map((resolution) => {
      const quote = quoteSwapperPrice(model.id, seconds, resolution, fx);
      if (!quote) throw new Error("Configured model tariff is unavailable");
      return {
        model: model.id, modelName: model.name, family: model.family, resolution,
        sourceSeconds: seconds, billableSeconds: quote.billableSeconds,
        providerCostUsd: quote.providerCostUsd, providerCostRub: quote.providerCostRub,
        customerPriceRub: quote.customerPriceRub, credits: quote.credits,
        pricingSource: model.pricingSource,
      };
    }),
  );
  const effectiveDailyCredits = Number(accounts.rows[0].effective_daily_credits);
  res.json(GetAdminCreditEconomyResponse.parse({
    seconds,
    registeredAccounts: Number(accounts.rows[0].registered_accounts),
    dailyFreeCredits: Number(setting.daily_free_credits),
    effectiveDailyCredits,
    maxDailyCreditValueRub: effectiveDailyCredits * CREDIT_VALUE_RUB,
    estimatedMaxApiCostRub: Math.ceil((effectiveDailyCredits / (1 + GENERATION_MARKUP_RATE)) * 100) / 100,
    todayEstimatedApiCostRub: Number(spend.rows[0].today_estimated_api_cost_rub),
    todayCreditApiCostRub: Number(spend.rows[0].today_credit_api_cost_rub),
    creditValueRub: CREDIT_VALUE_RUB, markupPercent: GENERATION_MARKUP_RATE * 100,
    usdRubRate: rate, usdRubSource: fx.source, usdRubDate: fx.date, rows,
  }));
});

router.get("/admin/audit", async (req, res): Promise<void> => {
  const query = ListAdminAuditQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Некорректная страница" }); return; }
  const page = query.data.page ?? 1;
  const [items, count] = await Promise.all([
    pool.query(`SELECT id,actor_id AS "actorId",action,target_id AS "targetId",details,created_at AS "createdAt"
      FROM df_admin_audit ORDER BY created_at DESC,id LIMIT $1 OFFSET $2`, [PAGE_SIZE, (page - 1) * PAGE_SIZE]),
    pool.query("SELECT count(*)::int AS total FROM df_admin_audit"),
  ]);
  res.json(ListAdminAuditResponse.parse({ items: items.rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })), total: count.rows[0].total, page, pageSize: PAGE_SIZE }));
});

export default router;
