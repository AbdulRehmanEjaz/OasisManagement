import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
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
function localSQL(args, persist=state) {
  const result = spawnSync(process.execPath, ["node_modules/wrangler/wrangler-dist/cli.js", "d1", "execute", "DB", "--local", "--config", "tests/worker-smoke/wrangler.jsonc", "--persist-to", persist, "--json", ...args], {encoding:"utf8",env:{...process.env,CI:"true"}});
  assert.equal(result.status,0,result.stderr);
  return JSON.parse(result.stdout).map(r=>r.results);
}

const snapshot="SELECT * FROM reports ORDER BY id; SELECT * FROM record_photos ORDER BY id; SELECT * FROM delivery_attempts ORDER BY id;";
const before=localSQL(["--command",snapshot]);
assert.ok(before[0].length>0,"migration fixture contains a report");
const legacy=await mkdtemp(resolve(".wrangler/legacy-import-test-"));
for(const file of ["0001_d1.sql","0002_structure_types.sql","0003_simplified_submissions.sql","0004_one_required_photo.sql","0005_report_codes.sql","0006_optional_structure_and_gapless_codes.sql"])localSQL(["--file","migrations/"+file],legacy);
const quote=value=>value===null?"NULL":typeof value==="number"?String(value):"'"+String(value).replaceAll("'","''")+"'";
const statements=["DROP TRIGGER report_validate; DROP TRIGGER report_commit; DROP TRIGGER inspection_structure_required;"];
for(const table of ["users","location_verifications","photo_uploads","reports","record_photos","delivery_attempts"]){
 const rows=localSQL(["--command","SELECT * FROM "+table])[0];
 for(const row of rows){if(table==="reports"){delete row.source;delete row.import_key;}const names=Object.keys(row);statements.push("INSERT INTO "+table+"("+names.join(",")+") VALUES("+names.map(name=>quote(row[name])).join(",")+");");}
}
const fixture=join(legacy,"populated-fixture.sql");await writeFile(fixture,statements.join("\n"));localSQL(["--file",fixture],legacy);
localSQL(["--file","migrations/0007_excel_import.sql"],legacy);
assert.deepEqual(localSQL(["--command",snapshot],legacy),before,"Excel migration preserves existing reports, all GPS metadata, photos and delivery records");
assert.deepEqual(localSQL(["--command","PRAGMA foreign_key_check"],legacy),[[]]);
assert.equal(localSQL(["--command","SELECT value FROM sequences WHERE kind='waste'"],legacy)[0][0].value,101);
console.log("PASS populated upgrade to Excel import preserves existing records and initializes COSA-102 counter");
