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

// Rebuild a populated database too: cascade relationships must survive.
function localSQL(args) {
  const result = spawnSync(process.execPath, ["node_modules/wrangler/wrangler-dist/cli.js", "d1", "execute", "DB", "--local", "--config", "tests/worker-smoke/wrangler.jsonc", "--persist-to", state, "--json", ...args], {encoding:"utf8",env:{...process.env,CI:"true"}});
  assert.equal(result.status,0,result.stderr);
  return JSON.parse(result.stdout).map(r=>r.results);
}
const snapshot = "SELECT * FROM reports ORDER BY id; SELECT * FROM record_photos ORDER BY id; SELECT * FROM delivery_attempts ORDER BY id;";
const before = localSQL(["--command",snapshot]);
assert.ok(before[0].length > 0, "migration fixture contains a report");
localSQL(["--file","migrations/0003_simplified_submissions.sql"]);
assert.deepEqual(localSQL(["--command",snapshot]),before,"migration preserves complete reports, photographs and deliveries");
assert.deepEqual(localSQL(["--command","PRAGMA foreign_key_check"]),[[]]);
console.log("PASS populated migration preserves reports, photo relationships and delivery metadata");
