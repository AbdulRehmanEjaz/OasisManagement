import {importKpiReport} from '../../src/lib/kpi/import-store';
import {unlockKpiDailySubmission,saveKpiFormSettings,createKpiReport,readKpiReports,updateKpiReport,deleteKpiReport,kpiEntrySchema} from "../../src/lib/kpi/store";
import {calculateDashboard,saudiDate} from "../../src/lib/kpi/calculations";
import {PROJECT} from "../../src/lib/kpi/config";
import {importReport} from "../../src/lib/report-import";
import {photoZip} from "../../src/lib/photo-zip";
import {unzipSync} from "fflate";
// Isolated local workerd + D1 integration tests. Never deployed to production.
import { env } from "cloudflare:workers";
import type { D1Database } from "@cloudflare/workers-types";
import { D1Store, type Actor } from "../../src/lib/d1-store";
import {
  readRecords,
  captureLocation,
  verifyLocation,
  submitReport,
  registerFacility,
  updateRecord,
  updateReportLocation,
  deleteRecord,
  submissionDate,
} from "../../src/lib/d1-operations";
import { checkPin } from "../../src/lib/pin-crypto";
import { processPhoto } from "../../src/worker/photo-processing";
import { isSameOrigin } from "../../src/lib/request-security";
import { sendNotification } from "../../src/lib/notifications";
export default {
  async fetch() {
    const passed: Record<string, boolean> = {};
    const assert = (ok: unknown, label: string) => {
      if (!ok) throw new Error(label);
      passed[label] = true;
    };
    const rejects = async (fn: () => Promise<unknown>, label: string) => {
      let denied = false;
      try {
        await fn();
      } catch {
        denied = true;
      }
      assert(denied, label);
    };
    try {
      async function* zipPhotos() {yield {number:"COSA-102",url:"https://i.ibb.co/fixture/photo.jpg"};}
      const originalPhoto = new Uint8Array([255,216,255,0,9,1]);
      const zipParts: Uint8Array[] = [];
      for await (const chunk of photoZip(zipPhotos(),new AbortController().signal,(async()=>new Response(originalPhoto,{headers:{"Content-Type":"image/jpeg"}})) as typeof fetch)) zipParts.push(chunk);
      const archive = new Uint8Array(zipParts.reduce((n,p)=>n+p.length,0));let zipOffset=0;for(const part of zipParts){archive.set(part,zipOffset);zipOffset+=part.length;}
      const zipPhoto = unzipSync(archive)["COSA-102/COSA-102-01.jpg"];
      assert(zipPhoto?.length === originalPhoto.length && zipPhoto.every((v,i)=>v===originalPhoto[i]), "Worker streams ZIP with unchanged report-numbered photos");
      const db = new D1Store(
        (env as unknown as { DB: D1Database }).DB,
        "isolated-test-secret-not-a-production-secret",
      );
      const setup = "isolated-bootstrap-token-not-a-production-secret";
      await rejects(()=>db.bootstrap({full_name:"Administrator",role:"admin",pin:"12"},setup,setup),"setup rejects fewer than three digits");
      await rejects(()=>db.bootstrap({full_name:"Administrator",role:"admin",pin:"1234"},setup,setup),"setup rejects more than three digits");
      await rejects(
        () =>
          db.bootstrap(
            { full_name: "Administrator", role: "admin", pin: "071" },
            "wrong",
            setup,
          ),
        "bootstrap rejects wrong token",
      );
      await rejects(()=>db.bootstrap({full_name:"Administrator",role:"admin",pin:"071",viewer_pin:"071",supervisor_pin:"063"},setup,setup),"bootstrap requires distinct panel PINs");
      await db.bootstrap(
        { full_name: "Administrator", role: "admin", pin: "071", viewer_pin:"082", supervisor_pin:"063" },
        setup,
        setup,
      );
      await rejects(
        () =>
          db.bootstrap(
            { full_name: "Duplicate", role: "admin", pin: "987" },
            setup,
            setup,
          ),
        "bootstrap is one time",
      );
      assert(
        checkPin(
          "worker-test-pin",
          "worker-test-salt:2f8f8802a78fcdf997ddf9627d3da27f71c09c9d4267458ec4aae17d0d6c2d29",
        ),
        "Node-compatible salted scrypt",
      );
      const adminToken = await db.login("071", "admin-fixture"),
        admin = await db.session(adminToken);
      assert(
        !(await db.one(
          "SELECT token_hash FROM sessions WHERE token_hash=?",
          adminToken,
        )),
        "session token stored only as hash",
      );
      assert((await db.accounts(admin)).length===3,"one-time setup creates all three panels atomically");
      await db.changeAccount(admin, {
        action: "user.create",
        full_name: "Other Supervisor",
        role: "supervisor",
        pin: "054",
      });
      const viewer = await db.session(
        await db.login("082", "viewer-fixture"),
      );
      const supervisor = await db.session(
        await db.login("063", "supervisor-fixture"),
      );
      const other = await db.session(await db.login("054", "other-fixture"));
      await rejects(
        () =>
          db.changeAccount(viewer, {
            action: "user.create",
            full_name: "Bad",
            role: "admin",
            pin: "111",
          }),
        "viewer cannot manage users",
      );
      await rejects(
        () => db.accounts(supervisor),
        "supervisor cannot see users",
      );
      await rejects(
        () =>
          db.write({ ...viewer, role: "admin" }, "admin", [
            db.stmt("UPDATE users SET full_name='forged'"),
          ]),
        "transaction guard rejects forged role",
      );
      assert((await readRecords(db, supervisor, "waste", new URLSearchParams())).count === 0, "supervisor starts with an empty own-report list");
      await rejects(
        () => readRecords(db, viewer, "audit", new URLSearchParams()),
        "viewer cannot see audit or identities",
      );
      await rejects(
        () =>
          db.changeAccount(admin, {
            action: "user.create",
            full_name: "Duplicate PIN",
            role: "viewer",
            pin: "082",
          }),
        "PINs must be unique",
      );
      const facility = await registerFacility(db, admin, {
        name: "Fixture facility",
        structure_type: "Concrete/Blocks Building",
        category: "Office / Site Cabin",
        site: "Fixture site",
        status: "Operational",
        latitude: 26.6,
        longitude: 37.9,
        assigned_supervisor: supervisor.id,
        photo_ids: [],
      });
      assert(
        (await readRecords(db, other, "facilities", new URLSearchParams()))
          .count === 0,
        "supervisor facility choices enforce assignments",
      );
      const photos = async (actor: Actor) => {
        const ids = [crypto.randomUUID(), crypto.randomUUID()];
        await db.write(
          actor,
          "submit",
          ids.map((id) =>
            db.stmt(
              "INSERT INTO photo_uploads(id,user_id,url) VALUES(?,?,?)",
              id,
              actor.id,
              "https://i.ibb.co/fixture/" + id + ".jpg",
            ),
          ),
        );
        return ids;
      };
      const location = async (actor: Actor) => {
        const { id } = await captureLocation(db, actor, {
          latitude: 26.612345678,
          longitude: 37.912345678,
          accuracy: 9,
          captured_at: new Date().toISOString(),
        });
        await verifyLocation(db, actor, "location.view", id);
        await verifyLocation(db, actor, "location.confirm", id);
        return id;
      };
      let locationId = await location(supervisor),
        photoIds = await photos(supervisor);
      const input = {
        kind: "waste",
        category: "Mixed domestic wastes (Rubber – Plastics – carton - old barrel - old pipes - wood)",
        quantity: 3,
        unit: "Bags",
        description: "Fixture",
        location_id: locationId,
        photo_ids: photoIds,
        idempotency_key: crypto.randomUUID(),
      };
      await rejects(
        () => submitReport(db, viewer, input),
        "viewer cannot submit",
      );
      const [report, concurrent] = await Promise.all([
        submitReport(db, supervisor, input),
        submitReport(db, supervisor, input),
      ]);
      assert(report.id===concurrent.id,"concurrent retries create one report");
      assert(report.number === "COSA-102", "atomic sequential report number");
      assert(
        (await submitReport(db, supervisor, input)).id === report.id,
        "idempotent report retry",
      );
      assert(
        (
          await db.one(
            "SELECT count(*) n FROM record_photos WHERE report_id=?",
            report.id,
          )
        )?.n === 2,
        "photos attached atomically",
      );
      assert(
        (
          await db.one(
            "SELECT count(*) n FROM notifications WHERE record_id=?",
            report.id,
          )
        )?.n === 1 &&
          !!(await db.one(
            "SELECT id FROM delivery_attempts WHERE record_id=?",
            report.id,
          )),
        "notification and email queue created with report",
      );
      delete process.env.RESEND_API_KEY;
      await sendNotification(db, report.id);
      assert(
        (
          await db.one(
            "SELECT status FROM delivery_attempts WHERE record_id=?",
            report.id,
          )
        )?.status === "failed" &&
          !!(await db.one("SELECT id FROM reports WHERE id=?", report.id)),
        "missing email configuration never loses a report",
      );
      await rejects(
        () =>
          submitReport(db, supervisor, {
            ...input,
            idempotency_key: crypto.randomUUID(),
          }),
        "GPS and photos cannot be reused",
      );
      const visible = await readRecords(
        db,
        viewer,
        "waste",
        new URLSearchParams({ map: "1" }),
      );
      const serialized = JSON.stringify(visible);
      assert(
        visible.count === 1 &&
          !serialized.includes("supervisor_id") &&
          !serialized.includes("Administrator") &&
          !serialized.includes("Supervisor") &&
          !serialized.includes("pin_hash") &&
          !serialized.includes("tokenHash"),
        "viewer report/map projection hides user details",
      );
      assert(
        visible.data[0].latitude === 26.612345678 &&
          visible.data[0].waste_report_photos.length === 2,
        "map coordinates and photographs preserved",
      );
      assert((await readRecords(db, supervisor, "waste", new URLSearchParams())).count === 1, "supervisor can list own reports");
      assert((await readRecords(db, other, "waste", new URLSearchParams({id:report.id}))).count === 0, "supervisor cannot read another supervisor report by ID");
      const ownPatch = {category:input.category,quantity:5,unit:"Kilograms (kg)",description:"Corrected by reporting supervisor"};
      await rejects(() => updateRecord(db, other, {type:"waste",id:report.id,patch:ownPatch}), "supervisor cannot edit another supervisor report");
      await rejects(() => updateRecord(db, supervisor, {type:"waste",id:report.id,patch:{...ownPatch,latitude:0}}), "supervisor cannot edit immutable GPS fields");
      await updateRecord(db, supervisor, {type:"waste",id:report.id,patch:ownPatch});
      assert((await db.one("SELECT quantity FROM reports WHERE id=?",report.id))?.quantity === 5, "supervisor can edit own waste report");
      await rejects(
        () =>
          updateRecord(db, viewer, { type: "waste", id: report.id, patch: {} }),
        "viewer cannot edit",
      );
      await rejects(
        () => deleteRecord(db, supervisor, { type: "waste", id: report.id }),
        "supervisor cannot delete",
      );
      locationId = await location(supervisor);
      const foreign = await photos(other);
      const before = (
        await db.one("SELECT value FROM sequences WHERE kind='waste'")
      )?.value;
      await rejects(
        () =>
          submitReport(db, supervisor, {
            ...input,
            location_id: locationId,
            photo_ids: foreign,
            idempotency_key: crypto.randomUUID(),
          }),
        "cross-user photographs rejected",
      );
      assert(
        (await db.one("SELECT value FROM sequences WHERE kind='waste'"))
          ?.value === before &&
          !(
            await db.one(
              "SELECT used_at FROM location_verifications WHERE id=?",
              locationId,
            )
          )?.used_at,
        "failed submission rolls back counter and GPS",
      );
      photoIds = await photos(supervisor);
      const inspection = await submitReport(db, supervisor, {
        kind: "inspection",
        inspection_date: "1900-01-01",
        site: "Fixture inspection site",
        structure_type: "Metal Structures",
        description: "",
        location_id: locationId,
        photo_ids: photoIds.slice(0, 1),
        idempotency_key: crypto.randomUUID(),
      });
      assert(
        inspection.number === "OFT-001",
        "standalone site inspection and numbering with optional description",
      );
      assert((await db.one("SELECT unit FROM reports WHERE id=?", report.id))?.unit === "Kilograms (kg)", "waste submissions use kilograms regardless of client unit");
      assert((await db.one("SELECT count(*) n FROM record_photos WHERE report_id=?", inspection.id))?.n === 1, "one mandatory photo is sufficient for a site inspection");
      await updateRecord(db, supervisor, {type:"inspections",id:inspection.id,patch:{site:"Fixture inspection site",structure_type:"Animal Shelters",description:"Corrected site observations"}});
      assert((await db.one("SELECT structure_type FROM reports WHERE id=?",inspection.id))?.structure_type === "Animal Shelters", "supervisor can edit own facility report");
      await rejects(() => updateRecord(db, other, {type:"inspections",id:inspection.id,patch:{description:"Forged"}}), "other supervisor cannot edit facility report");
      const saved = await db.one("SELECT site,structure_type,inspection_date FROM reports WHERE id=?", inspection.id);
      assert(saved?.site === "Fixture inspection site" && saved?.structure_type === "Animal Shelters" && saved?.inspection_date === submissionDate(), "inspection stores site, structure and server submission date");
      await deleteRecord(db, admin, { type: "facilities", id: facility.id });
      assert(
        !!(await db.one("SELECT id FROM reports WHERE id=?", inspection.id)),
        "archiving preserves inspection history",
      );
      await updateRecord(db, admin, {
        type: "waste",
        id: report.id,
        patch: {
          site: "Updated site",
          category: "Palm Waste",
          quantity: 4,
          unit: "Bags",
          description: "Edited",
        },
      });
      assert(
        (await db.one("SELECT quantity FROM reports WHERE id=?", report.id))
          ?.quantity === 4,
        "administrator edit works",
      );
      await rejects(
        () =>
          db.stmt("UPDATE reports SET latitude=0 WHERE id=?", report.id).run(),
        "GPS metadata immutable",
      );
      const summary=await readRecords(db,admin,"overview",new URLSearchParams());
      assert(summary.waste===1&&summary.inspections===1&&summary.facilities===0,"dashboard summaries count both modules and active facilities");
      await rejects(()=>updateReportLocation(db,supervisor,{type:"waste",id:report.id,latitude:26.7,longitude:37.8}),"supervisor cannot change report location");
      await rejects(()=>updateReportLocation(db,viewer,{type:"waste",id:report.id,latitude:26.7,longitude:37.8}),"viewer cannot change report location");
      await rejects(()=>updateReportLocation(db,admin,{type:"waste",id:report.id,latitude:91,longitude:37.8}),"Admin location changes reject invalid coordinates");
      await rejects(()=>updateReportLocation(db,{...viewer,role:"admin"},{type:"waste",id:report.id,latitude:26.7,longitude:37.8}),"forged Admin session cannot change report location");
      for(const [type,id] of [["waste",report.id],["inspections",inspection.id]]){
       await updateReportLocation(db,admin,{type,id,latitude:26.7,longitude:37.8});
       const raw=await db.one("SELECT * FROM reports WHERE id=?",id);
       assert(raw?.latitude===26.612345678&&raw?.admin_latitude===26.7,"original GPS remains immutable for "+type);
       const visible=await readRecords(db,viewer,type,new URLSearchParams({id,map:"1"}));
       assert(visible.data[0].latitude===26.7&&visible.data[0].longitude===37.8&&visible.data[0].location_confirmed===0&&!visible.data[0].location_edited_by,"corrected map coordinates and Viewer privacy for "+type);
       assert(!!await db.one("SELECT id FROM audit_logs WHERE record_id=? AND action='LOCATION_UPDATED'",id),"location correction audited for "+type);
      }
      await rejects(()=>db.stmt("UPDATE reports SET admin_latitude=0 WHERE id=?",report.id).run(),"database rejects location override without Admin guard");
      await deleteRecord(db,admin,{type:"waste",id:report.id});
      assert(!await db.one("SELECT id FROM reports WHERE id=?",report.id)&&!await db.one("SELECT id FROM record_photos WHERE report_id=?",report.id),"administrator deletion cascades report photo associations");
      async function newWaste(){return submitReport(db,supervisor,{...input,location_id:await location(supervisor),photo_ids:(await photos(supervisor)).slice(0,1),idempotency_key:crypto.randomUUID()});}
      const first=await newWaste(),second=await newWaste();
      assert(first.number==="COSA-102"&&second.number==="COSA-103","deleting final report restarts at configured COSA-102");
      await db.stmt("UPDATE reports SET created_at=? WHERE id=?","2025-01-01T00:00:00Z",first.id).run();
      const ascendingWaste=await readRecords(db,admin,"waste",new URLSearchParams());
      assert(ascendingWaste.data.map((r:{number:string})=>r.number).join(",")==="COSA-102,COSA-103","Waste list defaults to ascending report number independent of dates");
      await deleteRecord(db,admin,{type:"waste",id:first.id});
      assert((await db.one("SELECT number FROM reports WHERE id=?",second.id))?.number==="COSA-102","deleting middle report closes numbering gap");
      assert(!!await db.one("SELECT id FROM record_photos WHERE report_id=?",second.id),"renumbering preserves photo association");
      const third=await newWaste();assert(third.number==="COSA-103","new report follows compacted sequence");
      await deleteRecord(db,admin,{type:"waste",id:third.id});await deleteRecord(db,admin,{type:"waste",id:second.id});
      const importInput={date:"2026-10-24T00:00:00Z",category:"Mixed domestic wastes",quantity:150,latitude:26.6,longitude:37.9,photos:["https://i.ibb.co/fixture/import1.jpg","https://i.ibb.co/fixture/import2.jpg"],key:"a".repeat(64)+"-2"};
      const mockHost=async(url:string)=>url;
      await rejects(()=>importReport(db,viewer,"waste",importInput,mockHost),"viewer cannot bulk import");
      await rejects(()=>importReport(db,supervisor,"waste",importInput,mockHost),"supervisor cannot bulk import");
      const imported=await importReport(db,admin,"waste",importInput,mockHost);
      assert(imported.number==="COSA-102","first Excel waste report starts at COSA-102");
      const importRecord=await db.one("SELECT * FROM reports WHERE id=?",imported.id);
      assert(importRecord?.source==="excel"&&importRecord?.location_confirmed===0&&importRecord?.location_id===null,"Excel coordinates never claim hardware GPS verification");
      assert((await db.one("SELECT count(*) n FROM record_photos WHERE report_id=?",imported.id))?.n===2,"Excel import attaches both photos");
      const repeat=await importReport(db,admin,"waste",importInput,mockHost);assert(repeat.id===imported.id&&repeat.skipped,"same-file row retry does not duplicate reports or numbers");
      await rejects(()=>importReport(db,{...viewer,role:"admin"},"waste",{...importInput,key:"b".repeat(64)+"-2"},mockHost),"forged admin session cannot import");
      await rejects(()=>db.stmt("UPDATE reports SET source='field' WHERE id=?",imported.id).run(),"Excel provenance is immutable");
      const facilityImport=await importReport(db,admin,"inspection",{...importInput,site:"Imported site",structure_type:"Animal Shelters",key:"c".repeat(64)+"-2",photos:importInput.photos.slice(0,1)},mockHost);
      await db.stmt("UPDATE reports SET created_at=? WHERE id=?","2030-01-01T00:00:00Z",facilityImport.id).run();
      const ascendingFacilities=await readRecords(db,admin,"inspections",new URLSearchParams({sort:"number-asc"}));
      assert(ascendingFacilities.data.map((r:{number:string})=>r.number).join(",")==="OFT-001,OFT-002","Facilities list sorts ascending by report number independent of dates");
      assert(facilityImport.number==="OFT-002","Facilities import follows its separate existing sequence");
      assert((await db.one("SELECT count(*) n FROM delivery_attempts WHERE record_id=?",facilityImport.id))?.n===0,"bulk imports do not queue unwanted emails");
      await deleteRecord(db,admin,{type:"waste",id:imported.id});
      await deleteRecord(db,admin,{type:"inspections",id:facilityImport.id});
      const surveyDB=db,surveyAdmin=admin;
      {
      const db=new D1Store((env as unknown as {DB:D1Database}).DB,'isolated-test-secret-not-a-production-secret','kpi');
      await db.bootstrap({full_name:'KPI Admin',role:'admin',pin:'071',viewer_pin:'082',supervisor_pin:'063'},setup,setup);
      const adminToken=await db.login('071','kpi-admin'),admin=await db.session(adminToken),viewer=await db.session(await db.login('082','kpi-viewer')),supervisor=await db.session(await db.login('063','kpi-supervisor'));
      await db.changeAccount(admin,{action:'user.create',full_name:'Other KPI Supervisor',role:'supervisor',pin:'054'});
      const otherToken=await db.login('054','kpi-other'),other=await db.session(otherToken);
      await rejects(()=>surveyDB.session(adminToken),'KPI session cannot authenticate Survey');
      await rejects(async()=>db.session(await surveyDB.login('071','survey-session')),'Survey session cannot authenticate KPI');
      await rejects(()=>db.changeAccount(admin,{action:'user.name',id:surveyAdmin.id,full_name:'Cross dashboard'}),'KPI Admin cannot modify a Survey account');
      await rejects(()=>surveyDB.accounts(admin),'KPI Admin cannot read Survey users');
      await rejects(()=>readRecords(surveyDB,admin,'waste',new URLSearchParams()),'KPI actor cannot read Survey data');
      assert((await db.accounts(admin)).every(u=>u.id!==surveyAdmin.id),'KPI directory contains only KPI accounts');
      assert((await readKpiReports(db,admin)).reports.length===0,"KPI project starts with zero reports and no seeded progress");
      const kpiEntry={report_date:"2026-10-01",location:"North farm",notes:"Historical manual entry",supervisor_id:supervisor.id,metrics:{trees_irrigated:2500,date_palm_pruning:5,tree_pruning:10,compost_fertilization:0,cleaned_area_ha:0.25}};
      const createInput={idempotency_key:crypto.randomUUID(),entry:kpiEntry};
      await rejects(()=>createKpiReport(db,viewer,createInput),"Viewer cannot create KPI reports");
      await rejects(()=>createKpiReport(db,supervisor,{...createInput,entry:{...kpiEntry,report_date:"2026-10-01"}},new Date("2026-10-24T12:00:00Z")),"Supervisor cannot backdate daily KPI reports");
      await rejects(()=>createKpiReport(db,{...supervisor,role:"admin"},{...createInput,entry:{...kpiEntry,supervisor_id:other.id}}),"database guard rejects forged Admin historical KPI creation");
      const [ka,kb]=await Promise.all([createKpiReport(db,admin,createInput),createKpiReport(db,admin,createInput)]);
      assert(ka.id===kb.id,"KPI double submission is idempotent");
      const secondKpi=await createKpiReport(db,admin,{idempotency_key:crypto.randomUUID(),entry:{...kpiEntry,supervisor_id:other.id,metrics:{trees_irrigated:3000,tree_pruning:0,compost_fertilization:80}}});
      const kpiViewer=await readKpiReports(db,viewer);
      assert(kpiViewer.reports.length===2&&!JSON.stringify(kpiViewer).includes("supervisor_name")&&!JSON.stringify(kpiViewer).includes("supervisor_id"),"KPI Viewer sees reports without user identity details");
      const kpiMetrics=calculateDashboard(kpiViewer.reports,{mode:"project"},"2026-10-24");
      assert(kpiMetrics.cumulative.totals.irrigation===5500&&kpiMetrics.cumulative.totals.pruning===15&&kpiMetrics.cumulative.totals.compost===80,"separate Supervisor reports combine and compost stays independent from pruning");
      assert((await readKpiReports(db,supervisor)).reports.length===1,"KPI Supervisor sees only own reports");
      await rejects(()=>updateKpiReport(db,supervisor,{id:secondKpi.id,entry:kpiEntry}),"Supervisor cannot edit another user's KPI report");
      await rejects(()=>updateKpiReport(db,supervisor,{id:ka.id,entry:{...kpiEntry,report_date:"2026-10-02"}}),"Supervisor cannot change KPI activity date");
      await rejects(()=>updateKpiReport(db,supervisor,{id:ka.id,entry:kpiEntry}),"submitted Supervisor reports are locked for Manager corrections");
       await updateKpiReport(db,admin,{id:ka.id,entry:{...kpiEntry,metrics:{tree_pruning:20,compost_fertilization:0}}});
      assert(calculateDashboard((await readKpiReports(db,viewer)).reports,{mode:"project"},"2026-10-24").cumulative.totals.pruning===20,"KPI totals reflect edits without duplicated records");
      await rejects(()=>deleteKpiReport(db,supervisor,ka.id),"Supervisor cannot delete KPI reports");
      await rejects(()=>deleteKpiReport(db,viewer,ka.id),"Viewer cannot delete KPI reports");
      await rejects(()=>db.stmt("DELETE FROM kpi_daily_reports WHERE id=?",ka.id).run(),"KPI audit history cannot be hard-deleted");
      assert(!kpiEntrySchema.safeParse({...kpiEntry,metrics:{tree_pruning:1.5}}).success&&!kpiEntrySchema.safeParse({...kpiEntry,metrics:{cleaned_area_ha:-1}}).success,"KPI validation rejects fractional trees and negative activity");
      const independent=await createKpiReport(db,admin,{idempotency_key:crypto.randomUUID(),entry:{...kpiEntry,metrics:{date_palm_pruning:1094,tree_pruning:0}}});assert(!!independent.id,"manual form accepts independent quantities when palm pruning exceeds other tree pruning");await deleteKpiReport(db,admin,independent.id);
      await deleteKpiReport(db,admin,ka.id);await deleteKpiReport(db,admin,secondKpi.id);
      assert((await readKpiReports(db,viewer)).reports.length===0&&!!(await db.one("SELECT deleted_at FROM kpi_daily_reports WHERE id=?",ka.id))?.deleted_at,"Admin KPI deletion removes progress while retaining audit history");
      assert(calculateDashboard((await readKpiReports(db,viewer)).reports,{mode:"project"},"2026-10-24").overall===0,"deleted KPI work recalculates to zero");

      const todayEntry={...kpiEntry,report_date:saudiDate(),supervisor_id:supervisor.id};
      const dailyInput={entry:todayEntry,idempotency_key:crypto.randomUUID()};
      const daily=await createKpiReport(db,supervisor,dailyInput);
      assert((await createKpiReport(db,supervisor,dailyInput)).id===daily.id,"daily submission retry remains idempotent");
      await rejects(()=>createKpiReport(db,supervisor,{...dailyInput,idempotency_key:crypto.randomUUID()}),"second daily Supervisor report with a new key is rejected");
      await rejects(()=>db.write(supervisor,'submit',[db.stmt('INSERT INTO kpi_daily_reports(id,project_id,supervisor_id,report_date,location,metrics,notes,created_by,updated_by,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,?)',crypto.randomUUID(),PROJECT.id,supervisor.id,saudiDate(),'Duplicate','{}','',supervisor.id,supervisor.id,crypto.randomUUID())]),"D1 blocks duplicate daily report even when bypassing API");
      assert((await readKpiReports(db,supervisor)).submittedToday,"Supervisor receives current daily submission status");
      const dailyRace=await Promise.allSettled([1,2].map(()=>createKpiReport(db,other,{idempotency_key:crypto.randomUUID(),entry:{...todayEntry,supervisor_id:other.id}})));
      assert(dailyRace.filter(r=>r.status==='fulfilled').length===1,"concurrent distinct-key daily submissions create only one report");
      assert((await readKpiReports(db,other)).submittedToday,"different supervisors may each submit on same day");
      await deleteKpiReport(db,admin,daily.id);
      await rejects(()=>createKpiReport(db,supervisor,{...dailyInput,idempotency_key:crypto.randomUUID()}),"soft deletion cannot bypass once-per-day rule");
      await rejects(()=>unlockKpiDailySubmission(db,viewer,supervisor.id),"Viewer cannot unlock daily KPI access");
      await rejects(()=>unlockKpiDailySubmission(db,supervisor,supervisor.id),"Supervisor cannot unlock their own daily access");
      await rejects(()=>unlockKpiDailySubmission(new D1Store(db.db,'x'.repeat(32),'survey'),{...admin,dashboard:'survey'},supervisor.id),"Survey Admin cannot unlock KPI access");
      await rejects(()=>unlockKpiDailySubmission(db,{...supervisor,role:'admin'},supervisor.id),"D1 rejects forged Admin unlock");
      await rejects(()=>unlockKpiDailySubmission(db,admin,viewer.id),"Admin cannot unlock a Viewer as a Supervisor");
      const otherAccessBefore=(await readKpiReports(db,other)).submittedToday;
      await unlockKpiDailySubmission(db,admin,supervisor.id);
      await unlockKpiDailySubmission(db,admin,supervisor.id);
      assert(!(await readKpiReports(db,supervisor)).submittedToday,"Admin unlock reopens today's form despite earlier submitted report");
      assert((await readKpiReports(db,other)).submittedToday===otherAccessBefore,"unlock affects only the chosen Supervisor");
      const unlockedRace=await Promise.allSettled([1,2].map(()=>createKpiReport(db,supervisor,{...dailyInput,idempotency_key:crypto.randomUUID()})));
      assert(unlockedRace.filter(r=>r.status==='fulfilled').length===1,"one Admin unlock permits only one additional submission even under concurrent requests");
      assert((await readKpiReports(db,supervisor)).submittedToday,"additional report closes today's access again");
      await rejects(()=>createKpiReport(db,supervisor,{...dailyInput,idempotency_key:crypto.randomUUID()}),"repeated unlock clicks do not accumulate extra submissions");
      assert(!!(await db.one('SELECT id FROM kpi_daily_reports WHERE id=?',daily.id)),"unlock preserves earlier report and audit history");
      assert(!!(await db.one("SELECT id FROM audit_logs WHERE action='KPI_DAILY_UNLOCKED' AND actor_id=?",admin.id)),"Admin unlock is audited");
      await rejects(()=>saveKpiFormSettings(db,viewer,{}),"Viewer cannot edit form settings");
      await rejects(()=>saveKpiFormSettings(db,supervisor,{}),"Supervisor cannot edit form settings");
      await saveKpiFormSettings(db,admin,{trees_irrigated:{en:'Irrigated trees',ar:'الأشجار المروية',hintEn:'All trees',hintAr:'جميع الأشجار'}});
      assert((await readKpiReports(db,supervisor)).formSettings.trees_irrigated.ar==='الأشجار المروية',"Admin form translations persist and reach supervisors");

      await rejects(()=>db.changeAccount(supervisor,{action:'user.name',id:other.id,full_name:'Forged rename'}),"Supervisor cannot rename another user");
      await db.changeAccount(admin,{action:'user.name',id:other.id,full_name:'Updated Supervisor'});
      assert((await db.accounts(admin)).some(u=>u.id===other.id&&u.full_name==='Updated Supervisor'),"Admin can rename Supervisor without changing account identity");
      const customId='custom_test_field';
      await saveKpiFormSettings(db,admin,{custom:[{id:customId,en:'Farm code',ar:'رمز المزرعة',required:true}],location:{en:'Location',ar:'الموقع',hintEn:'',hintAr:'',hidden:true}});
      await rejects(()=>createKpiReport(db,admin,{idempotency_key:crypto.randomUUID(),entry:{...kpiEntry,location:''}}),"new required textbox is enforced server-side");
      const customReport=await createKpiReport(db,admin,{idempotency_key:crypto.randomUUID(),entry:{...kpiEntry,location:'',custom_fields:{[customId]:'Farm 7'}}});
      assert(((await readKpiReports(db,admin)).reports.find(r=>r.id===customReport.id)?.custom_fields as Record<string,string>)?.[customId]==='Farm 7',"custom textbox answers persist independently from numeric KPI metrics");
      await saveKpiFormSettings(db,admin,{custom:[{id:customId,en:'Farm code',ar:'رمز المزرعة',required:true,hidden:true}]});
      assert(((await readKpiReports(db,admin)).reports.find(r=>r.id===customReport.id)?.custom_fields as Record<string,string>)?.[customId]==='Farm 7',"removing textbox preserves historical answers");

      const importEntry={row:2,date:'2026-10-05',dateRaw:'05/10/2026',time:'09:30:00',supervisor:'old-id',supervisorName:'بلال خان',location:'المزرعة الشمالية',gps:'٢٦٫٥، ٣٧٫٩',notes:'تقرير قديم',metrics:kpiEntrySchema.parse({...kpiEntry,metrics:{trees_irrigated:200,date_palm_pruning:1094,tree_pruning:0,compost_fertilization:70,dayna_trips:2,truck_trips:1}}).metrics};
      const importInput={row:importEntry,supervisor_id:supervisor.id,fileName:'تقرير.xlsx'};
      await rejects(()=>importKpiReport(surveyDB,surveyAdmin,importInput),'Survey Admin cannot import KPI data');
      await rejects(()=>importKpiReport(db,viewer,importInput),'KPI Viewer cannot import historical data');
      await rejects(()=>importKpiReport(db,supervisor,importInput),'KPI Supervisor cannot use Admin historical import');
      const importedBefore=calculateDashboard((await readKpiReports(db,admin)).reports,{mode:'project'},'2026-10-25');
      const [importedA,importedB]=await Promise.all([importKpiReport(db,admin,importInput),importKpiReport(db,admin,{...importInput,fileName:'renamed.xlsx'})]);
      assert(importedA.id===importedB.id,'KPI import is idempotent across filenames and concurrent retries');
      const importedAfter=calculateDashboard((await readKpiReports(db,admin)).reports,{mode:'project'},'2026-10-25');
      assert(importedAfter.cumulative.totals.irrigation-importedBefore.cumulative.totals.irrigation===200&&importedAfter.cumulative.totals.compost-importedBefore.cumulative.totals.compost===70&&importedAfter.cumulative.totals.pruning-importedBefore.cumulative.totals.pruning===1094,'historical imports update actual KPI totals without double counting');
      assert(importedAfter.cumulative.wasteCollectionM3-importedBefore.cumulative.wasteCollectionM3===3,'imported m3 volumes are not multiplied by manual trip factors');
      const directImported=(await readKpiReports(db,admin)).reports.find(r=>r.id===importedA.id)!;assert(directImported.dayna_trips===0&&directImported.truck_trips===0&&directImported.dayna_m3===2&&directImported.truck_m3===1&&directImported.volume_unit==='m3','import volumes and manual trip counts have separate storage');
      const importedView=(await readKpiReports(db,viewer)).reports.find(r=>r.id===importedA.id)!;
      assert((importedView.import_metadata as any).gps===importEntry.gps&&!(importedView.import_metadata as any).supervisorName,'Excel GPS is preserved while Viewer account identity privacy remains enforced');
      await rejects(()=>importKpiReport(db,admin,{...importInput,row:{...importEntry,metrics:{...importEntry.metrics,trees_irrigated:300}}}),'conflicting values for existing historical identity never overwrite or duplicate it');
      await updateKpiReport(db,admin,{id:importedA.id,entry:{...kpiEntry,report_date:importEntry.date,location:importEntry.location,metrics:{trees_irrigated:200,dayna_trips:0,truck_trips:0},waste_volume_m3:{dayna:9.5,truck:12.25}}});
      const editedDirect=(await readKpiReports(db,admin)).reports.find(r=>r.id===importedA.id)!;assert(editedDirect.dayna_m3===9.5&&editedDirect.truck_m3===12.25&&editedDirect.dayna_trips===0,'Admin edits imported m3 volumes without converting to trips');
      const secondHistorical=await importKpiReport(db,admin,{...importInput,row:{...importEntry,time:'11:30:00'}});
      assert(secondHistorical.id!==importedA.id,'distinct historical submissions on same date remain separate');
      await rejects(()=>importKpiReport(db,admin,{...importInput,supervisor_id:surveyAdmin.id}),'import cannot assign reports to Survey accounts');
      await deleteKpiReport(db,admin,importedA.id);const archivedRetry=await importKpiReport(db,admin,importInput);
      assert(archivedRetry.skipped&&archivedRetry.deleted,'retry does not resurrect an Admin-deleted import');
      await db.changeAccount(admin,{action:'user.pin',id:other.id,pin:'055'});
      assert((await surveyDB.session(await surveyDB.login('054','survey-unchanged'))).role==='supervisor','KPI PIN reset does not change Survey PIN');
      await rejects(()=>db.session(otherToken),'old KPI session is not usable after its account reset');
      await db.changeAccount(admin,{action:'user.toggle',id:viewer.id,is_active:false});
      assert((await surveyDB.session(await surveyDB.login('082','survey-viewer-unchanged'))).role==='viewer','KPI deactivation does not deactivate Survey viewer');
      await rejects(()=>db.write(admin,'admin',[db.stmt('UPDATE users SET is_active=0 WHERE id=?',admin.id)]),'last KPI Admin protected independently from Survey Admin');
      const hrDB=new D1Store((env as unknown as {DB:D1Database}).DB,'isolated-test-secret-not-a-production-secret','hr');
      await rejects(()=>hrDB.session(adminToken),'KPI session cannot authenticate future HR dashboard');
      }
      const oldToken = await db.login("082", "viewer-reset-fixture");
      await db.changeAccount(admin, {
        action: "user.pin",
        id: viewer.id,
        pin: "045",
      });
      await rejects(
        () => db.session(oldToken),
        "PIN reset revokes existing sessions",
      );
      const newToken = await db.login("045", "viewer-new-fixture");
      await db.changeAccount(admin, {
        action: "user.toggle",
        id: viewer.id,
        is_active: false,
      });
      await rejects(
        () => db.session(newToken),
        "deactivation revokes sessions",
      );
      await rejects(
        () => db.login("045", "disabled-fixture"),
        "deactivated user cannot log in",
      );
      for (let i = 0; i < 5; i++)
        await rejects(
          () => db.login("999", "rate-fixture"),
          "invalid login rejected",
        );
      for(const key of ['login-global','login-ip:'+db.fingerprint('rate-fixture'),'login-account:'+db.fingerprint('071')])await db.stmt('INSERT OR REPLACE INTO rate_limits(key,hits,expires_at) VALUES(?,?,?)',key,10000,Date.now()+300000).run();
      for(let i=0;i<7;i++){const token=await db.login('071','rate-fixture');assert((await db.session(token)).id===admin.id,'valid login remains available after repeated attempts and old lockout counters');await db.logout(token);}
      const logoutToken = await db.login("071", "logout-fixture");
      await db.logout(logoutToken);
      await rejects(() => db.session(logoutToken), "logout revokes token");
      const expiry = await db.login("071", "expiry-fixture");
      await rejects(
        () => db.session(expiry, Date.now() + 9 * 3600000),
        "session expiry enforced",
      );
      await rejects(
        () => db.changeAccount(admin, { action: "user.delete", id: admin.id }),
        "self removal prevented",
      );
      await db.changeAccount(admin, { action: "user.delete", id: other.id });
      assert(
        !(await db.accounts(admin)).some((u) => u.id === other.id),
        "user removal works",
      );
      assert(
        isSameOrigin({
          url: "https://oasis.example/api/auth",
          headers: new Headers({ origin: "https://oasis.example" }),
        }) &&
          !isSameOrigin({
            url: "https://oasis.example/api/auth",
            headers: new Headers({ origin: "https://evil.example" }),
          }),
        "cross-origin writes rejected",
      );
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMQz3AWz3BmgFAAFJYDCQJ1g9cAAAAASUVORK5CYII=",
        "base64",
      );
      const jpeg = await processPhoto(png);
      assert(jpeg[0] === 255 && jpeg[1] === 216, "photo conversion preserved");
      await rejects(
        () => processPhoto(Buffer.from("invalid image")),
        "invalid photographs rejected",
      );
      return Response.json(passed);
    } catch (e) {
      return Response.json(
        { error: (e as Error).message, passed },
        { status: 500 },
      );
    }
  },
};
