import "./helpers/setup.mjs";
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { AddressInfo } from "node:net";
import { isolatedDatabase } from "./helpers/database";
import app from "../src/app";
import { auth } from "../src/lib/better-auth";
import { processAccountDeletion, requestDeletion } from "../src/lib/account-lifecycle";

const pool = isolatedDatabase();
beforeEach(async () => {
  await pool.query("TRUNCATE df_auth_identities,df_auth_user,df_auth_session,df_auth_credential,df_auth_rate_limit,df_accounts,df_controls,df_admin_audit CASCADE");
});
test("real password registration never grants owner by email; sessions revoke; blocked users cannot access data", async () => {
  const body = { email: "owner@example.invalid", password: "Local-test-password-3826", name: "Test" };
  const signed = await auth.api.signUpEmail({ body });
  assert.ok(signed.token);
  const row = (await pool.query("SELECT * FROM df_accounts WHERE id=$1", [signed.user.id])).rows[0];
  assert.equal(row.role, "user");
  const stored = (await pool.query("SELECT email_verified FROM df_auth_user WHERE id=$1", [signed.user.id])).rows[0];
  assert.equal(stored.email_verified, false);
  const credential = (await pool.query("SELECT password FROM df_auth_credential WHERE user_id=$1", [signed.user.id])).rows[0];
  assert.notEqual(credential.password, body.password);
  const headers = new Headers({ Authorization: `Bearer ${signed.token}` });
  assert.equal((await auth.api.getSession({ headers }))?.user.id, signed.user.id);
  await auth.api.signOut({ headers });
  assert.equal(await auth.api.getSession({ headers }), null);
  await assert.rejects(auth.api.signInEmail({ body: { email: body.email, password: "incorrect-password" } }));
  const login = await auth.api.signInEmail({ body });
  assert.ok(login.token);
  await pool.query("UPDATE df_accounts SET blocked=true WHERE id=$1", [signed.user.id]);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    assert.equal((await fetch(`${root}/api/auth/session`, { headers: { Authorization: `Bearer ${login.token}` } })).status, 403);
    assert.equal((await fetch(`${root}/api/account/credits`)).status, 401);
    assert.equal((await fetch(`${root}/api/admin/overview`, { headers: { Authorization: "Bearer forged" } })).status, 401);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
test("old emails cannot be claimed through signup, and signup cannot set server-owned roles", async () => {
  await pool.query("INSERT INTO df_accounts(id,email,role,plan) VALUES('legacy-id','old@example.invalid','admin','stage')");
  await assert.rejects(auth.api.signUpEmail({ body: { name: "Test", email: "old@example.invalid", password: "Safe-test-password-1234" } }));
  assert.deepEqual((await pool.query("SELECT id,role,plan FROM df_accounts WHERE id='legacy-id'")).rows[0],
    { id: "legacy-id", role: "admin", plan: "stage" });
});
test("local account deletion revokes every session and removes credentials without calling old providers", async () => {
  const signed = await auth.api.signUpEmail({ body: { name: "Test", email: "remove@example.invalid", password: "Safe-test-password-1234" } });
  await requestDeletion(signed.user.id);
  assert.equal(await processAccountDeletion(signed.user.id, {
    deleteMedia: async () => {},
    deleteIdentity: async id => { await pool.query("DELETE FROM df_auth_user WHERE id=$1", [id]); },
  }), true);
  assert.equal((await pool.query("SELECT count(*)::int n FROM df_auth_user")).rows[0].n, 0);
  assert.equal((await pool.query("SELECT count(*)::int n FROM df_auth_session")).rows[0].n, 0);
  assert.equal((await pool.query("SELECT count(*)::int n FROM df_auth_credential")).rows[0].n, 0);
  assert.equal(await auth.api.getSession({ headers: new Headers({ Authorization: `Bearer ${signed.token}` }) }), null);
});
