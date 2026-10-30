import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const danceAudit = pgTable("df_admin_audit", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  targetId: text("target_id"),
  details: text("details").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("df_audit_created_idx").on(t.createdAt)]);
export const insertDanceAuditSchema = createInsertSchema(danceAudit);
