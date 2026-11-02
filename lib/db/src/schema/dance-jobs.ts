import { pgTable, text, numeric, timestamp, pgEnum, index, uniqueIndex, integer, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { danceAccounts } from "./dance-accounts";

export const danceJobStatus = pgEnum("df_job_status", ["queued", "running", "succeeded", "failed"]);
export const danceJobs = pgTable("df_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => danceAccounts.id),
  idempotencyKey: text("idempotency_key").notNull(),
  templateId: text("template_id").notNull(),
  status: danceJobStatus("status").notNull().default("queued"),
  estimatedCostRub: numeric("estimated_cost_rub", { precision: 14, scale: 2 }),
  estimatedCostUsd: numeric("estimated_cost_usd", { precision: 14, scale: 6 }),
  usdRubRate: numeric("usd_rub_rate", { precision: 14, scale: 6 }),
  usdRubSource: text("usd_rub_source"),
  usdRubDate: date("usd_rub_date", { mode: "string" }),
  customerPriceRub: numeric("customer_price_rub", { precision: 14, scale: 2 }),
  priceSnapshot: jsonb("price_snapshot"),
  creditsReserved: integer("credits_reserved").notNull().default(0),
  creditDay: date("credit_day", { mode: "string" }),
  accessSource: text("access_source").$type<"credits" | "subscription">(),
  creditState: text("credit_state").$type<"reserved" | "settled" | "refunded">(),
  errorCode: text("error_code"),
  providerRequestId: text("provider_request_id"),
  requestFingerprint: text("request_fingerprint"),
  providerModel: text("provider_model"),
  resultUrl: text("result_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("df_jobs_request_unique").on(t.userId, t.idempotencyKey),
  index("df_jobs_user_created_idx").on(t.userId, t.createdAt),
  index("df_jobs_status_idx").on(t.status),
  index("df_jobs_credit_day_idx").on(t.creditDay, t.accessSource),
]);
export const insertDanceJobSchema = createInsertSchema(danceJobs);
export type DanceJob = typeof danceJobs.$inferSelect;
