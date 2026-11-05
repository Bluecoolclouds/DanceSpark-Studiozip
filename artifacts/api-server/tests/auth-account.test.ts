import "./helpers/setup.mjs";
import assert from "node:assert/strict";
import { beforeEach, test, mock } from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { isolatedDatabase } from "./helpers/database";
import { auth } from "../src/lib/better-auth";
import adminRouter from "../src/routes/admin";
import accountRouter from "../src/routes/account";

const pool = isolatedDatabase();
beforeEach(async () => {
  mock.restoreAll();
  await pool.query("TRUNCATE df_auth_identities,df_jobs,df_accounts,df_controls,df_admin_audit CASCADE");
  await pool.query(`INSERT INTO df_accounts(id,email,role,plan)
    VALUES('owner','owner@example.invalid','admin','stage'),('regular','regular@example.invalid','user','none')`);
  await pool.query(`INSERT INTO df_auth_identities(issuer,subject,account_id)
    VALUES('danceflow:better-auth','new-owner','owner'),('danceflow:better-auth','new-regular','regular')`);
});
test("canonical IDs, roles and balances stay isolated across account switches", async () => {
  mock.method(auth.api, "getSession", async ({ headers }: { headers: Headers }) => {
    const subject = headers.get("x-fixture-subject");
    return subject ? { user: { id: subject, emailVerified: false }, session: { token: "fixture" } } : null;
  });
  const app = express();
  app.use(express.json());
  app.use("/api", adminRouter, accountRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const request = (path: string, subject?: string) => fetch(`${root}${path}`, {
    headers: subject ? { "x-fixture-subject": subject, Authorization: "Bearer fixture" } : {},
  });
  try {
    for (const subject of ["new-owner", "new-regular", undefined, "new-owner"]) {
      const response = await request("/account/subscription?accountId=owner&role=admin", subject);
      assert.equal(response.status, subject ? 200 : 401);
      if (subject) {
        const body = await response.json();
        assert.equal(body.accountId, subject === "new-owner" ? "owner" : "regular");
        assert.equal(body.plan, subject === "new-owner" ? "stage" : "none");
      }
      for (const path of ["/admin/overview", "/admin/users", "/admin/settings", "/admin/generations"]) {
        assert.equal((await request(path, subject)).status, !subject ? 401 : subject === "new-owner" ? 200 : 403);
      }
    }
    assert.equal((await request("/account/subscription", "unlinked")).status, 403);
    await pool.query("UPDATE df_accounts SET blocked=true WHERE id='owner'");
    assert.equal((await request("/admin/overview", "new-owner")).status, 403);
    await pool.query("UPDATE df_accounts SET deletion_requested_at=now() WHERE id='regular'");
    assert.equal((await request("/account/credits", "new-regular")).status, 403);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
