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
      async function* zipPhotos() {yield {number:"COSA-001",url:"https://i.ibb.co/fixture/photo.jpg"};}
      const originalPhoto = new Uint8Array([255,216,255,0,9,1]);
      const zipParts: Uint8Array[] = [];
      for await (const chunk of photoZip(zipPhotos(),new AbortController().signal,(async()=>new Response(originalPhoto,{headers:{"Content-Type":"image/jpeg"}})) as typeof fetch)) zipParts.push(chunk);
      const archive = new Uint8Array(zipParts.reduce((n,p)=>n+p.length,0));let zipOffset=0;for(const part of zipParts){archive.set(part,zipOffset);zipOffset+=part.length;}
      const zipPhoto = unzipSync(archive)["COSA-001/COSA-001-01.jpg"];
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
      assert(report.number === "COSA-001", "atomic sequential report number");
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
      await deleteRecord(db,admin,{type:"waste",id:report.id});
      assert(!await db.one("SELECT id FROM reports WHERE id=?",report.id)&&!await db.one("SELECT id FROM record_photos WHERE report_id=?",report.id),"administrator deletion cascades report photo associations");
      async function newWaste(){return submitReport(db,supervisor,{...input,location_id:await location(supervisor),photo_ids:(await photos(supervisor)).slice(0,1),idempotency_key:crypto.randomUUID()});}
      const first=await newWaste(),second=await newWaste();
      assert(first.number==="COSA-001"&&second.number==="COSA-002","deleting final report restarts at 001");
      await deleteRecord(db,admin,{type:"waste",id:first.id});
      assert((await db.one("SELECT number FROM reports WHERE id=?",second.id))?.number==="COSA-001","deleting middle report closes numbering gap");
      assert(!!await db.one("SELECT id FROM record_photos WHERE report_id=?",second.id),"renumbering preserves photo association");
      const third=await newWaste();assert(third.number==="COSA-002","new report follows compacted sequence");
      await deleteRecord(db,admin,{type:"waste",id:third.id});await deleteRecord(db,admin,{type:"waste",id:second.id});
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
      let limited = false;
      try {
        await db.login("071", "rate-fixture");
      } catch (e) {
        limited = (e as { status?: number }).status === 429;
      }
      assert(limited, "login rate limiting enforced");
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
