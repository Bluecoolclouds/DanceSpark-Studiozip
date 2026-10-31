import { pgTable, text, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
import { danceAccounts } from "./dance-accounts";

/** External subjects are identities, not account IDs. Existing owners never change. */
export const danceAuthIdentities = pgTable("df_auth_identities", {
  issuer: text("issuer").notNull(),
  subject: text("subject").notNull(),
  accountId: text("account_id").notNull().references(() => danceAccounts.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  primaryKey({ columns: [t.issuer, t.subject] }),
  index("df_auth_identity_account_idx").on(t.accountId),
]);
