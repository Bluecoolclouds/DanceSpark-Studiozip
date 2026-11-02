import { pgTable, integer, boolean, numeric, timestamp, text, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const danceControls = pgTable("df_controls", {
  id: integer("id").primaryKey().default(1),
  version: integer("version").notNull().default(0),
  paused: boolean("paused").notNull().default(true),
  maxConcurrent: integer("max_concurrent").notNull().default(3),
  perUserConcurrent: integer("per_user_concurrent").notNull().default(1),
  maxDailySpendRub: numeric("max_daily_spend_rub", { precision: 14, scale: 2 }),
  /** Deprecated legacy fallback. Exact model pricing is required for new jobs. */
  costPerGenerationRub: numeric("cost_per_generation_rub", { precision: 14, scale: 2 }),
  dailyFreeCredits: integer("daily_free_credits").notNull().default(0),
  usdRubRate: numeric("usd_rub_rate", { precision: 14, scale: 6 }).notNull().default("80.5573"),
  usdRubSource: text("usd_rub_source").notNull().default("ЦБ РФ"),
  usdRubDate: date("usd_rub_date", { mode: "string" }).notNull().default("2026-11-02"),
  ownerSeededUserId: integer("owner_seed_marker").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertDanceControlsSchema = createInsertSchema(danceControls);
