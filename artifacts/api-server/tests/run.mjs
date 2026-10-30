// Never inherit application credentials or connect to the application's database.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("..", import.meta.url));
const directory = mkdtempSync(join(tmpdir(), "danceflow-tests-"));
const data = join(directory, "data");
const env = {
  PATH: process.env.PATH,
  HOME: directory,
  TMPDIR: directory,
  NODE_ENV: "test",
  DANCEFLOW_TEST_PG_SOCKET: directory,
  DATABASE_URL: `postgresql://danceflow_test@localhost/danceflow_test?host=${encodeURIComponent(directory)}`,
};
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", ...options });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`);
  }
};
let started = false;
let child;
let stopping = false;
function cleanup() {
  if (stopping) return;
  stopping = true;
  if (started) run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
  rmSync(directory, { recursive: true, force: true });
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child?.kill(signal);
    cleanup();
    process.exit(1);
  });
}
try {
  run("initdb", ["-D", data, "-U", "danceflow_test", "--auth=trust", "--no-locale", "--encoding=UTF8"]);
  // Unix socket only: no shared PostgreSQL service or TCP port is touched.
  run("pg_ctl", ["-D", data, "-l", join(directory, "postgres.log"), "-o",
    `-F -k ${directory} -c listen_addresses=''`, "-w", "start"]);
  started = true;
  run("createdb", ["-h", directory, "-U", "danceflow_test", "danceflow_test"]);
  run(process.execPath, [resolve(cwd, "../../lib/db/node_modules/drizzle-kit/bin.cjs"),
    "push", "--force", "--config", "./drizzle.config.ts"], { cwd: resolve(cwd, "../../lib/db") });
  child = spawn(process.execPath, [
    "--import", "tsx", "--import", "./tests/helpers/setup.mjs",
    "--test", ...(process.argv.length > 2 ? process.argv.slice(2) : ["tests/*.test.ts", "tests/*.test.mjs"]),
  ], { cwd, env, stdio: "inherit" });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  cleanup();
}
