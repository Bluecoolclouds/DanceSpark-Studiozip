import { pgTable, text, boolean, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const danceRole = pgEnum("df_role", ["user", "admin"]);
export const dancePlan = pgEnum("df_plan", ["none", "warmup", "dancefloor", "stage"]);
export const danceAccounts = pgTable("df_accounts", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  role: danceRole("role").notNull().default("user"),
  blocked: boolean("blocked").notNull().default(false),
  plan: dancePlan("plan").notNull().default("none"),
  subscriptionUntil: timestamp("subscription_until", { withTimezone: true }),
  dailyLimitOverride: integer("daily_limit_override"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertDanceAccountSchema = createInsertSchema(danceAccounts);
export type DanceAccount = typeof danceAccounts.$inferSelect;
