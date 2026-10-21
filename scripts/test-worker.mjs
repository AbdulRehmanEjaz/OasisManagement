import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { unstable_dev } from "wrangler";
await mkdir(".wrangler", { recursive: true });
const state = await mkdtemp(resolve(".wrangler/d1-tests-"));
const migration = spawnSync(
  process.execPath,
  [
    "node_modules/wrangler/wrangler-dist/cli.js",
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--config",
    "tests/worker-smoke/wrangler.jsonc",
    "--persist-to",
    state,
  ],
  { encoding: "utf8", env: { ...process.env, CI: "true" } },
);
assert.equal(migration.status, 0, migration.stdout + "\n" + migration.stderr);
const worker = await unstable_dev("tests/worker-smoke/entry.ts", {
  config: "tests/worker-smoke/wrangler.jsonc",
  ip: "127.0.0.1",
  port: 0,
  inspectorPort: 0,
  local: true,
  persist: true,
  persistTo: state,
  logLevel: "error",
  experimental: { disableExperimentalWarning: true, watch: false },
});
try {
  const response = await worker.fetch(),
    result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  for (const [name, passed] of Object.entries(result)) {
    assert.equal(passed, true, name);
    console.log("PASS " + name);
  }
} finally {
  await worker.stop();
}
