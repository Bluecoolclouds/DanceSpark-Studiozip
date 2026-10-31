import { Router, type IRouter, type Response } from "express";
import { pool } from "@workspace/db";
import { getAuth } from "@clerk/express";
import { GetAuthConfigResponse, GetAuthSessionResponse, LinkLogtoAccountBody, RegisterLogtoAccountBody } from "@workspace/api-zod";
import { requireAccount, protectAdminMutation, seedVerifiedOwner, type ServerAccount } from "../middlewares/admin-auth";
import { getLogtoPrincipal } from "../middlewares/auth-provider";
import { AuthFailure, logtoConfiguration, logtoVerifier } from "../lib/logto-auth";
import { linkIdentity, registerIdentity } from "../lib/auth-identities";

const router: IRouter = Router();
const session = (account: ServerAccount) => GetAuthSessionResponse.parse({
  accountId: account.id, email: account.email, role: account.role,
});
function failure(res: Response, error: unknown) {
  const known = error instanceof AuthFailure;
  res.status(known ? error.status : 503).json({
    error: known ? error.message : "Не удалось проверить аккаунт. Повтори попытку.",
    code: known ? error.code : "auth_unavailable",
  });
}

router.get("/auth/config", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const config = logtoConfiguration();
    res.json(GetAuthConfigResponse.parse({ enabled: !!config, endpoint: config?.endpoint ?? "",
      webAppId: config?.webAppId ?? "", adminAppId: config?.adminAppId ?? "", resource: config?.resource ?? "" }));
  } catch (error) { failure(res, error); }
});

router.get("/auth/session", requireAccount, (_req, res) => {
  res.json(session(res.locals.account));
});

router.post("/auth/logto/link", requireAccount, protectAdminMutation, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (getLogtoPrincipal(req) || !getAuth(req).userId) {
      throw new AuthFailure(401, "legacy_session_required", "Для привязки войди в существующий аккаунт через Clerk.");
    }
    const parsed = LinkLogtoAccountBody.strict().safeParse(req.body);
    if (!parsed.success) throw new AuthFailure(400, "invalid_identity_proof", "Не удалось прочитать подтверждение входа.");
    const identity = await logtoVerifier.accessToken(parsed.data.accessToken);
    await logtoVerifier.identityToken(parsed.data.idToken, identity);
    await linkIdentity(identity, (res.locals.account as ServerAccount).id);
    res.json(session(res.locals.account));
  } catch (error) { failure(res, error); }
});

router.post("/auth/logto/register", protectAdminMutation, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const identity = getLogtoPrincipal(req);
    if (!identity) throw new AuthFailure(401, "logto_session_required", "Сначала войди через Logto.");
    const parsed = RegisterLogtoAccountBody.strict().safeParse(req.body);
    if (!parsed.success) throw new AuthFailure(400, "invalid_identity_proof", "Не удалось прочитать подтверждение входа.");
    const email = await logtoVerifier.identityToken(parsed.data.idToken, identity);
    const accountId = await registerIdentity(identity, email);
    await seedVerifiedOwner(accountId, email ? [email] : []);
    const { rows } = await pool.query<ServerAccount>("SELECT id,email,role,blocked FROM df_accounts WHERE id=$1", [accountId]);
    if (!rows[0] || rows[0].blocked) throw new AuthFailure(403, "account_unavailable", "Аккаунт недоступен.");
    res.status(201).json(session(rows[0]));
  } catch (error) { failure(res, error); }
});

export default router;
