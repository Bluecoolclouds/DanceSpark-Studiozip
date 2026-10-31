import { pgTable, text, numeric, timestamp, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
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
]);
export const insertDanceJobSchema = createInsertSchema(danceJobs);
export type DanceJob = typeof danceJobs.$inferSelect;
