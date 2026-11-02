import { randomUUID } from "node:crypto";
import { pool, type PoolClient } from "@workspace/db";
import { AuthFailure, type LogtoPrincipal } from "./logto-auth";

export async function findLogtoAccount(principal: LogtoPrincipal): Promise<string | null> {
  const { rows } = await pool.query(
    "SELECT account_id FROM df_auth_identities WHERE issuer=$1 AND subject=$2",
    [principal.issuer, principal.subject],
  );
  return rows[0]?.account_id ?? null;
}

async function identityLock(client: PoolClient, principal: LogtoPrincipal) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",
    [`auth:${principal.issuer}:${principal.subject}`]);
}

export async function linkIdentity(principal: LogtoPrincipal, accountId: string): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await identityLock(client, principal);
    const existing = (await client.query(
      "SELECT account_id FROM df_auth_identities WHERE issuer=$1 AND subject=$2",
      [principal.issuer, principal.subject],
    )).rows[0];
    if (existing && existing.account_id !== accountId) {
      throw new AuthFailure(409, "identity_already_linked", "Этот вход Logto уже связан с другим аккаунтом. Автоматическое объединение запрещено.");
    }
    const account = (await client.query("SELECT blocked,deletion_requested_at FROM df_accounts WHERE id=$1 FOR UPDATE", [accountId])).rows[0];
    if (!account || account.blocked || account.deletion_requested_at) throw new AuthFailure(403, "account_unavailable", "Аккаунт недоступен.");
    if (!existing) await client.query(
      "INSERT INTO df_auth_identities(issuer,subject,account_id) VALUES($1,$2,$3)",
      [principal.issuer, principal.subject, accountId],
    );
    await client.query("COMMIT");
    return accountId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

/** Explicit registration only; a matching email is never proof of account ownership. */
export async function registerIdentity(principal: LogtoPrincipal, email: string | null): Promise<string> {
  if (!email) throw new AuthFailure(422, "verified_email_required", "Подтверди email в Logto перед регистрацией.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await identityLock(client, principal);
    const existing = (await client.query(
      "SELECT account_id FROM df_auth_identities WHERE issuer=$1 AND subject=$2",
      [principal.issuer, principal.subject],
    )).rows[0];
    if (existing) {
      const account = (await client.query("SELECT blocked,deletion_requested_at FROM df_accounts WHERE id=$1", [existing.account_id])).rows[0];
      if (!account || account.blocked || account.deletion_requested_at) throw new AuthFailure(403, "account_unavailable", "Аккаунт недоступен.");
      await client.query("COMMIT");
      return existing.account_id;
    }
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`auth-email:${email}`]);
    const duplicate = await client.query("SELECT 1 FROM df_accounts WHERE lower(email)=$1 LIMIT 1", [email]);
    if (duplicate.rows.length) throw new AuthFailure(409, "account_link_required",
      "С таким email уже есть аккаунт Danceflow. Войди старым способом и свяжи его с Logto.");
    const accountId = randomUUID();
    await client.query("INSERT INTO df_accounts(id,email) VALUES($1,$2)", [accountId, email]);
    await client.query("INSERT INTO df_auth_identities(issuer,subject,account_id) VALUES($1,$2,$3)",
      [principal.issuer, principal.subject, accountId]);
    await client.query("COMMIT");
    return accountId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
