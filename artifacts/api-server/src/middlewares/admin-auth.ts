import type { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { pool } from "@workspace/db";
import { auth, BETTER_AUTH_ISSUER } from "../lib/better-auth";
import { allowedWebOrigin } from "../lib/web-origins";

export interface ServerAccount {
  id: string;
  email: string;
  role: "user" | "admin";
  blocked: boolean;
  deletionRequestedAt?: Date | null;
}
export function getAccountId(res: Response): string {
  const account = res.locals.account as ServerAccount | undefined;
  if (!account?.id) throw new Error("Verified Danceflow account required");
  return account.id;
}
async function resolveAccount(req: Request, res: Response, next: NextFunction, allowDeletion: boolean): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  if (!req.headers.authorization && !req.headers.cookie) {
    res.status(401).json({ error: "Войдите в аккаунт" }); return;
  }
  let session;
  try { session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }); }
  catch { res.status(503).json({ error: "Не удалось проверить вход. Повтори позже.", code: "identity_unavailable" }); return; }
  if (!session) { res.status(401).json({ error: "Войдите в аккаунт" }); return; }
  const { rows } = await pool.query<ServerAccount>(
    `SELECT a.id,a.email,a.role,a.blocked,a.deletion_requested_at AS "deletionRequestedAt"
     FROM df_accounts a JOIN df_auth_identities i ON i.account_id=a.id
     WHERE i.issuer=$1 AND i.subject=$2`, [BETTER_AUTH_ISSUER, session.user.id]);
  const account = rows[0];
  if (!account || (!allowDeletion && (account.blocked || account.deletionRequestedAt))) {
    res.status(403).json({ error: account?.deletionRequestedAt ? "Аккаунт удаляется. Новые действия отключены." : "Доступ аккаунта приостановлен",
      code: account?.deletionRequestedAt ? "account_deleting" : "account_unavailable" });
    return;
  }
  res.locals.account = account;
  next();
}
export async function requireAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  return resolveAccount(req, res, next, false);
}
export async function requireAccountForDeletion(req: Request, res: Response, next: NextFunction): Promise<void> {
  return resolveAccount(req, res, next, true);
}
export function requireAdmin(_req: Request, res: Response, next: NextFunction): void {
  if ((res.locals.account as ServerAccount).role !== "admin") {
    res.status(403).json({ error: "Нужны права администратора" }); return;
  }
  next();
}
export function protectAdminMutation(req: Request, res: Response, next: NextFunction): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) { next(); return; }
  const origin = req.get("origin");
  if (origin && allowedWebOrigin(req, origin)) { next(); return; }
  // Actual authentication is checked separately; cookies alone cannot bypass CSRF.
  if (!origin && req.get("authorization")?.startsWith("Bearer ")) { next(); return; }
  res.status(403).json({ error: "Недопустимый источник запроса изменения" });
}
