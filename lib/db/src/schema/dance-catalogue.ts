import { pgTable, text, jsonb, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const danceCatalogue = pgTable("dance_catalogue", {
  id: text("id").primaryKey(),
  metadata: jsonb("metadata").notNull().$type<Record<string, unknown>>(),
  published: boolean("published").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});
export const insertDanceCatalogueSchema = createInsertSchema(danceCatalogue);
export type DanceCatalogue = typeof danceCatalogue.$inferSelect;
export type InsertDanceCatalogue = typeof danceCatalogue.$inferInsert;
