import { date, integer, pgTable, primaryKey, text, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { danceAccounts } from "./dance-accounts";

/** One non-carrying daily bucket per account. Available + reserved + spent = granted. */
export const danceCreditDailyBalances = pgTable("df_credit_daily_balances", {
  accountId: text("account_id").notNull().references(() => danceAccounts.id, { onDelete: "cascade" }),
  utcDay: date("utc_day", { mode: "string" }).notNull(),
  grantedCredits: integer("granted_credits").notNull().default(0),
  availableCredits: integer("available_credits").notNull().default(0),
  reservedCredits: integer("reserved_credits").notNull().default(0),
  spentCredits: integer("spent_credits").notNull().default(0),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.accountId, t.utcDay], name: "df_credit_daily_balances_pk" }),
  check("df_credit_daily_balances_nonnegative", sql`
    ${t.grantedCredits} >= 0 AND ${t.availableCredits} >= 0 AND
    ${t.reservedCredits} >= 0 AND ${t.spentCredits} >= 0 AND
    ${t.availableCredits} + ${t.reservedCredits} + ${t.spentCredits} = ${t.grantedCredits}
  `),
]);

export type DanceCreditDailyBalance = typeof danceCreditDailyBalances.$inferSelect;
