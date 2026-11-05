import { Router, type IRouter } from "express";
import { requireAccount } from "../middlewares/admin-auth";

const router: IRouter = Router();
router.get("/auth/session", requireAccount, (_req, res) => {
  const account = res.locals.account;
  res.json({ accountId: account.id, email: account.email, role: account.role });
});
export default router;
