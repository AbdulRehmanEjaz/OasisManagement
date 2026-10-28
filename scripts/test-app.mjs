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
      header.includes("__Host-survey-session=") &&
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

  check((await request('/kpi',null,adminCookie)).status===307,'Survey session cannot open KPI dashboard');
  check((await request('/api/kpi',null,adminCookie)).status===401,'Survey session cannot read KPI API');
  const seedKpi=spawnSync(process.execPath,['node_modules/wrangler/wrangler-dist/cli.js','d1','execute','DB','--local','--config','wrangler.jsonc','--persist-to',state,'--command',"INSERT INTO users(id,full_name,role,pin_hash,pin_fingerprint,is_active,version,dashboard) SELECT lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-8'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))),full_name,role,pin_hash,'kpi:'||substr(pin_fingerprint,8),is_active,version,'kpi' FROM users WHERE dashboard='survey';"],{encoding:'utf8',env:{...process.env,CI:'true'}});
  assert.equal(seedKpi.status,0,seedKpi.stderr);
  const kpiLoginAs=async pin=>{const r=await request('/api/auth',{action:'login',dashboard:'kpi',pin});check(r.status===200,'KPI PIN login uses independent account');return (r.headers.get('set-cookie')||'').split(';')[0];};
  const kpiAdminCookie=await kpiLoginAs('987'),kpiViewerCookie=await kpiLoginAs('876'),kpiSupervisorCookie=await kpiLoginAs('765');
  check((await request('/api/operations?type=waste',null,kpiAdminCookie)).status===401,'KPI session cannot access Survey data');
  check((await request('/api/access?dashboard=survey',null,kpiAdminCookie)).status===401,'KPI session cannot list Survey accounts');
  check((await request('/api/access?dashboard=kpi',null,adminCookie)).status===401,'Survey session cannot list KPI accounts');
  const borrowedCookie=kpiAdminCookie.split('=')[0]+'='+adminCookie.split('=')[1];
  check((await request('/api/kpi',null,borrowedCookie)).status===401,'renaming a Survey cookie does not bypass dashboard session checks');
  const kpiAdminPage=await request("/kpi",null,kpiAdminCookie);check(kpiAdminPage.status===200&&(await kpiAdminPage.text()).includes("ADVACON KPI Dashboard"),"independent KPI Admin session opens KPI dashboard");
  const kpiViewerPage=await request("/kpi",null,kpiViewerCookie);check(kpiViewerPage.status===200&&(await kpiViewerPage.text()).replace(/<!--[\s\S]*?-->/g,"").includes("Viewer panel"),"independent KPI Viewer opens read-only KPI panel");
  const kpiSupervisorPage=await request("/kpi",null,kpiSupervisorCookie);check(kpiSupervisorPage.status===200&&(await kpiSupervisorPage.text()).includes("إرسال التقرير اليومي"),"Supervisor KPI panel defaults to Arabic daily report entry");
  check((await request("/api/kpi",{action:"create"},kpiViewerCookie)).status===403,"KPI Viewer cannot write through HTTP");
  const kpiEmpty=await (await request("/api/kpi",null,kpiAdminCookie)).json();check(kpiEmpty.reports.length===0,"KPI production Worker starts empty");
  const kpiKey=crypto.randomUUID(),kpiEntry={report_date:"2026-10-01",location:"Historical fixture farm",metrics:{trees_irrigated:500,compost_fertilization:20}};
  const kpiCreated=await request("/api/kpi",{action:"create",idempotency_key:kpiKey,entry:kpiEntry},kpiAdminCookie);const kpiRecord=await kpiCreated.json();check(kpiCreated.status===200,"Admin enters historical daily KPI data through HTTP");
  const kpiDuplicate=await (await request("/api/kpi",{action:"create",idempotency_key:kpiKey,entry:kpiEntry},kpiAdminCookie)).json();check(kpiDuplicate.id===kpiRecord.id,"HTTP KPI double submit creates one record");
  const kpiVisible=await (await request("/api/kpi",null,kpiViewerCookie)).json();check(kpiVisible.reports.length===1&&kpiVisible.reports[0].compost_fertilization===20&&!JSON.stringify(kpiVisible).includes("supervisor_id"),"Viewer reads actual independent KPI quantities without identities");
  check((await request("/api/kpi",{action:"create",idempotency_key:crypto.randomUUID(),entry:kpiEntry},kpiSupervisorCookie)).status===403,"Supervisor KPI historical entry is blocked");
  check((await request("/api/kpi",{action:"delete",id:kpiRecord.id},kpiSupervisorCookie)).status===403,"Supervisor KPI delete is blocked");
  check((await request("/api/kpi",{action:"create",idempotency_key:crypto.randomUUID(),entry:{...kpiEntry,metrics:{compost_fertilization:-2}}},kpiAdminCookie)).status===400,"negative KPI activity is rejected");
  check((await request("/api/kpi",{action:"delete",id:kpiRecord.id},kpiAdminCookie,{origin:"https://evil.example"})).status===403,"KPI edits reject cross-origin requests");
  check((await request("/api/kpi",{action:"delete",id:kpiRecord.id},kpiAdminCookie)).status===200,"Admin KPI deletion succeeds");
  check((await (await request("/api/kpi",null,kpiAdminCookie)).json()).reports.length===0,"KPI API reflects deletion immediately");

  check((await request('/api/kpi/import',null,adminCookie)).status===401,'Survey Admin cannot download KPI import template');
  check((await request('/api/kpi/import',null,kpiViewerCookie)).status===403,'KPI Viewer cannot download Admin import template');
  check((await request('/api/kpi/import',{rows:[]},kpiSupervisorCookie)).status===403,'KPI Supervisor cannot bulk import');
  const kpiTemplate=await request('/api/kpi/import',null,kpiAdminCookie);check(kpiTemplate.status===200,'KPI Admin downloads bilingual XLSX template');
  const kpiWorkbook=unzipSync(new Uint8Array(await kpiTemplate.arrayBuffer())),sheetPath='xl/worksheets/sheet1.xml';
  const originalSheet=strFromU8(kpiWorkbook[sheetPath]),headerRow=originalSheet.match(/<row r="1"[\s\S]*?<\/row>/)[0];
  const importValues=['2026-10-05','09:30','old-supervisor','٢٦٫٥، ٣٧٫٩','Fixture supervisor','المزرعة الشمالية','١','٢','١٠٠','0','0','5','20','0','0','0','٠٫٥','2','1','0','تقرير قديم'];
  const importCells=importValues.map((v,i)=>'<c r="'+String.fromCharCode(65+i)+'2" t="inlineStr"><is><t>'+v+'</t></is></c>').join('');
  kpiWorkbook[sheetPath]=strToU8(originalSheet.replace(/<sheetData>[\s\S]*?<\/sheetData>/,'<sheetData>'+headerRow+'<row r="2">'+importCells+'</row></sheetData>'));
  const binaryPreview=await fetch(origin+'/api/kpi/import',{method:'POST',headers:{origin,cookie:kpiAdminCookie,'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},body:Buffer.from(zipSync(kpiWorkbook))});
  const previewData=await binaryPreview.json();check(binaryPreview.status===200&&previewData.rows[0].metrics.trees_irrigated===100&&previewData.rows[0].suggestedSupervisorId,'Arabic workbook preview validates values and maps only KPI supervisors');
  const {suggestedSupervisorId,...previewRow}=previewData.rows[0],importPayload={rows:[{row:previewRow,supervisor_id:suggestedSupervisorId,fileName:'قديم.xlsx'}]};
  const importResponse=await request('/api/kpi/import',importPayload,kpiAdminCookie),importResult=await importResponse.json();check(importResponse.status===200&&importResult.results[0].id&&!importResult.results[0].error,'KPI historical Excel import succeeds through authenticated HTTP');
  const repeatResult=await (await request('/api/kpi/import',importPayload,kpiAdminCookie)).json();check(repeatResult.results[0].skipped,'reimporting same historical row is skipped');
  const importedRows=await (await request('/api/kpi',null,kpiAdminCookie)).json();check(importedRows.reports.length===1&&importedRows.reports[0].source==='excel'&&importedRows.reports[0].import_metadata.gps==='٢٦٫٥، ٣٧٫٩','imported Arabic metadata is retained in KPI reports');
  check((await request('/api/kpi/import',importPayload,kpiAdminCookie,{origin:'https://evil.example'})).status===403,'KPI import rejects cross-origin writes');
  await request('/api/kpi',{action:'delete',id:importResult.results[0].id},kpiAdminCookie);
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
  for(const endpoint of ['/api/report-photos?kind=waste&manifest=1','/api/report-excel?kind=waste&manifest=1','/api/report-photos?kind=waste&photo=00000000-0000-4000-8000-000000000001']){
    check((await request(endpoint,null,viewerCookie)).status===403,'Viewer cannot access export manifest or original photo: '+endpoint);
    check((await request(endpoint,null,supervisorCookie)).status===403,'Supervisor cannot access export manifest or original photo: '+endpoint);
  }
  check((await request('/api/report-photos?kind=waste&manifest=1',null,adminCookie)).status===200,'Admin can read paginated photo export manifest');
  check((await request('/api/report-excel?kind=waste&manifest=1',null,adminCookie)).status===200,'Admin can read paginated Excel export manifest');

  check((await request('/api/operations?type=palms',null,adminCookie)).status===200,'Admin can list Date Palms reports');
  check((await request('/api/report-photos?kind=palms',null,adminCookie)).status===200,'Admin can read Date Palms export counts');
  check((await request('/api/report-excel?kind=palms&manifest=1',null,adminCookie)).status===200,'Admin can read Date Palms Excel manifest');
  check((await request('/api/operations',{action:'control.save',kind:'palms',submission_enabled:false,viewer_enabled:false},viewerCookie)).status===403,'Viewer cannot change submission controls');
  check((await request('/api/operations',{action:'control.save',kind:'palms',submission_enabled:false,viewer_enabled:false},supervisorCookie)).status===403,'Supervisor cannot change submission controls');
  check((await request('/api/operations',{action:'control.save',kind:'palms',submission_enabled:false,viewer_enabled:false},adminCookie)).status===200,'Admin can block Date Palms submission and viewing');
  check((await request('/api/operations?type=palms',null,viewerCookie)).status===403,'Viewer cannot bypass blocked Palm map/list API');
  check((await request('/api/operations',{action:'report.submit',kind:'palms'},supervisorCookie)).status===403,'Supervisor cannot bypass blocked Palm submission API');
  check((await request('/api/operations?type=palms',null,adminCookie)).status===200,'Admin still sees blocked Date Palms category');
  check((await request('/api/operations',{action:'control.save',kind:'palms',submission_enabled:true,viewer_enabled:true},adminCookie)).status===200,'Admin can restore Date Palms access');
  check((await request('/api/operations?type=palms',null,viewerCookie)).status===200,'Viewer can view restored Palm category');
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
