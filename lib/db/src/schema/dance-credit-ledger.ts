import { date, integer, pgEnum, pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { danceAccounts } from "./dance-accounts";
import { danceJobs } from "./dance-jobs";

export const danceCreditEvent = pgEnum("df_credit_event", ["daily_grant", "reserve", "settle", "refund"]);

/** Append-only events; idempotencyKey makes grants and job transitions replay-safe. */
export const danceCreditLedger = pgTable("df_credit_ledger", {
  idempotencyKey: text("idempotency_key").primaryKey(),
  accountId: text("account_id").notNull().references(() => danceAccounts.id, { onDelete: "cascade" }),
  utcDay: date("utc_day", { mode: "string" }).notNull(),
  jobId: text("job_id").references(() => danceJobs.id, { onDelete: "cascade" }),
  event: danceCreditEvent("event").notNull(),
  amount: integer("amount").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("df_credit_ledger_account_day_idx").on(t.accountId, t.utcDay),
  index("df_credit_ledger_job_idx").on(t.jobId),
]);

export type DanceCreditLedgerEntry = typeof danceCreditLedger.$inferSelect;
