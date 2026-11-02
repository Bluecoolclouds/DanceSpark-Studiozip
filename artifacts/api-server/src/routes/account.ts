import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, danceAccounts } from "@workspace/db";
import { GetAccountSubscriptionResponse } from "@workspace/api-zod";
import { RequestAccountDeletionBody, GetAccountDeletionResponse } from "@workspace/api-zod";
import { requireAccountForDeletion, protectAdminMutation, getAccountId } from "../middlewares/admin-auth";
import { requestDeletion, deletionStatus, AccountDeletionError } from "../lib/account-lifecycle";
import { requireAccount, type ServerAccount } from "../middlewares/admin-auth";
import { accountSubscription } from "../lib/account-subscription";

const router: IRouter = Router();

router.get("/account/deletion", requireAccountForDeletion, async (_req, res) => {
  res.json(GetAccountDeletionResponse.parse({ status: await deletionStatus(getAccountId(res)) }));
});

router.post("/account/deletion", requireAccountForDeletion, protectAdminMutation, async (req, res) => {
  if (!RequestAccountDeletionBody.strict().safeParse(req.body).success) {
    res.status(400).json({ error: "Для подтверждения введи УДАЛИТЬ." }); return;
  }
  try {
    await requestDeletion(getAccountId(res));
    res.json(GetAccountDeletionResponse.parse({ status: await deletionStatus(getAccountId(res)) }));
  } catch (error) {
    if (error instanceof AccountDeletionError) {
      res.status(409).json({ error: error.publicMessage, code: error.code }); return;
    }
    req.log.error({ category: "deletion_request_failed" }, "Account deletion request was not confirmed");
    res.status(503).json({ error: "Не удалось подтвердить удаление. Проверь статус, прежде чем повторять действие." });
  }
});

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
