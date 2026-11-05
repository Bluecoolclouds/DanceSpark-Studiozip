import "./helpers/setup.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const setup = new URL("./helpers/setup.mjs", import.meta.url).href;
test("the launcher supplies only synthetic provider and auth configuration", () => {
  assert.equal(process.env.higgs_api, "unit-test-id:unit-test-secret");
  assert.equal(process.env.CLERK_SECRET_KEY, "sk_test_not_a_real_key");
  assert.equal(process.env.SESSION_SECRET, "isolated-test-session-secret-not-for-production-0123456789");
  assert.equal(process.env.VITE_CLERK_PUBLISHABLE_KEY, undefined);
  assert.equal(process.env.PGHOST, undefined);
});

test("direct invocation without the isolated database fails before loading application modules", () => {
  const env = { ...process.env };
  delete env.DANCEFLOW_TEST_PG_SOCKET;
  const result = spawnSync(process.execPath, ["--import", setup, "--eval", 'throw new Error("APP_LOADED")'], {
    env, encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /disposable PostgreSQL required/);
  assert.doesNotMatch(result.stderr, /Error: APP_LOADED/);
});

test("outbound fetch and socket clients are blocked even if their errors are swallowed", () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  for (const code of [
    'try { await fetch("https://api.higgsfield.ai/requests/fake/status"); } catch {}',
    'try { (await import("node:net")).connect({host:"api.higgsfield.ai",port:443}); } catch {}',
    'try { (await import("node:https")).get("https://clerk.example.test"); } catch {}',
  ]) {
    const script = `import { test } from "node:test"; test("network guard probe", async () => { ${code} });`;
    const result = spawnSync(process.execPath, ["--import", setup, "--input-type=module", "--eval", script], {
      env, encoding: "utf8", timeout: 10000,
    });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /Tests attempted external networking/);
  }
});
