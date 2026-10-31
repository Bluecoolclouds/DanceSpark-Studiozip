import type { Request, RequestHandler } from "express";
import { decodeJwt } from "jose";
import { AuthFailure, logtoVerifier, type LogtoPrincipal } from "../lib/logto-auth";

const verifiedLogtoIdentities = new WeakMap<Request, LogtoPrincipal>();
export const getLogtoPrincipal = (req: Request) => verifiedLogtoIdentities.get(req);

/** Untrusted iss only selects a verifier. It never selects a key, account or role. */
export function withLogtoAuthentication(clerk: RequestHandler): RequestHandler {
  return async (req, res, next) => {
    if (req.path === "/api/auth/config") { next(); return; }
    const header = req.get("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    let logtoIssuer: string | undefined;
    try {
      if (process.env.LOGTO_ENDPOINT) logtoIssuer = new URL("oidc", process.env.LOGTO_ENDPOINT).href;
    } catch { /* Misconfiguration is rejected by the Logto verifier, never trusted. */ }
    let isLogto = false;
    try { isLogto = !!token && !!logtoIssuer && decodeJwt(token).iss === logtoIssuer; } catch { /* Clerk rejects other invalid tokens. */ }
    if (!isLogto) { clerk(req, res, next); return; }
    try {
      verifiedLogtoIdentities.set(req, await logtoVerifier.accessToken(token!));
      next();
    } catch (error) {
      const known = error instanceof AuthFailure;
      res.status(known ? error.status : 503).json({
        error: known ? error.message : "Не удалось проверить вход.",
        code: known ? error.code : "auth_unavailable",
      });
    }
  };
}
