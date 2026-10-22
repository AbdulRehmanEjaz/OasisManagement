import { z } from "zod";
import { D1Store, HttpError, type Actor, type Data } from "./d1-store";
import { canReadType, canSubmit } from "./access-policy";
import {
  reportSchema,
  facilitySchema,
  locationSchema,
  validateGPS,
  structureTypes,
} from "./validation";
export function submissionDate(now = new Date(), timezone = process.env.APP_TIMEZONE || "Asia/Riyadh") {
  const parts = new Intl.DateTimeFormat("en", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return ["year", "month", "day"].map(type => parts.find(p => p.type === type)!.value).join("-");
}
const uuid = () => crypto.randomUUID();
const tables: Record<string, string> = {
  waste: "reports",
  inspections: "reports",
  facilities: "facilities",
  notifications: "notifications",
  deliveries: "delivery_attempts",
  audit: "audit_logs",
  options: "options",
};
export async function readRecords(
  db: D1Store,
  actor: Actor,
  type: string,
  q: URLSearchParams,
): Promise<Data> {
  if (!canReadType(actor.role, type)) throw new HttpError("FORBIDDEN", 403);
  if (actor.role === "supervisor" && type === "facilities") {
    const data = await db.all(
      "SELECT id,number,name,site FROM facilities WHERE assigned_supervisor=? AND archived_at IS NULL ORDER BY name",
      actor.id,
    );
    return { data, count: data.length };
  }
  if (type === "overview") {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: process.env.APP_TIMEZONE || "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const counts = await db.one(
      `SELECT (SELECT count(*) FROM reports WHERE kind='waste') waste,(SELECT count(*) FROM reports WHERE kind='inspection') inspections,(SELECT count(*) FROM facilities WHERE archived_at IS NULL) facilities,(SELECT count(*) FROM reports WHERE kind='waste' AND created_at>=?) wasteToday,(SELECT count(*) FROM reports WHERE created_at>=?) today`,
      new Date(`${today}T00:00:00+03:00`).toISOString(),
      new Date(`${today}T00:00:00+03:00`).toISOString(),
    );
    const recent = await db.all(
      "SELECT id,number,category,condition,created_at FROM reports ORDER BY created_at DESC LIMIT 5",
    );
    return {
      ...counts,
      recent,
      ...(actor.role === "admin"
        ? {
            pending: (
              await db.one(
                "SELECT count(*) n FROM delivery_attempts WHERE status IN ('pending','failed')",
              )
            )?.n,
            supervisors: (
              await db.one(
                "SELECT count(*) n FROM users WHERE role='supervisor' AND is_active=1 AND deleted_at IS NULL",
              )
            )?.n,
          }
        : {}),
    };
  }
  const table = tables[type];
  if (!table) throw new HttpError("Unknown record type");
  const where: string[] = [],
    values: unknown[] = [];
  const filter = (sql: string, value: unknown) => {
    where.push(sql);
    values.push(value);
  };
  if (type === "waste" || type === "inspections")
    filter("kind=?", type === "waste" ? "waste" : "inspection");
  if (q.get("id")) filter("id=?", z.uuid().parse(q.get("id")));
  if (type === "facilities" && q.get("archived") !== "1")
    where.push("archived_at IS NULL");
  if (type === "notifications") filter("recipient_id=?", actor.id);
  if (q.get("facility") && type === "inspections")
    filter("facility_id=?", z.uuid().parse(q.get("facility")));
  if (q.get("record") && ["deliveries", "audit"].includes(type))
    filter("record_id=?", z.uuid().parse(q.get("record")));
  if (q.get("supervisor")) {
    if (actor.role !== "admin") throw new HttpError("FORBIDDEN", 403);
    if (["waste", "inspections"].includes(type))
      filter("supervisor_id=?", z.uuid().parse(q.get("supervisor")));
  }
  const term = q
    .get("search")
    ?.trim()
    .slice(0, 200)
    .replace(/[%_\\]/g, "");
  if (term && ["waste", "inspections", "facilities"].includes(type))
    filter(`${type === "facilities" ? "name" : "number"} LIKE ?`, `%${term}%`);
  if (
    q.get("category") &&
    ["waste", "inspections", "facilities"].includes(type)
  )
    filter(
      `${type === "inspections" ? "condition" : "category"}=?`,
      q.get("category"),
    );
  if (q.get("date")) {
    const date = z.iso.date().parse(q.get("date")),
      start = Date.parse(`${date}T00:00:00+03:00`);
    filter("created_at>=?", new Date(start).toISOString());
    filter("created_at<?", new Date(start + 86400000).toISOString());
  }
  const clause = where.length ? " WHERE " + where.join(" AND ") : "";
  const page = Math.min(
      10000,
      Math.max(0, Math.floor(Number(q.get("page")) || 0)),
    ),
    size = q.get("map") === "1" ? 1000 : q.get("all") === "1" ? 250 : 12;
  const count =
    (await db.one(`SELECT count(*) n FROM ${table}${clause}`, ...values))?.n ||
    0;
  const order = type === "options" ? "label" : "created_at",
    direction =
      type === "options" || q.get("sort") === "oldest" ? "ASC" : "DESC";
  const isRecord = ["waste", "inspections", "facilities"].includes(type);
  let projection = "r.*";
  if (isRecord)
    projection += `,(SELECT json_group_array(json_object('id',p.id,'url',p.url)) FROM record_photos p WHERE p.${type === "facilities" ? "facility_id" : "report_id"}=r.id) AS photo_list`;
  if (type === "inspections")
    projection += `,(SELECT json_object('name',f.name,'number',f.number,'site',f.site) FROM facilities f WHERE f.id=r.facility_id) AS facility_info`;
  if (actor.role === "admin" && ["waste", "inspections"].includes(type))
    projection += `,(SELECT full_name FROM users u WHERE u.id=r.supervisor_id) AS supervisor_name,(SELECT status FROM delivery_attempts d WHERE d.record_id=r.id) AS email_status`;
  // Photos, facility metadata and delivery status stay in one query even for
  // a 1,000-marker map. Avoid per-record D1 requests/subrequest exhaustion.
  const rows = await db.all(
    `SELECT ${projection} FROM ${table} r${clause} ORDER BY ${order} ${direction},id LIMIT ? OFFSET ?`,
    ...values,
    size,
    page * size,
  );
  const data = rows.map((row) => {
    if (type === "audit")
      return { ...row, change_summary: JSON.parse(row.change_summary) };
    if (type === "options") return { ...row, is_active: !!row.is_active };
    if (type === "notifications") return { ...row, is_read: !!row.is_read };
    if (!["waste", "inspections", "facilities"].includes(type)) return row;
    const photos = JSON.parse(row.photo_list || "[]");
    const result = { ...row };
    delete result.photo_ids;
    delete result.creator_id;
    delete result.location_id;
    delete result.idempotency_key;
    delete result.photo_list;
    delete result.facility_info;
    delete result.supervisor_name;
    if (actor.role === "viewer") {
      delete result.supervisor_id;
      delete result.assigned_supervisor;
    } else if (row.supervisor_id)
      result.profiles = { full_name: row.supervisor_name };
    result[
      type === "waste"
        ? "waste_report_photos"
        : type === "inspections"
          ? "facility_inspection_photos"
          : "facility_photos"
    ] = photos;
    if (type === "inspections")
      result.facilities = JSON.parse(row.facility_info || "null");
    if (actor.role === "admin" && type !== "facilities")
      result.email_status = row.email_status || "pending";
    return result;
  });
  return { data, count, page, size };
}
export async function captureLocation(
  db: D1Store,
  actor: Actor,
  input: unknown,
) {
  const threshold = Number(
    (await db.one("SELECT gps_accuracy_meters FROM app_settings WHERE id=1"))
      ?.gps_accuracy_meters || 20,
  );
  const v = validateGPS(locationSchema.parse(input), threshold),
    id = uuid(),
    now = new Date().toISOString();
  await db.write(actor, "submit", [
    db.stmt(
      "UPDATE location_verifications SET used_at=?,confirmed_at=NULL WHERE user_id=? AND used_at IS NULL",
      now,
      actor.id,
    ),
    db.stmt(
      "INSERT INTO location_verifications(id,user_id,latitude,longitude,accuracy,captured_at) VALUES(?,?,?,?,?,?)",
      id,
      actor.id,
      v.latitude,
      v.longitude,
      v.accuracy,
      v.captured_at,
    ),
  ]);
  return { id };
}
export async function verifyLocation(
  db: D1Store,
  actor: Actor,
  action: string,
  id: string,
) {
  const v = await db.one(
    "SELECT * FROM location_verifications WHERE id=? AND user_id=? AND used_at IS NULL",
    id,
    actor.id,
  );
  if (!v) throw new HttpError("Location unavailable. Capture again.");
  const threshold = Number(
    (await db.one("SELECT gps_accuracy_meters FROM app_settings WHERE id=1"))
      ?.gps_accuracy_meters || 20,
  );
  validateGPS(v as Parameters<typeof validateGPS>[0], threshold);
  if (action === "location.confirm" && !v.viewed_at)
    throw new HttpError("Open the location map first.");
  const now = new Date().toISOString();
  await db.write(actor, "submit", [
    action === "location.view"
      ? db.stmt(
          "UPDATE location_verifications SET viewed_at=?,confirmed_at=NULL WHERE id=? AND user_id=? AND used_at IS NULL",
          now,
          id,
          actor.id,
        )
      : db.stmt(
          "UPDATE location_verifications SET confirmed_at=? WHERE id=? AND user_id=? AND viewed_at IS NOT NULL AND used_at IS NULL",
          now,
          id,
          actor.id,
        ),
  ]);
  return { id };
}
export async function submitReport(db: D1Store, actor: Actor, input: unknown) {
  if (!canSubmit(actor.role)) throw new HttpError("FORBIDDEN", 403);
  // Device-provided dates are never trusted as the submission date.
  const p = reportSchema.parse({ ...(input as Data), ...((input as Data).kind === "waste" ? { unit: "Kilograms (kg)" } : {}), inspection_date: submissionDate() });
  const previous = () =>
    db.one(
      "SELECT id,number,created_at FROM reports WHERE supervisor_id=? AND idempotency_key=? AND kind=?",
      actor.id,
      p.idempotency_key,
      p.kind,
    );
  const existing = await previous();
  if (existing) return existing;
  const loc = await db.one(
    "SELECT * FROM location_verifications WHERE id=? AND user_id=?",
    p.location_id,
    actor.id,
  );
  if (!loc)
    throw new HttpError("Capture and confirm a recent accurate GPS location.");
  const id = uuid();
  try {
    await db.write(actor, "submit", [
      db.stmt(
        `INSERT INTO reports(id,kind,supervisor_id,site,category,quantity,unit,description,facility_id,condition,inspection_date,location_id,latitude,longitude,gps_accuracy_meters,gps_captured_at,location_confirmed_at,photo_ids,idempotency_key,structure_type) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id,
        p.kind,
        actor.id,
        p.site,
        p.category,
        p.quantity,
        p.unit,
        p.description,
        p.facility_id,
        p.condition,
        p.inspection_date,
        loc.id,
        loc.latitude,
        loc.longitude,
        loc.accuracy,
        loc.captured_at,
        loc.confirmed_at,
        JSON.stringify(p.photo_ids),
        p.idempotency_key,
        p.structure_type,
      ),
      db.audit(actor.id, "reports", id, "SUBMITTED"),
    ]);
  } catch (e) {
    const retry = await previous();
    if (retry) return retry;
    throw e;
  }
  return (await previous())!;
}
export async function registerFacility(
  db: D1Store,
  actor: Actor,
  input: unknown,
) {
  const p = facilitySchema.extend({ structure_type: z.enum(structureTypes) }).parse(input),
    id = uuid();
  await db.write(actor, "admin", [
    db.stmt(
      `INSERT INTO facilities(id,name,category,site,description,status,latitude,longitude,assigned_supervisor,remarks,photo_ids,creator_id,structure_type) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      p.name,
      p.category,
      p.site,
      p.description,
      p.status,
      p.latitude,
      p.longitude,
      p.assigned_supervisor,
      p.remarks,
      JSON.stringify(p.photo_ids),
      actor.id,
      p.structure_type,
    ),
    db.audit(actor.id, "facilities", id, "CREATED"),
  ]);
  return { id };
}
export async function updateRecord(db: D1Store, actor: Actor, input: Data) {
  if (actor.role !== "admin") throw new HttpError("FORBIDDEN", 403);
  const type = z.enum(["waste", "facilities", "inspections"]).parse(input.type),
    id = z.uuid().parse(input.id),
    table = type === "facilities" ? "facilities" : "reports";
  const row = await db.one(`SELECT * FROM ${table} WHERE id=?`, id);
  if (
    !row ||
    (type === "waste" && row.kind !== "waste") ||
    (type === "inspections" && row.kind !== "inspection")
  )
    throw new HttpError("Record unavailable.", 404);
  let patch: Data;
  if (type === "facilities")
    patch = facilitySchema.omit({ photo_ids: true }).parse(input.patch);
  else if (type === "waste")
    patch = z
      .object({
        site: z.string().trim().max(200).nullable().optional(),
        category: z.string().min(1).max(100),
        quantity: z.number().positive().max(100000000),
        unit: z.string().min(1).max(50),
        description: z.string().max(4000),
      })
      .refine(
        (p) => p.category !== "Other" || !!p.description.trim(),
        "Describe Other waste.",
      )
      .parse(input.patch);
  else
    patch = z
      .object({
        condition: z.string().min(1).max(100).optional(),
        description: z.string().min(1).max(4000),
        site: z.string().trim().min(1).max(200).optional(),
        structure_type: z.enum(structureTypes).optional(),
      })
      .parse(input.patch);
  const pairs =
    type === "facilities"
      ? [
          ["facility", patch.category],
          ["status", patch.status],
        ]
      : type === "waste"
        ? [
            ["waste", patch.category],
            ["unit", patch.unit],
          ]
        : patch.condition ? [["status", patch.condition]] : [];
  for (const [kind, label] of pairs)
    if (
      !(await db.one(
        "SELECT id FROM options WHERE kind=? AND label=? AND is_active=1",
        kind,
        label,
      ))
    )
      throw new HttpError("Choose active categories, units and statuses.");
  if (
    patch.assigned_supervisor &&
    !(await db.one(
      "SELECT id FROM users WHERE id=? AND role='supervisor' AND is_active=1 AND deleted_at IS NULL",
      patch.assigned_supervisor,
    ))
  )
    throw new HttpError("Choose an active supervisor.");
  if (type === "facilities") patch.updated_at = new Date().toISOString();
  await db.write(actor, "admin", [
    db.stmt(
      `UPDATE ${table} SET ${Object.keys(patch)
        .map((k) => k + "=?")
        .join(",")} WHERE id=?`,
      ...Object.values(patch),
      id,
    ),
    db.audit(actor.id, type, id, "UPDATED", { old: row, new: patch }),
  ]);
  return { id };
}
export async function deleteRecord(db: D1Store, actor: Actor, input: Data) {
  if (actor.role !== "admin") throw new HttpError("FORBIDDEN", 403);
  const type = z.enum(["waste", "facilities", "inspections"]).parse(input.type),
    id = z.uuid().parse(input.id),
    table = type === "facilities" ? "facilities" : "reports";
  const row = await db.one(
    `SELECT id FROM ${table} WHERE id=?${type === "facilities" ? "" : " AND kind=?"}`,
    id,
    ...(type === "facilities"
      ? []
      : [type === "waste" ? "waste" : "inspection"]),
  );
  if (!row) throw new HttpError("Record unavailable.", 404);
  await db.write(actor, "admin", [
    type === "facilities"
      ? db.stmt(
          "UPDATE facilities SET archived_at=? WHERE id=?",
          new Date().toISOString(),
          id,
        )
      : db.stmt("DELETE FROM reports WHERE id=?", id),
    db.audit(
      actor.id,
      type,
      id,
      type === "facilities" ? "ARCHIVED" : "DELETED",
    ),
  ]);
  return { ok: true };
}
