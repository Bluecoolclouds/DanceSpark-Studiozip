import { clerkClient, getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";
import { audit, ensureControls } from "../lib/admin-data";
import { getClerkProxyHost } from "./clerkProxyMiddleware";

export interface ServerAccount {
  id: string;
  email: string;
  role: "user" | "admin";
  blocked: boolean;
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
      await client.query("UPDATE df_accounts SET role='admin' WHERE id=$1", [userId]);
      await client.query("UPDATE df_controls SET owner_seed_marker=1 WHERE id=1");
      await audit(client, userId, "owner.bootstrap", userId, "Первый администратор: подтверждённый email владельца");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function requireAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Войдите в аккаунт" });
    return;
  }
  let { rows } = await pool.query<ServerAccount>("SELECT id,email,role,blocked FROM df_accounts WHERE id=$1", [userId]);
  // Resolve identity exclusively from Clerk, never from a client-supplied email or role.
  if (!rows[0] || (rows[0].role !== "admin" && process.env.DANCEFLOW_OWNER_EMAIL?.trim().toLowerCase() === rows[0].email.toLowerCase())) {
    const identity = await clerkClient.users.getUser(userId);
    const primary = identity.emailAddresses.find((e) => e.id === identity.primaryEmailAddressId);
    await pool.query(
      "INSERT INTO df_accounts (id,email) VALUES ($1,$2) ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email",
      [userId, primary?.emailAddress ?? ""],
    );
    await seedVerifiedOwner(userId, identity.emailAddresses.filter((e) => e.verification?.status === "verified").map((e) => e.emailAddress));
    ({ rows } = await pool.query<ServerAccount>("SELECT id,email,role,blocked FROM df_accounts WHERE id=$1", [userId]));
  }
  if (rows[0].blocked) {
    res.status(403).json({ error: "Доступ аккаунта приостановлен" });
    return;
  }
  res.locals.account = rows[0];
  next();
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
    if (origin && new URL(origin).host === getClerkProxyHost(req)) { next(); return; }
  } catch { /* Invalid Origin is rejected below. */ }
  // Native clients may authenticate with a verified bearer token instead of cookies.
  if (!origin && req.get("authorization")?.startsWith("Bearer ")) { next(); return; }
  res.status(403).json({ error: "Запрос изменения должен исходить из админки" });
}
