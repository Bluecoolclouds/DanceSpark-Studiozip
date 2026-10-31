import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, danceAccounts } from "@workspace/db";
import { GetAccountSubscriptionResponse } from "@workspace/api-zod";
import { requireAccount, type ServerAccount } from "../middlewares/admin-auth";
import { accountSubscription } from "../lib/account-subscription";

const router: IRouter = Router();

// requireAccount resolves a verified identity to the stable Danceflow account.
router.get("/account/subscription", requireAccount, async (req, res): Promise<void> => {
  try {
    const identity = res.locals.account as ServerAccount;
    const [account] = await db.select().from(danceAccounts)
      .where(eq(danceAccounts.id, identity.id)).limit(1);
    if (!account) {
      res.status(503).json({ error: "Не удалось проверить подписку. Попробуй ещё раз." });
      return;
    }
    res.json(GetAccountSubscriptionResponse.parse(accountSubscription(account)));
  } catch (error) {
    req.log.error({ err: error }, "Account subscription lookup failed");
    res.status(503).json({ error: "Не удалось проверить подписку. Попробуй ещё раз." });
  }
});

export default router;
