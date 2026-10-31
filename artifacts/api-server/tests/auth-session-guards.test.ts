import "./helpers/setup.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { guardedToken } from "../../../lib/auth-web/src/session-guards";

test("stale API work cannot borrow credentials after an identity change", async () => {
  let active = "owner";
  let finish!: (token: string) => void;
  const pendingToken = new Promise<string>(resolve => { finish = resolve; });
  const read = guardedToken(() => pendingToken, () => active === "owner");
  const pendingRequest = read();
  active = "other";
  finish("new-account-credentials");
  await assert.rejects(pendingRequest, /Сессия изменилась/);
  await assert.rejects(read(), /Сессия изменилась/);
});
test("signed-in API transport fails closed if a provider does not return a token", async () => {
  await assert.rejects(guardedToken(async () => undefined, () => true)(), /Сессия истекла/);
  assert.equal(await guardedToken(async () => "synthetic-token", () => true)(), "synthetic-token");
});
