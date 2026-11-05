import assert from "node:assert/strict";
import test from "node:test";
import { authReleaseProblems, configuredWebOrigins } from "../src/lib/auth-environment";

test("production accepts only an explicit exact public HTTPS allowlist", () => {
  assert.deepEqual(configuredWebOrigins({ NODE_ENV: "production",
    DANCEFLOW_WEB_ORIGINS: "https://dance.example.test,https://admin.example.test,https://dance.example.test",
    REPLIT_DEV_DOMAIN: "old.replit.dev" }), ["https://dance.example.test", "https://admin.example.test"]);
  assert.throws(() => configuredWebOrigins({ NODE_ENV: "production", REPLIT_DEV_DOMAIN: "preview.replit.dev" }));
});

test("production rejects development domains, wildcards, local hosts and malformed origins", () => {
  for (const origin of ["http://dance.example.test", "https://*.example.test", "https://preview.replit.dev",
    "https://old.repl.co", "https://127.0.0.1", "https://[::1]", "https://api.local",
    "https://api.internal", "https://localhost", "https://host", "https://u:p@example.test",
    "https://example.test/path", "https://example.test?token=private", "https://example.test/#fragment"]) {
    assert.throws(() => configuredWebOrigins({ NODE_ENV: "production", DANCEFLOW_WEB_ORIGINS: origin }), origin);
  }
});

test("development does not trust another imported workspace's preview host", () => {
  assert.deepEqual(configuredWebOrigins({ NODE_ENV: "development", REPLIT_DEV_DOMAIN: "current.replit.dev",
    DANCEFLOW_WEB_ORIGINS: "https://old.replit.dev,https://current.replit.dev,https://dance.example.test" }),
    ["https://current.replit.dev", "https://dance.example.test"]);
});

test("release checks report missing settings without exposing credentials", () => {
  const input = { DANCEFLOW_WEB_ORIGINS: "https://dance.example.test",
    SESSION_SECRET: "synthetic-test-secret-that-is-over-thirty-two-characters", DATABASE_URL: "synthetic-database" };
  assert.deepEqual(authReleaseProblems(input), []);
  const failures = authReleaseProblems({ SESSION_SECRET: "private-short-test-value" });
  assert.equal(failures.length, 3);
  assert.ok(!failures.join().includes("private-short-test-value"));
});
