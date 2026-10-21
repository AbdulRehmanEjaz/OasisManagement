import assert from "node:assert/strict";
import { unstable_dev } from "wrangler";

// Runs in workerd, with local Images emulation and fixture-only HTTP transports.
// It never connects to Supabase, ImgBB, Resend or a Cloudflare account.
const worker = await unstable_dev("tests/worker-smoke/entry.ts", {
  config: "tests/worker-smoke/wrangler.jsonc",
  ip: "127.0.0.1", port: 0, inspectorPort: 0,
  local: true, persist: false, logLevel: "error",
  experimental: { disableExperimentalWarning: true, watch: false },
});
try {
  const response = await worker.fetch();
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  for (const [name, passed] of Object.entries(result)) {
    assert.equal(passed, true, name);
    console.log(`PASS ${name}`);
  }
} finally {
  await worker.stop();
}
