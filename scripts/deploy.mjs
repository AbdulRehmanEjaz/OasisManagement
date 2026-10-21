import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { unstable_readConfig } from "wrangler";
const args = process.argv.slice(2),
  dryRun = args.includes("--dry-run");
const root = unstable_readConfig({config:"wrangler.jsonc"},{hideWarnings:true});
const built = JSON.parse(fs.readFileSync("dist/server/wrangler.json", "utf8"));
const id = root.d1_databases?.find((d) => d.binding === "DB")?.database_id;
if (!dryRun && (!id || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(id))) {
  console.error(
    "D1 is not provisioned. Follow D1_SETUP.md, set its database_id in wrangler.jsonc, apply migrations, then rebuild before deployment.",
  );
  process.exit(1);
}
if (built.d1_databases?.find((d) => d.binding === "DB")?.database_id !== id) {
  console.error(
    "D1 binding changed since the last build. Run npm run build first.",
  );
  process.exit(1);
}
const result = spawnSync(
  process.execPath,
  [
    "node_modules/wrangler/wrangler-dist/cli.js",
    "deploy",
    "--config",
    "dist/server/wrangler.json",
    ...args,
  ],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
