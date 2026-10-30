import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const danceVideoGenerations = pgTable("dance_video_generations", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),
  clientRequestId: text("client_request_id").notNull(),
  providerRequestId: text("provider_request_id"),
  state: text("state").$type<"reserved" | "queued" | "failed">().notNull().default("reserved"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("dance_video_owner_client_request_idx").on(t.ownerId, t.clientRequestId),
  index("dance_video_created_at_idx").on(t.createdAt),
]);
