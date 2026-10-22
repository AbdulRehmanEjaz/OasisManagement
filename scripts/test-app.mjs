import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { unstable_dev } from "wrangler";
await mkdir(".wrangler", { recursive: true });
const state = await mkdtemp(resolve(".wrangler/http-tests-"));
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
    "wrangler.jsonc",
    "--persist-to",
    state,
  ],
  { encoding: "utf8", env: { ...process.env, CI: "true" } },
);
assert.equal(migration.status, 0, migration.stdout + "\n" + migration.stderr);
const setupToken = "fixture-bootstrap-token-only-not-a-production-secret";
const worker = await unstable_dev("dist/server/index.js", {
  config: "dist/server/wrangler.json",
  ip: "127.0.0.1",
  port: 0,
  inspectorPort: 0,
  local: true,
  persist: true,
  persistTo: state,
  logLevel: "error",
  vars: {
    PIN_LOOKUP_SECRET: "fixture-lookup-secret-only-not-for-production",
    ADMIN_SETUP_TOKEN: setupToken,
  },
  experimental: { disableExperimentalWarning: true, watch: false },
});
const origin = `http://${worker.address}:${worker.port}`;
let checks = 0;
const check = (ok, label) => {
  assert.ok(ok, label);
  checks++;
  console.log("PASS " + label);
};
const request = (path, body, cookie = "", extra = {}) =>
  worker.fetch(origin + path, {
    method: body ? "POST" : "GET",
    headers: {
      origin,
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...extra,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "manual",
  });
try {
  let r = await request("/login");
  check(
    r.status === 200 && (await r.text()).includes("Enter your PIN"),
    "built Worker serves original login UI",
  );
  r = await request("/api/access");
  check(r.status === 401, "users route requires authentication");
  r = await request(
    "/api/setup",
    { full_name: "Fixture administrator", pin: "987" },
    "",
    { "x-setup-token": "wrong" },
  );
  check(r.status === 403, "setup endpoint checks private token");
  r = await request(
    "/api/setup",
    { full_name: "Fixture administrator", pin: "987" },
    "",
    { "x-setup-token": setupToken },
  );
  check(r.status === 200, "one-time administrator setup through HTTP");
  r = await request("/api/setup", { full_name: "Second", pin: "123" }, "", {
    "x-setup-token": setupToken,
  });
  check(r.status === 409, "setup endpoint closes after initial account");
  r = await request("/api/auth", { action: "login", pin: "987" }, "", {
    origin: "https://attacker.invalid",
  });
  check(r.status === 403, "auth route rejects cross-origin POST");
  r = await request("/api/auth", { action: "login", pin: "987" });
  const header = r.headers.get("set-cookie") || "",
    adminCookie = header.split(";")[0];
  check(
    r.status === 200 &&
      header.includes("__Host-oasis-session=") &&
      /httponly/i.test(header) &&
      /secure/i.test(header) &&
      /samesite=strict/i.test(header) &&
      /path=\//i.test(header),
    "production cookie is host-only HttpOnly Secure SameSite=Strict",
  );
  check(
    (r.headers.get("cache-control") || "").includes("no-store"),
    "authentication responses are never cached",
  );
  r = await request("/", null, adminCookie);
  check(
    r.status === 200 && (await r.text()).includes("oasis"),
    "D1 session opens the dashboard",
  );
  r = await request("/api/access", null, adminCookie);
  const accounts = await r.json();
  check(
    r.status === 200 &&
      accounts.count === 1 &&
      !JSON.stringify(accounts).includes("pin_hash"),
    "admin user directory hides credentials",
  );
  for (const [role, pin] of [
    ["viewer", "876"],
    ["supervisor", "765"],
  ]) {
    r = await request(
      "/api/access",
      { action: "user.create", full_name: "Fixture " + role, role, pin },
      adminCookie,
    );
    check(r.status === 200, "admin creates " + role);
  }
  r = await request("/api/auth", { action: "login", pin: "876" });
  const viewerCookie = (r.headers.get("set-cookie") || "").split(";")[0];
  check(r.status === 200, "PIN-only viewer login");
  const viewerOverview = await (await request("/", null, viewerCookie)).text();
  check(viewerOverview.includes("Report maps") && viewerOverview.includes("Waste Reports") && viewerOverview.includes("Facilities"), "Viewer Overview has both report-map tabs");
  const adminOverview = await (await request("/", null, adminCookie)).text();
  check(adminOverview.includes("Report maps") && adminOverview.includes("Waste Reports"), "Admin Overview has report maps");
  r = await request("/api/access", null, viewerCookie);
  check(r.status === 403, "viewer cannot read users through HTTP");
  r = await request(
    "/api/operations",
    { action: "record.delete", type: "waste", id: crypto.randomUUID() },
    viewerCookie,
  );
  check(r.status === 403, "viewer cannot delete through HTTP");
  r = await request("/api/upload", {}, viewerCookie);
  check(r.status === 403, "viewer cannot upload through HTTP");
  r = await request("/api/operations?type=waste&map=1", null, viewerCookie);
  check(r.status === 200, "viewer map query allowed");
  r = await request("/api/auth", { action: "login", pin: "765" });
  const supervisorCookie = (r.headers.get("set-cookie") || "").split(";")[0];
  check(r.status === 200, "PIN-only supervisor login");
  r = await request("/api/operations?type=waste", null, supervisorCookie);
  check(r.status === 403, "supervisor cannot read reports through HTTP");
  r = await request(
    "/api/operations",
    { action: "option.add", kind: "waste", label: "Forbidden" },
    supervisorCookie,
  );
  check(r.status === 403, "supervisor cannot change settings through HTTP");
  r = await request("/api/access", null, adminCookie);
  const viewer = (await r.json()).data.find((u) => u.role === "viewer");
  r = await request(
    "/api/access",
    { action: "user.pin", id: viewer.id, pin: "654" },
    adminCookie,
  );
  check(r.status === 200, "admin resets PIN through HTTP");
  r = await request("/api/operations?type=overview", null, viewerCookie);
  check(r.status === 401, "reset invalidates prior browser session");
  r = await request("/api/auth", { action: "logout" }, adminCookie);
  check(r.status === 200, "logout route succeeds");
  r = await request("/api/access", null, adminCookie);
  check(r.status === 401, "logout invalidates prior browser session");
  console.log(
    `Passed ${checks} built-Worker HTTP checks (isolated local D1 only).`,
  );
} finally {
  await worker.stop();
}
