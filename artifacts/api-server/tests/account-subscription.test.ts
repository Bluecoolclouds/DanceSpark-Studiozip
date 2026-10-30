import "./helpers/setup.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { accountSubscription } from "../src/lib/account-subscription";

const now = new Date("2026-10-30T12:00:00Z");

test("only a server plan with a future expiry is active", () => {
  for (const plan of ["warmup", "dancefloor", "stage"] as const) {
    const result = accountSubscription({
      id: "account-a", plan, subscriptionUntil: new Date("2026-11-30T12:00:00Z"),
    }, now);
    assert.equal(result.status, "active");
    assert.equal(result.plan, plan);
    assert.equal(result.accountId, "account-a");
  }
});

test("missing plan or missing expiry never grants access", () => {
  assert.equal(accountSubscription({
    id: "a", plan: "none", subscriptionUntil: new Date("2027-01-01"),
  }, now).status, "inactive");
  assert.equal(accountSubscription({
    id: "a", plan: "stage", subscriptionUntil: null,
  }, now).status, "inactive");
});

test("expiry is exclusive and never reported as active after expiration", () => {
  for (const date of [now, new Date(now.getTime() - 1)]) {
    assert.equal(accountSubscription({ id: "a", plan: "warmup", subscriptionUntil: date }, now).status, "expired");
  }
});

test("response is account-specific, repeatable across devices, and excludes private fields", () => {
  const account = {
    id: "account-a", plan: "stage" as const, subscriptionUntil: new Date("2026-11-30"),
    email: "private@example.invalid", role: "admin", blocked: false,
  };
  const firstDevice = accountSubscription(account, now);
  assert.deepEqual(accountSubscription(account, now), firstDevice);
  const otherAccount = accountSubscription({ id: "account-b", plan: "none", subscriptionUntil: null }, now);
  assert.equal(otherAccount.status, "inactive");
  assert.notEqual(otherAccount.accountId, firstDevice.accountId);
  assert.deepEqual(Object.keys(firstDevice).sort(), ["accountId", "plan", "status", "subscriptionUntil"]);
});
