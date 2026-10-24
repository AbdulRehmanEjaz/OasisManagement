import assert from "node:assert/strict";
import {unzipSync,zipSync,strFromU8,strToU8} from "fflate";
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
  const hub = await request("/");
  const hubHtml = await hub.text();
  check(hub.status === 200 && hubHtml.includes("Operations Hub") && hubHtml.includes("/survey") && hubHtml.includes("Coming soon"), "public landing page links to protected Oasis dashboard");
  check((await request("/survey")).status === 307, "Oasis dashboard still requires PIN authentication");
  let r = await request("/survey/login");
  check(
    r.status === 200 && (await r.text()).includes("Enter your PIN"),
    "built Worker serves original login UI",
  );
  r = await request("/api/access");
  check(r.status === 401, "users route requires authentication");
  const oldDashboard=await request("/oasis?view=waste&record=example");
  check(oldDashboard.status===308&&oldDashboard.headers.get("location")?.endsWith("/survey?view=waste&record=example"),"old Oasis links preserve report query parameters");
  const oldScopedLogin=await request("/oasis/login");
  check(oldScopedLogin.status===308&&oldScopedLogin.headers.get("location")?.endsWith("/survey/login"),"old Oasis login redirects to Survey login");
  check((await request("/kpi")).status===307,"KPI dashboard requires shared PIN session");
  const kpiLogin=await request("/kpi/login");check(kpiLogin.status===200&&(await kpiLogin.text()).includes("Welcome to KPI Dashboard"),"KPI login uses its own destination and shared PIN auth");
  check((await request("/api/kpi")).status===401,"KPI report API requires authentication");
  const legacyLogin=await request("/login");
  check(legacyLogin.status===308&&legacyLogin.headers.get("location")?.endsWith("/survey/login"),"old login redirects to Site Survey login");
  for(const path of ["/hr/login"]){const future=await request(path);check(future.status===200&&(await future.text()).includes("Coming soon"),path+" reserved for future dashboard");}
  check((await request("/api/report-import?kind=waste")).status===401,"bulk import templates require authentication");
  check((await request("/api/report-excel?kind=waste")).status===401,"Excel requires authentication");
  check((await request("/api/report-photos?kind=waste")).status === 401, "photo exports require authentication");
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
  r = await request("/survey", null, adminCookie);
  check(
    r.status === 200 && (await r.text()).includes("oasis"),
    "D1 session opens the dashboard",
  );
  const excel=await request("/api/report-excel?kind=waste",null,adminCookie);
  check(excel.status===200&&excel.headers.get("content-type").includes("spreadsheetml"),"admin downloads Excel workbook");
  check(new Uint8Array(await excel.arrayBuffer())[0]===80,"Excel response is a ZIP based XLSX");
  check((await request("/api/report-photos?kind=waste",null,adminCookie)).status === 200, "admin can read photo export counts");
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
  check((await request("/api/report-photos?kind=waste&download=1",null,viewerCookie)).status === 403, "viewer cannot download admin photo archive");
  const viewerOverview = await (await request("/survey", null, viewerCookie)).text();
  check(viewerOverview.includes("Report maps") && viewerOverview.includes("Waste Reports") && viewerOverview.includes("Facilities"), "Viewer Overview has both report-map tabs");
  const adminOverview = await (await request("/survey", null, adminCookie)).text();
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
  const kpiAdminPage=await request("/kpi",null,adminCookie);check(kpiAdminPage.status===200&&(await kpiAdminPage.text()).includes("ADVACON KPI Dashboard"),"existing Survey Admin session opens KPI dashboard");
  const kpiViewerPage=await request("/kpi",null,viewerCookie);check(kpiViewerPage.status===200&&(await kpiViewerPage.text()).replace(/<!--[\s\S]*?-->/g,"").includes("Viewer panel"),"existing Survey Viewer session opens read-only KPI panel");
  const kpiSupervisorPage=await request("/kpi",null,supervisorCookie);check(kpiSupervisorPage.status===200&&(await kpiSupervisorPage.text()).includes("Submit Daily Report"),"Supervisor KPI panel provides daily report entry");
  check((await request("/api/kpi",{action:"create"},viewerCookie)).status===403,"KPI Viewer cannot write through HTTP");
  const kpiEmpty=await (await request("/api/kpi",null,adminCookie)).json();check(kpiEmpty.reports.length===0,"KPI production Worker starts empty");
  const kpiKey=crypto.randomUUID(),kpiEntry={report_date:"2026-10-01",location:"Historical fixture farm",metrics:{trees_irrigated:500,compost_fertilization:20}};
  const kpiCreated=await request("/api/kpi",{action:"create",idempotency_key:kpiKey,entry:kpiEntry},adminCookie);const kpiRecord=await kpiCreated.json();check(kpiCreated.status===200,"Admin enters historical daily KPI data through HTTP");
  const kpiDuplicate=await (await request("/api/kpi",{action:"create",idempotency_key:kpiKey,entry:kpiEntry},adminCookie)).json();check(kpiDuplicate.id===kpiRecord.id,"HTTP KPI double submit creates one record");
  const kpiVisible=await (await request("/api/kpi",null,viewerCookie)).json();check(kpiVisible.reports.length===1&&kpiVisible.reports[0].compost_fertilization===20&&!JSON.stringify(kpiVisible).includes("supervisor_id"),"Viewer reads actual independent KPI quantities without identities");
  check((await request("/api/kpi",{action:"create",idempotency_key:crypto.randomUUID(),entry:kpiEntry},supervisorCookie)).status===403,"Supervisor KPI historical entry is blocked");
  check((await request("/api/kpi",{action:"delete",id:kpiRecord.id},supervisorCookie)).status===403,"Supervisor KPI delete is blocked");
  check((await request("/api/kpi",{action:"create",idempotency_key:crypto.randomUUID(),entry:{...kpiEntry,metrics:{compost_fertilization:-2}}},adminCookie)).status===400,"negative KPI activity is rejected");
  check((await request("/api/kpi",{action:"delete",id:kpiRecord.id},adminCookie,{origin:"https://evil.example"})).status===403,"KPI edits reject cross-origin requests");
  check((await request("/api/kpi",{action:"delete",id:kpiRecord.id},adminCookie)).status===200,"Admin KPI deletion succeeds");
  check((await (await request("/api/kpi",null,adminCookie)).json()).reports.length===0,"KPI API reflects deletion immediately");
  for(const cookie of [viewerCookie,supervisorCookie])check((await request("/api/operations",{action:"record.location.update",type:"waste",id:crypto.randomUUID(),latitude:26,longitude:37},cookie)).status===403,"non-Admin cannot change report location through HTTP");
  check((await request("/api/report-import?kind=waste",null,viewerCookie)).status===403,"viewer cannot access import templates");
  check((await request("/api/report-import?kind=inspection",{},supervisorCookie)).status===403,"supervisor cannot bulk import");
  check((await request("/api/report-import?kind=waste",{},adminCookie,{origin:"https://evil.example"})).status===403,"bulk imports reject cross-origin requests");
  const template=await request("/api/report-import?kind=waste",null,adminCookie);
  check(template.status===200&&template.headers.get("content-type").includes("spreadsheetml"),"admin downloads real XLSX import template");

  if(process.env.TEST_REMOTE_IMPORT_PHOTO){
    const files=unzipSync(new Uint8Array(await template.arrayBuffer()));
    const values=["2026-10-24","Mixed domestic wastes","40","26.6","37.9",process.env.TEST_REMOTE_IMPORT_PHOTO,""];
    let xml=strFromU8(files["xl/worksheets/sheet1.xml"]);xml=xml.replace(/<row r="2"[\s\S]*?<\/row>/,`<row r="2">${values.map((v,i)=>`<c r="${String.fromCharCode(65+i)}2" t="inlineStr"><is><t>${v.replaceAll("&","&amp;")}</t></is></c>`).join("")}</row>`);files["xl/worksheets/sheet1.xml"]=strToU8(xml);
    const form=new FormData();form.set("file",new File([zipSync(files)],"filled.xlsx",{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
    const preview=await worker.fetch(origin+"/api/report-import?kind=waste",{method:"POST",headers:{origin,cookie:adminCookie,"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},body:zipSync(files)});const data=await preview.json();
    check(preview.status===200&&data.rows.length===1,"uploaded real XLSX validates before any write: "+JSON.stringify(data));
    const imported=await request("/api/report-import?kind=waste",data.rows[0],adminCookie);const saved=await imported.json();
    check(imported.status===200&&saved.number==="COSA-102","production Worker imports actual hosted photo and starts COSA-102");
    const repeated=await request("/api/report-import?kind=waste",data.rows[0],adminCookie);check((await repeated.json()).skipped===true,"HTTP import retry skips saved row");
    const photoZip=await request("/api/report-photos?kind=waste&download=1",null,adminCookie);const photos=unzipSync(new Uint8Array(await photoZip.arrayBuffer()));check(photos["COSA-102/COSA-102-01.jpg"]?.length>100,"imported photo appears in category ZIP with report name");
    const sheetExport=await request("/api/report-excel?kind=waste",null,adminCookie);const spreadsheet=unzipSync(new Uint8Array(await sheetExport.arrayBuffer()));check(spreadsheet["xl/media/image1.jpg"]?.length>100,"imported photo is embedded in exported XLSX");
    const correction=await request("/api/operations",{action:"record.location.update",type:"waste",id:saved.id,latitude:26.75,longitude:37.85},adminCookie);
    check(correction.status===200,"Admin corrects imported report location through HTTP");
    const corrected=await request("/api/operations?type=waste&id="+saved.id,null,viewerCookie);const correctedData=await corrected.json();check(correctedData.data[0].latitude===26.75&&correctedData.data[0].longitude===37.85,"Viewer sees corrected coordinates without edit permission");
    const correctedExport=await request("/api/report-excel?kind=waste",null,adminCookie);const correctedWorkbook=unzipSync(new Uint8Array(await correctedExport.arrayBuffer()));check(strFromU8(correctedWorkbook["xl/worksheets/sheet1.xml"]).includes("26.75")&&strFromU8(correctedWorkbook["xl/worksheets/_rels/sheet1.xml.rels"]).includes("26.75,37.85"),"Excel and Google Maps links use Admin corrected location");
    const deleted=await request("/api/operations",{action:"record.delete",type:"waste",id:saved.id},adminCookie);check(deleted.status===200,"isolated imported fixture cleaned up");
  }
  check((await request("/api/report-excel?kind=waste",null,viewerCookie)).status===403,"viewer cannot export Excel");
  check((await request("/api/report-excel?kind=inspection",null,supervisorCookie)).status===403,"supervisor cannot export Excel");
  check((await request("/api/report-photos?kind=inspection&download=1",null,supervisorCookie)).status === 403, "supervisor cannot download admin photo archive");
  r = await request("/api/operations?type=waste", null, supervisorCookie);
  check(r.status === 200 && (await r.json()).count === 0, "supervisor can read own-report list through HTTP");
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
