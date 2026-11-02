import { clerkClient, getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";
import { audit, ensureControls } from "../lib/admin-data";
import { getLogtoPrincipal } from "./auth-provider";
import { findLogtoAccount } from "../lib/auth-identities";
import { allowedWebOrigin } from "../lib/web-origins";
import { lifecycleLock } from "../lib/account-lifecycle";

export interface ServerAccount {
  id: string;
  email: string;
  role: "user" | "admin";
  blocked: boolean;
  deletionRequestedAt?: Date | null;
}

/** Ownership always uses the verified internal account, not an external subject. */
export function getAccountId(res: Response): string {
  const account = res.locals.account as ServerAccount | undefined;
  if (!account?.id) throw new Error("Verified Danceflow account required");
  return account.id;
}

/** Grant the configured, verified owner exactly once in each environment. */
export async function seedVerifiedOwner(
  userId: string, verifiedEmails: string[],
): Promise<void> {
  const configured = process.env.DANCEFLOW_OWNER_EMAIL?.trim().toLowerCase();
  if (!configured || !verifiedEmails.some((email) => email.toLowerCase() === configured)) return;
  await ensureControls();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT owner_seed_marker FROM df_controls WHERE id=1 FOR UPDATE");
    if (rows[0].owner_seed_marker === 0) {
      const promoted = await client.query("UPDATE df_accounts SET role='admin' WHERE id=$1 AND deletion_requested_at IS NULL AND blocked=false RETURNING id", [userId]);
      if (promoted.rowCount) {
        await client.query("UPDATE df_controls SET owner_seed_marker=1 WHERE id=1");
        await audit(client, userId, "owner.bootstrap", userId, "Первый администратор: подтверждённый email владельца");
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function resolveAccount(req: Request, res: Response, next: NextFunction, allowDeletion: boolean): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  const logto = getLogtoPrincipal(req);
  if (logto) {
    const id = await findLogtoAccount(logto);
    if (!id) {
      res.status(409).json({ error: "Свяжи существующий аккаунт или явно создай новый.", code: "account_link_required" });
      return;
    }
    const { rows } = await pool.query<ServerAccount>('SELECT id,email,role,blocked,deletion_requested_at AS "deletionRequestedAt" FROM df_accounts WHERE id=$1', [id]);
    if (!rows[0] || (!allowDeletion && (rows[0].blocked || rows[0].deletionRequestedAt))) {
      res.status(403).json({ error: "Доступ аккаунта приостановлен", code: "account_unavailable" });
      return;
    }
    res.locals.account = rows[0];
    next();
    return;
  }
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Войдите в аккаунт" });
    return;
  }
  const selectAccount = 'SELECT id,email,role,blocked,deletion_requested_at AS "deletionRequestedAt" FROM df_accounts WHERE id=$1';
  let { rows } = await pool.query<ServerAccount>(selectAccount, [userId]);
  // Resolve identity exclusively from Clerk, never from a client-supplied email or role.
  if (!rows[0] || (rows[0].role !== "admin" && process.env.DANCEFLOW_OWNER_EMAIL?.trim().toLowerCase() === rows[0].email.toLowerCase())) {
    // Serialize provisioning with upstream deletion. A stale JWT may not recreate
    // a removed DB account using identity details fetched before deletion.
    const client = await pool.connect();
    let verifiedEmails: string[] = [];
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lifecycleLock(userId)]);
      const current = (await client.query(selectAccount, [userId])).rows[0];
      if (!current?.deletionRequestedAt) {
        const identity = await clerkClient.users.getUser(userId);
        const primary = identity.emailAddresses.find((e) => e.id === identity.primaryEmailAddressId);
        await client.query(
          "INSERT INTO df_accounts (id,email) VALUES ($1,$2) ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email",
          [userId, primary?.emailAddress ?? ""],
        );
        verifiedEmails = identity.emailAddresses.filter((e) => e.verification?.status === "verified").map((e) => e.emailAddress);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      const removed = (error as { status?: number })?.status === 404;
      res.status(removed ? 401 : 503).json({
        error: removed ? "Аккаунт входа больше не существует. Войди снова." : "Не удалось проверить вход. Повтори позже.",
        code: "identity_unavailable",
      });
      return;
    } finally { client.release(); }
    if (verifiedEmails.length) await seedVerifiedOwner(userId, verifiedEmails);
    ({ rows } = await pool.query<ServerAccount>(selectAccount, [userId]));
  }
  if (!rows[0] || (!allowDeletion && (rows[0].blocked || rows[0].deletionRequestedAt))) {
    res.status(403).json({ error: rows[0]?.deletionRequestedAt ? "Аккаунт удаляется. Новые действия отключены." : "Доступ аккаунта приостановлен", code: rows[0]?.deletionRequestedAt ? "account_deleting" : "account_unavailable" });
    return;
  }
  res.locals.account = rows[0];
  next();
}

export async function requireAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  return resolveAccount(req, res, next, false);
}

/** Even a blocked account must be able to request its own deletion. */
export async function requireAccountForDeletion(req: Request, res: Response, next: NextFunction): Promise<void> {
  return resolveAccount(req, res, next, true);
}

export function requireAdmin(_req: Request, res: Response, next: NextFunction): void {
  if ((res.locals.account as ServerAccount).role !== "admin") {
    res.status(403).json({ error: "Нужны права администратора" });
    return;
  }
  next();
}

export function protectAdminMutation(req: Request, res: Response, next: NextFunction): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) { next(); return; }
  const origin = req.get("origin");
  try {
    if (origin && allowedWebOrigin(req, origin)) { next(); return; }
  } catch { /* Invalid Origin is rejected below. */ }
  // Native clients may authenticate with a verified bearer token instead of cookies.
  if (!origin && req.get("authorization")?.startsWith("Bearer ")) { next(); return; }
  res.status(403).json({ error: "Запрос изменения должен исходить из админки" });
}
