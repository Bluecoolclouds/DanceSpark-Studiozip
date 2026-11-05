import { authReleaseProblems } from "../src/lib/auth-environment";

const mode = process.argv[2] ?? "config";
if (!["config", "database"].includes(mode)) {
  console.error("Usage: check-auth-release.ts config|database");
  process.exitCode = 1;
} else if (mode === "config") {
  const problems = authReleaseProblems(process.env);
  if (problems.length) {
    console.error("Auth release configuration: NOT READY");
    for (const problem of problems) console.error(`- ${problem}`);
    process.exitCode = 1;
  } else {
    console.log("Auth release configuration: OK (secret values are never printed).");
  }
  console.log("SMTP intentionally deferred. This check neither publishes nor migrates a database.");
} else {
  // Read-only against this process's configured database. No account data is printed.
  const { pool } = await import("@workspace/db");
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '10000'");
    // Check the password/session/rate-limit tables without reading their contents.
    await client.query(`SELECT id,email,email_verified FROM df_auth_user LIMIT 0`);
    await client.query(`SELECT id,user_id,token,expires_at FROM df_auth_session LIMIT 0`);
    await client.query(`SELECT id,user_id,provider_id,password FROM df_auth_credential LIMIT 0`);
    await client.query(`SELECT id,identifier,value,expires_at FROM df_auth_verification LIMIT 0`);
    await client.query(`SELECT id,key,count,last_request FROM df_auth_rate_limit LIMIT 0`);
    const result = await client.query(`
      SELECT
        (SELECT count(*)::int FROM df_accounts a
          JOIN df_auth_identities i ON i.account_id=a.id AND i.issuer='danceflow:better-auth'
          JOIN df_auth_user u ON u.id=i.subject
          JOIN df_auth_credential c ON c.user_id=u.id AND c.provider_id='credential' AND c.password IS NOT NULL
          WHERE a.role='admin' AND NOT a.blocked AND a.deletion_requested_at IS NULL) AS owners,
        (SELECT count(*)::int FROM df_accounts a WHERE NOT EXISTS
          (SELECT 1 FROM df_auth_identities i JOIN df_auth_user u ON u.id=i.subject
            WHERE i.account_id=a.id AND i.issuer='danceflow:better-auth')) AS migration_needed,
        (SELECT count(*)::int FROM df_auth_user u WHERE NOT EXISTS
          (SELECT 1 FROM df_auth_identities i JOIN df_accounts a ON a.id=i.account_id
            WHERE i.subject=u.id AND i.issuer='danceflow:better-auth')) AS orphan_logins
    `);
    await client.query("COMMIT");
    const { owners, migration_needed, orphan_logins } = result.rows[0];
    console.log(`Auth database (configured environment): schema OK; owners=${owners}; migration_needed=${migration_needed}; orphan_logins=${orphan_logins}.`);
    if (!owners || migration_needed || orphan_logins) {
      console.error("NOT READY: confirm owner access and resolve account migration before cutover. No data changed.");
      process.exitCode = 1;
    } else console.log("Auth database readiness: OK. No data changed.");
  } catch {
    await client?.query("ROLLBACK").catch(() => {});
    console.error("Auth database check failed: connection or required schema is unavailable. No data changed; no credentials printed.");
    process.exitCode = 1;
  } finally { client?.release(); await pool.end(); }
}
