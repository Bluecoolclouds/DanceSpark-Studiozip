import "./setup.mjs";
import { randomUUID } from "node:crypto";
import { before, after } from "node:test";
import { pool } from "@workspace/db";

export function isolatedDatabase(extraTables: "df_auth_identities"[] = []) {
  const schema = `df_test_${randomUUID().replaceAll("-", "")}`;
  // Set BEFORE the first connection; never fall through to application tables.
  pool.options.options = `-c search_path=${schema}`;
  before(async () => {
    await pool.query(`CREATE SCHEMA ${schema}`);
    for (const table of ["df_accounts", "df_jobs", "df_controls", "df_admin_audit", "dance_catalogue", "dance_catalogue_opens", "df_erased_costs", "dance_video_generations", ...extraTables]) {
      await pool.query(`CREATE TABLE ${schema}.${table} (LIKE public.${table} INCLUDING ALL)`);
    }
    // LIKE does not copy foreign keys.
    await pool.query(`ALTER TABLE ${schema}.df_jobs ADD FOREIGN KEY (user_id) REFERENCES ${schema}.df_accounts(id)`);
    await pool.query(`ALTER TABLE ${schema}.dance_catalogue_opens ADD FOREIGN KEY (catalogue_id) REFERENCES ${schema}.dance_catalogue(id) ON DELETE CASCADE`);
    if (extraTables.includes("df_auth_identities")) {
      await pool.query(`ALTER TABLE ${schema}.df_auth_identities ADD FOREIGN KEY (account_id) REFERENCES ${schema}.df_accounts(id)`);
    }
  });
  after(async () => {
    try {
      await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    } finally {
      await pool.end();
    }
  });
  return pool;
}
