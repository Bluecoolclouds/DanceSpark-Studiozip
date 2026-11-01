import { pgTable, text, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
import { danceCatalogue } from "./dance-catalogue";

export const danceCatalogueOpens = pgTable("dance_catalogue_opens", {
  catalogueId: text("catalogue_id").notNull().references(() => danceCatalogue.id, { onDelete: "cascade" }),
  visitorHash: text("visitor_hash").notNull(),
  lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.catalogueId, table.visitorHash] }),
  index("dance_catalogue_opens_last_opened_idx").on(table.lastOpenedAt),
]);
