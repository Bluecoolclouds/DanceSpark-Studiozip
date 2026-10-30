import type { DanceAccount } from "@workspace/db";

export function accountSubscription(
  account: Pick<DanceAccount, "id" | "plan" | "subscriptionUntil">,
  now = new Date(),
) {
  const status = account.plan === "none" || !account.subscriptionUntil
    ? "inactive"
    : account.subscriptionUntil > now ? "active" : "expired";
  return {
    accountId: account.id,
    plan: account.plan,
    status,
    subscriptionUntil: account.subscriptionUntil?.toISOString() ?? null,
  };
}
