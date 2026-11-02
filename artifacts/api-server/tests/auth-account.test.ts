import "./helpers/setup.mjs";
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { clerkClient } from "@clerk/express";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Request, Response } from "express";
import { isolatedDatabase } from "./helpers/database";
import { requireAccount, requireAdmin } from "../src/middlewares/admin-auth";
import adminRouter from "../src/routes/admin";
import accountRouter from "../src/routes/account";

const pool = isolatedDatabase();
beforeEach(async () => {
  process.env.DANCEFLOW_OWNER_EMAIL = "owner@example.invalid";
  await pool.query("TRUNCATE df_jobs,df_accounts,df_controls,df_admin_audit CASCADE");
});

// Only the verified Clerk boundary is synthetic here. No production auth bypass,
// external users, credentials, or application database are involved.
async function account(userId: string | null, supplied: Record<string, unknown> = {}) {
  let status = 200;
  let nextCalled = false;
  let body: unknown;
  const headers: Record<string, unknown> = {};
  const req = {
    auth: Object.assign(() => ({ userId, tokenType: "session_token" }), {
      [Symbol.for("@clerk/express.auth")]: true,
    }),
    body: supplied, query: supplied, headers: supplied,
  } as unknown as Request;
  const res = {
    locals: {},
    setHeader(key: string, value: unknown) { headers[key] = value; },
    status(value: number) { status = value; return this; },
    json(value: unknown) { body = value; },
  } as unknown as Response;
  await requireAccount(req, res, () => { nextCalled = true; });
  return {
    status, body, nextCalled, headers, res,
    admin() {
      let allowed = false;
      requireAdmin(req, res, () => { allowed = true; });
      return { allowed, status };
    },
  };
}

test("sign-out and client identity forgery cannot select an account", async () => {
  const result = await account(null, { userId: "owner", email: "owner@example.invalid", role: "admin" });
  assert.equal(result.status, 401);
  assert.equal(result.nextCalled, false);
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.equal((await pool.query("SELECT count(*)::int n FROM df_accounts")).rows[0].n, 0);
});

test("only a verified Clerk email bootstraps the owner; switching identities preserves roles", async (t) => {
  t.mock.method(clerkClient.users, "getUser", async (id: string) => ({
    id, primaryEmailAddressId: "email-primary",
    emailAddresses: [{
      id: "email-primary",
      emailAddress: id === "owner" ? "OWNER@example.invalid" : "regular@example.invalid",
      verification: { status: "verified" },
    }],
  }));
  const owner = await account("owner");
  assert.equal(owner.nextCalled, true);
  assert.equal(owner.admin().allowed, true);
  const regular = await account("regular", { userId: "owner", email: "owner@example.invalid", role: "admin" });
  assert.equal(regular.res.locals.account.id, "regular");
  assert.equal(regular.admin().allowed, false);
  assert.equal(regular.admin().status, 403);
  assert.equal((await account(null)).status, 401);
  assert.equal((await account("owner")).admin().allowed, true);
  assert.equal((await pool.query("SELECT count(*)::int n FROM df_admin_audit WHERE action='owner.bootstrap'")).rows[0].n, 1);
});

test("unverified owner is denied, then verification promotes the existing account", async (t) => {
  let verified = false;
  const lookup = t.mock.method(clerkClient.users, "getUser", async () => ({
    id: "pending", primaryEmailAddressId: "email-primary",
    emailAddresses: [{
      id: "email-primary", emailAddress: "owner@example.invalid",
      verification: { status: verified ? "verified" : "unverified" },
    }],
  }));
  assert.equal((await account("pending")).admin().allowed, false);
  verified = true;
  process.env.DANCEFLOW_OWNER_EMAIL = " OWNER@example.invalid ";
  assert.equal((await account("pending")).admin().allowed, true);
  assert.equal(lookup.mock.callCount(), 2);
});

test("blocked owner cannot enter and existing account data survives sign-out and account switching", async () => {
  await pool.query(`INSERT INTO df_accounts(id,email,role,blocked,plan,subscription_until,daily_limit_override)
    VALUES ('owner','owner@example.invalid','admin',true,'stage',now()+interval '1 day',7),
           ('regular','regular@example.invalid','user',false,'none',null,null)`);
  const blocked = await account("owner");
  assert.equal(blocked.status, 403);
  assert.equal(blocked.nextCalled, false);
  const before = (await pool.query("SELECT * FROM df_accounts ORDER BY id")).rows;
  await account("regular");
  await account(null);
  await pool.query("UPDATE df_accounts SET blocked=false WHERE id='owner'");
  assert.equal((await account("owner")).admin().allowed, true);
  await account("regular");
  const after = (await pool.query("SELECT * FROM df_accounts ORDER BY id")).rows;
  assert.deepEqual(after, before.map((row) => ({ ...row, blocked: false })));
});

test("unavailable Clerk identity fails closed without provisioning or granting access", async (t) => {
  t.mock.method(clerkClient.users, "getUser", async () => { throw new Error("Identity unavailable"); });
  const result = await account("unknown");
  assert.equal(result.status, 503);
  assert.equal(result.nextCalled, false);
  assert.equal((await pool.query("SELECT count(*)::int n FROM df_accounts")).rows[0].n, 0);
});

test("a removed upstream identity cannot be reprovisioned from an old verified JWT", async (t) => {
  t.mock.method(clerkClient.users, "getUser", async () => { throw Object.assign(new Error("removed"), { status: 404 }); });
  const result = await account("deleted");
  assert.equal(result.status, 401);
  assert.equal(result.nextCalled, false);
  assert.equal((await pool.query("SELECT count(*)::int n FROM df_accounts")).rows[0].n, 0);
});

test("real route chains enforce roles and subscription ownership across sign-out and account switches", async () => {
  await pool.query(`INSERT INTO df_accounts(id,email,role,plan,subscription_until)
    VALUES ('owner','owner@example.invalid','admin','stage',now()+interval '1 day'),
           ('regular','regular@example.invalid','user','none',null)`);
  // Authentication itself is separately checked using the real Clerk middleware
  // in admin-governance.test.ts. This harness substitutes only its verified output.
  const harness = express();
  harness.use((req, _res, next) => {
    const userId = ({ "test-owner": "owner", "test-regular": "regular" } as Record<string, string>)[req.get("x-test-session") ?? ""] ?? null;
    Object.assign(req, {
      auth: Object.assign(() => ({ userId, tokenType: "session_token" }), {
        [Symbol.for("@clerk/express.auth")]: true,
      }),
    });
    next();
  });
  harness.use("/api", adminRouter, accountRouter);
  const server = harness.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    const request = (path: string, identity?: string, method = "GET") => fetch(`${root}${path}`, {
      method, headers: identity ? { "x-test-session": identity } : {},
    });
    for (const identity of ["test-owner", "test-regular", undefined, "test-owner"]) {
      const creditsResponse = await request("/account/credits?accountId=owner", identity);
      assert.equal(creditsResponse.status, identity ? 200 : 401);
      if (identity) {
        assert.equal((await creditsResponse.json()).accountId, identity === "test-owner" ? "owner" : "regular");
        assert.equal(creditsResponse.headers.get("cache-control"), "no-store");
      }
      const response = await request("/account/subscription?userId=owner&accountId=owner&plan=stage", identity);
      assert.equal(response.headers.get("cache-control"), "no-store");
      if (!identity) {
        assert.equal(response.status, 401);
      } else {
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.accountId, identity === "test-owner" ? "owner" : "regular");
        assert.equal(body.plan, identity === "test-owner" ? "stage" : "none");
      }
    }
    for (const path of ["/admin/overview", "/admin/users", "/admin/settings", "/admin/credit-economy", "/admin/generations", "/admin/audit"]) {
      assert.equal((await request(path, "test-owner")).status, 200, `owner ${path}`);
      assert.equal((await request(path, "test-regular")).status, 403, `regular ${path}`);
      assert.equal((await request(path)).status, 401, `signed out ${path}`);
    }
    for (const path of ["/admin/settings", "/admin/users/owner"]) {
      assert.equal((await request(path, "test-regular", "PATCH")).status, 403);
      assert.equal((await request(path, undefined, "PATCH")).status, 401);
    }
    assert.equal((await (await request("/admin/session", "test-regular")).json()).isAdmin, false);
    assert.equal((await (await request("/admin/session", "test-owner")).json()).isAdmin, true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
