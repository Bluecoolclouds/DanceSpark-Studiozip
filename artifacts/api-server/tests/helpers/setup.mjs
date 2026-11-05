// Imported before application modules, including when a test is run directly.
import assert from "node:assert/strict";
import { after } from "node:test";
import net from "node:net";

const socket = process.env.DANCEFLOW_TEST_PG_SOCKET;
if (process.env.NODE_ENV !== "test" || !socket || !/\/danceflow-tests-[^/]+$/.test(socket)) {
  throw new Error("Use pnpm --filter @workspace/api-server test (disposable PostgreSQL required)");
}
const database = new URL(process.env.DATABASE_URL);
assert.equal(database.searchParams.get("host"), socket);
assert.equal(database.hostname, "localhost");
assert.equal(database.pathname, "/danceflow_test");
assert.equal(database.username, "danceflow_test");

// Synthetic values only. Production code still validates configuration normally.
process.env.higgs_api = "unit-test-id:unit-test-secret";
process.env.CLERK_PUBLISHABLE_KEY = `pk_test_${Buffer.from("clerk.example.test$").toString("base64")}`;
process.env.CLERK_SECRET_KEY = "sk_test_not_a_real_key";
process.env.DANCEFLOW_OWNER_EMAIL = "owner@example.invalid";
process.env.SESSION_SECRET = "isolated-test-session-secret-not-for-production-0123456789";
process.env.DANCEFLOW_WEB_ORIGINS = "https://danceflow.example.test";

const violations = [];
function blocked() {
  violations.push("Unexpected external network request");
  throw new Error("External network is disabled in server tests; mock the provider boundary");
}
const realFetch = globalThis.fetch;
globalThis.fetch = function (input, init) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") return blocked();
  return realFetch(input, init);
};
// Also guard non-fetch clients (Clerk SDK, HTTP(S), direct TCP).
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  // net.connect / Undici may pass the already-normalized argument array.
  const normalized = net._normalizeArgs(Array.isArray(args[0]) ? args[0] : args)[0];
  const allowed = normalized.path
    ? normalized.path === `${socket}/.s.PGSQL.5432`
    : normalized.host === "127.0.0.1";
  if (!allowed) return blocked();
  return Reflect.apply(connect, this, args);
};
after(() => {
  // Root-hook failures alone can leave exit status 0 in Node's eval mode.
  if (violations.length) process.exitCode = 1;
  assert.deepEqual(violations, [], "Tests attempted external networking (even if the application caught the error)");
});
