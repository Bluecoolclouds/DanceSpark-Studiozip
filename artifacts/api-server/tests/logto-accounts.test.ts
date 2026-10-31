import "./helpers/setup.mjs";
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { once } from "node:events";
import express from "express";
import type { AddressInfo } from "node:net";
import { isolatedDatabase } from "./helpers/database";
import { findLogtoAccount, linkIdentity, registerIdentity } from "../src/lib/auth-identities";
import { AuthFailure, logtoVerifier } from "../src/lib/logto-auth";
import { withLogtoAuthentication } from "../src/middlewares/auth-provider";
import { requireAccount, getAccountId } from "../src/middlewares/admin-auth";
import authRouter from "../src/routes/auth";

const pool = isolatedDatabase(["df_auth_identities"]);
const principal = { subject: "new-logto-subject", issuer: "https://auth.example.invalid/oidc", clientId: "test-web-client" };
beforeEach(async () => {
  await pool.query("TRUNCATE df_auth_identities,df_jobs,df_accounts,df_controls,df_admin_audit");
  await pool.query("INSERT INTO df_accounts(id,email,role,plan) VALUES('old-clerk-owner','owner@example.invalid','admin','stage'),('other','other@example.invalid','user','none')");
});
test("linkage keeps existing account ID, role, plan and all ownership stable", async () => {
  assert.equal(await linkIdentity(principal, "old-clerk-owner"), "old-clerk-owner");
  assert.equal(await linkIdentity(principal, "old-clerk-owner"), "old-clerk-owner");
  assert.equal(await findLogtoAccount(principal), "old-clerk-owner");
  const account = (await pool.query("SELECT id,role,plan FROM df_accounts WHERE id='old-clerk-owner'")).rows[0];
  assert.deepEqual(account, { id: "old-clerk-owner", role: "admin", plan: "stage" });
  await assert.rejects(linkIdentity(principal, "other"),
    (e: unknown) => e instanceof AuthFailure && e.code === "identity_already_linked");
  assert.equal((await pool.query("SELECT count(*)::int n FROM df_accounts")).rows[0].n, 2);
});
test("registration never links by email and never accepts an unverified email", async () => {
  await assert.rejects(registerIdentity(principal, "owner@example.invalid"),
    (e: unknown) => e instanceof AuthFailure && e.code === "account_link_required");
  await assert.rejects(registerIdentity(principal, null));
  assert.equal(await findLogtoAccount(principal), null);
});
test("explicit new registration is atomic and creates one ordinary account under concurrency", async () => {
  const ids = await Promise.all([registerIdentity(principal, "new@example.invalid"), registerIdentity(principal, "new@example.invalid")]);
  assert.equal(ids[0], ids[1]);
  assert.notEqual(ids[0], principal.subject);
  assert.deepEqual((await pool.query("SELECT role,plan FROM df_accounts WHERE id=$1", [ids[0]])).rows[0], { role: "user", plan: "none" });
  const result = await Promise.allSettled([
    registerIdentity({ ...principal, subject: "another" }, "same@example.invalid"),
    registerIdentity({ ...principal, subject: "third" }, "same@example.invalid"),
  ]);
  assert.equal(result.filter(r => r.status === "fulfilled").length, 1);
});
test("linkage and existing Logto registration cannot bypass an account block", async () => {
  await linkIdentity(principal, "old-clerk-owner");
  await pool.query("UPDATE df_accounts SET blocked=true WHERE id='old-clerk-owner'");
  await assert.rejects(linkIdentity(principal, "old-clerk-owner"));
  await assert.rejects(registerIdentity(principal, "owner@example.invalid"));
});

test("API resolves mapped identity to canonical ownership and requires BOTH proofs to link", async t => {
  process.env.LOGTO_ENDPOINT = "https://auth.example.invalid/";
  const access = t.mock.method(logtoVerifier, "accessToken", async () => principal);
  t.mock.method(logtoVerifier, "identityToken", async (token: string) => {
    if (token !== "valid-signed-identity-proof") throw new AuthFailure(401, "invalid_identity_token", "Invalid proof");
    return "owner@example.invalid";
  });
  const app = express();
  app.use(express.json());
  app.use(withLogtoAuthentication((req, _res, next) => {
    Object.assign(req, { auth: Object.assign(() => ({
      userId: req.get("authorization") === "Bearer legacy-session" ? "old-clerk-owner" : null,
      tokenType: "session_token",
    }), { [Symbol.for("@clerk/express.auth")]: true }) });
    next();
  }));
  app.use("/api", authRouter);
  app.get("/api/owned-test", requireAccount, (_req, res) => res.json({ ownerId: getAccountId(res) }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const logtoToken = `${Buffer.from('{"alg":"ES256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ iss: principal.issuer })).toString("base64url")}.synthetic`;
  const json = (authorization: string, body?: object) => ({
    method: body ? "POST" : "GET", headers: { Authorization: authorization, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  try {
    assert.equal((await fetch(`${base}/api/auth/session`, json(`Bearer ${logtoToken}`))).status, 409);
    const proof = { accessToken: "valid-access-token-at-least-20-chars", idToken: "valid-signed-identity-proof" };
    assert.equal((await fetch(`${base}/api/auth/logto/link`, json(`Bearer ${logtoToken}`, proof))).status, 409);
    assert.equal((await fetch(`${base}/api/auth/logto/link`, json("Bearer legacy-session", { ...proof, idToken: "invalid-identity-at-least-20" }))).status, 401);
    assert.equal(await findLogtoAccount(principal), null);
    const linked = await fetch(`${base}/api/auth/logto/link`, json("Bearer legacy-session", proof));
    assert.equal(linked.status, 200);
    assert.deepEqual(await linked.json(), { accountId: "old-clerk-owner", email: "owner@example.invalid", role: "admin" });
    const session = await fetch(`${base}/api/auth/session`, json(`Bearer ${logtoToken}`));
    assert.equal(session.status, 200);
    assert.equal((await session.json()).accountId, "old-clerk-owner");
    assert.deepEqual(await (await fetch(`${base}/api/owned-test`, json(`Bearer ${logtoToken}`))).json(), { ownerId: "old-clerk-owner" });
    assert.equal(access.mock.callCount() > 1, true);
    await pool.query("UPDATE df_accounts SET blocked=true WHERE id='old-clerk-owner'");
    assert.equal((await fetch(`${base}/api/auth/session`, json(`Bearer ${logtoToken}`))).status, 403);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
