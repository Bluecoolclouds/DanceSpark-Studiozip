import { date, integer, numeric, pgTable } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

/** Daily aggregates only: no account, job, request, or provider identifiers. */
export const danceErasedCosts = pgTable("df_erased_costs", {
  day: date("day", { mode: "string" }).primaryKey(),
  costRub: numeric("cost_rub", { precision: 14, scale: 2 }).notNull().default("0"),
  unpriced: integer("unpriced").notNull().default(0),
});
export const insertDanceErasedCostsSchema = createInsertSchema(danceErasedCosts);
export type DanceErasedCosts = typeof danceErasedCosts.$inferSelect;
