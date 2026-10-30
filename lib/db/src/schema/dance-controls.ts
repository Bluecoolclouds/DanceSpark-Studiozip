import { pgTable, integer, boolean, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const danceControls = pgTable("df_controls", {
  id: integer("id").primaryKey().default(1),
  version: integer("version").notNull().default(0),
  paused: boolean("paused").notNull().default(true),
  maxConcurrent: integer("max_concurrent").notNull().default(3),
  perUserConcurrent: integer("per_user_concurrent").notNull().default(1),
  maxDailySpendRub: numeric("max_daily_spend_rub", { precision: 14, scale: 2 }),
  costPerGenerationRub: numeric("cost_per_generation_rub", { precision: 14, scale: 2 }),
  ownerSeededUserId: integer("owner_seed_marker").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertDanceControlsSchema = createInsertSchema(danceControls);
