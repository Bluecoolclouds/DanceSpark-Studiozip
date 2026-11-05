import "./helpers/setup.mjs";
import assert from "node:assert/strict";
import { beforeEach, test, mock } from "node:test";
import { auth } from "../src/lib/better-auth";
import express from "express";
import type { AddressInfo } from "node:net";
import { isolatedDatabase } from "./helpers/database";
import accountRouter from "../src/routes/account";

const pool = isolatedDatabase(["df_auth_identities"]);
beforeEach(async () => {
  await pool.query("TRUNCATE df_auth_identities,df_jobs,df_accounts,df_controls,df_admin_audit CASCADE");
  await pool.query("INSERT INTO df_accounts(id,email) VALUES('route-a','a@example.invalid'),('route-b','b@example.invalid')");
  await pool.query("INSERT INTO df_auth_identities(issuer,subject,account_id) SELECT 'danceflow:better-auth',id,id FROM df_accounts");
});

/** Verified identity is synthetic ONLY in this isolated test application. */
function application() {
  const app = express();
  mock.method(auth.api, "getSession", async ({ headers }: { headers: Headers }) => {
    const id = headers.get("x-fixture-account");
    return id ? { user: { id }, session: { token: "fixture" } } : null;
  });
  app.use(express.json());
  app.use("/api", accountRouter);
  return app;
}
async function run(work: (origin: string) => Promise<void>) {
  const server = application().listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try { await work(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
const post = (origin: string, owner?: string, body: unknown = { confirmation: "УДАЛИТЬ" }, bearer = true) =>
  fetch(`${origin}/api/account/deletion`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(owner ? { "x-fixture-account": owner } : {}),
      ...(bearer ? { Authorization: "Bearer isolated-fixture" } : { Cookie: "synthetic-session=fixture" }) },
    body: JSON.stringify(body),
  });

test("anonymous deletion is rejected and a signed-in caller cannot supply another account", async () => {
  await run(async origin => {
    assert.equal((await post(origin)).status, 401);
    assert.equal((await post(origin, "route-a", { confirmation: "УДАЛИТЬ", accountId: "route-b" })).status, 400);
    assert.equal((await pool.query("SELECT count(*)::int n FROM df_accounts WHERE deletion_requested_at IS NOT NULL")).rows[0].n, 0);
  });
});

test("mutations require bearer authentication or an allowed origin, not a cookie-only cross-site request", async () => {
  await run(async origin => { assert.equal((await post(origin, "route-a", undefined, false)).status, 403); });
});

test("own deletion queues durably, is repeatable, and never marks a second account", async () => {
  await run(async origin => {
    for (let i = 0; i < 2; i++) {
      const response = await post(origin, "route-a");
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: "pending" });
    }
    const own = await fetch(`${origin}/api/account/deletion`, { headers: { "x-fixture-account": "route-a", Authorization: "Bearer fixture" } });
    assert.deepEqual(await own.json(), { status: "pending" });
    const other = await fetch(`${origin}/api/account/deletion`, { headers: { "x-fixture-account": "route-b", Authorization: "Bearer fixture" } });
    assert.deepEqual(await other.json(), { status: "not_requested" });
    assert.equal((await pool.query("SELECT blocked FROM df_accounts WHERE id='route-b'")).rows[0].blocked, false);
  });
});

test("a blocked user can delete their own account while unresolved work remains a visible 409", async () => {
  await pool.query("UPDATE df_accounts SET blocked=true WHERE id='route-a'");
  await run(async origin => {
    assert.equal((await post(origin, "route-a")).status, 200);
    await pool.query(`INSERT INTO df_jobs(id,user_id,idempotency_key,template_id,status,error_code)
      VALUES('route-job','route-b','route-job','trend-06','failed','submission_unknown')`);
    const response = await post(origin, "route-b");
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "unsettled_generation");
  });
});
