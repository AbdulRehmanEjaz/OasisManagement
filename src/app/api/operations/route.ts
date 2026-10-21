import { NextRequest, NextResponse } from "next/server";
import { requireUser, privileged, rateLimit } from "@/lib/supabase";
import {
  reportSchema,
  facilitySchema,
  validateGPS,
  locationSchema,
} from "@/lib/validation";
import { sendNotification } from "@/lib/notifications";
import { z } from "zod";
export const runtime = "nodejs";
const selects: Record<string, string> = {
  waste: "*,profiles!supervisor_id(full_name),waste_report_photos(*)",
  inspections:
    "*,profiles!supervisor_id(full_name),facilities(name,number,site),facility_inspection_photos(*)",
  facilities: "*,facility_photos(*)",
  users: "id,full_name,email,role,is_active,created_at",
  notifications: "*",
  deliveries: "*",
  audit: "*",
  options: "*",
};
const tables: Record<string, string> = {
  waste: "waste_reports",
  inspections: "facility_inspections",
  facilities: "facilities",
  users: "profiles",
  notifications: "notifications",
  deliveries: "delivery_attempts",
  audit: "audit_logs",
  options: "options",
};
function failure(e: unknown) {
  const msg =
    e instanceof Error
      ? e.message
      : typeof e === "object" && e && "message" in e
        ? String(e.message)
        : "Operation failed. Please retry.";
  const status =
    msg === "UNAUTHORIZED"
      ? 401
      : msg === "FORBIDDEN"
        ? 403
        : msg === "CONFIGURATION_REQUIRED"
          ? 503
          : 400;
  return NextResponse.json(
    {
      error:
        e instanceof z.ZodError
          ? e.issues.map((i) => i.message).join(" ")
          : msg,
    },
    { status },
  );
}
export async function GET(req: NextRequest) {
  try {
    const { db, profile } = await requireUser();
    const q = req.nextUrl.searchParams;
    const type = q.get("type") || "overview";
    if (type === "overview") {
      const now = new Date();
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: process.env.APP_TIMEZONE || "Asia/Riyadh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
      const start = `${date}T00:00:00+03:00`;
      const requests = await Promise.all([
        db.from("waste_reports").select("*", { count: "exact", head: true }),
        db
          .from("facility_inspections")
          .select("*", { count: "exact", head: true }),
        db
          .from("facilities")
          .select("*", { count: "exact", head: true })
          .is("archived_at", null),
        db
          .from("waste_reports")
          .select("*", { count: "exact", head: true })
          .gte("created_at", start),
        db
          .from("facility_inspections")
          .select("*", { count: "exact", head: true })
          .gte("created_at", start),
        db
          .from("delivery_attempts")
          .select("*", { count: "exact", head: true })
          .in("status", ["pending", "failed"]),
        profile.role === "admin"
          ? db
              .from("profiles")
              .select("*", { count: "exact", head: true })
              .eq("role", "supervisor")
              .eq("is_active", true)
          : Promise.resolve({ count: null, error: null }),
        db
          .from("waste_reports")
          .select("id,number,category,created_at")
          .order("created_at", { ascending: false })
          .limit(4),
        db
          .from("facility_inspections")
          .select("id,number,condition,created_at")
          .order("created_at", { ascending: false })
          .limit(4),
      ]);
      for (const r of requests) if (r.error) throw r.error;
      return NextResponse.json({
        waste: requests[0].count,
        inspections: requests[1].count,
        facilities: requests[2].count,
        today: (requests[3].count || 0) + (requests[4].count || 0),
        wasteToday: requests[3].count,
        pending: requests[5].count,
        supervisors: requests[6].count,
        recent: [
          ...("data" in requests[7] ? requests[7].data || [] : []),
          ...("data" in requests[8] ? requests[8].data || [] : []),
        ]
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 5),
      });
    }
    if (!tables[type]) throw new Error("Unknown record type");
    if (
      ["users", "notifications", "audit"].includes(type) &&
      profile.role !== "admin"
    )
      throw new Error("FORBIDDEN");
    if (q.get("map") === "1" && profile.role !== "admin")
      throw new Error("FORBIDDEN");
    let query = db.from(tables[type]).select(selects[type], { count: "exact" });
    if (q.get("id")) query = query.eq("id", z.uuid().parse(q.get("id")));
    if (q.get("facility") && type === "inspections")
      query = query.eq("facility_id", z.uuid().parse(q.get("facility")));
    if (q.get("record") && ["deliveries", "audit"].includes(type))
      query = query.eq("record_id", z.uuid().parse(q.get("record")));
    if (type === "facilities" && q.get("archived") !== "1")
      query = query.is("archived_at", null);
    const term = q
      .get("search")
      ?.trim()
      .replace(/[%_\\]/g, "");
    if (term && ["waste", "inspections", "facilities"].includes(type))
      query = query.ilike(
        type === "facilities" ? "name" : "number",
        `%${term}%`,
      );
    if (q.get("category"))
      query = query.eq(
        type === "inspections" ? "condition" : "category",
        q.get("category"),
      );
    if (q.get("supervisor") && ["waste", "inspections"].includes(type))
      query = query.eq("supervisor_id", z.uuid().parse(q.get("supervisor")));
    if (q.get("date")) {
      const date = z.iso.date().parse(q.get("date"));
      query = query
        .gte("created_at", `${date}T00:00:00+03:00`)
        .lt(
          "created_at",
          new Date(
            Date.parse(`${date}T00:00:00+03:00`) + 86400000,
          ).toISOString(),
        );
    }
    const page = Math.max(0, Number(q.get("page") || 0) || 0);
    const size = q.get("map") === "1" ? 1000 : q.get("all") === "1" ? 250 : 12;
    query = query
      .order(type === "options" ? "label" : "created_at", {
        ascending: q.get("sort") === "oldest" || type === "options",
      })
      .range(page * size, page * size + size - 1);
    const { data, error, count } = await query;
    if (error) throw error;
    if (["waste", "inspections"].includes(type) && data?.length) {
      const records = data as unknown as { id: string }[];
      const { data: deliveries, error: deliveryError } = await db
        .from("delivery_attempts")
        .select("record_id,status")
        .in(
          "record_id",
          records.map((r) => r.id),
        );
      if (deliveryError) throw deliveryError;
      const states = new Map(deliveries?.map((d) => [d.record_id, d.status]));
      return NextResponse.json({
        data: records.map((r) => ({
          ...r,
          email_status: states.get(r.id) || "pending",
        })),
        count,
        page,
        size,
      });
    }
    return NextResponse.json({ data, count, page, size });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("origin") !== req.nextUrl.origin)
      throw new Error("FORBIDDEN");
    const { db, user, profile } = await requireUser();
    const input = await req.json();
    const action = z.string().parse(input.action);
    await rateLimit(db, action, action === "upload" ? 15 : 40);
    if (action === "location.capture") {
      const { data: settings, error: settingsError } = await db
        .from("app_settings")
        .select("gps_accuracy_meters")
        .single();
      if (settingsError) throw settingsError;
      const v = validateGPS(
        locationSchema.parse(input),
        Number(settings.gps_accuracy_meters),
      );
      const { data, error } = await privileged().rpc("capture_location", {
        p_user: user.id,
        p: v,
      });
      if (error) throw error;
      return NextResponse.json({ id: data });
    }
    if (action === "location.view" || action === "location.confirm") {
      const id = z.uuid().parse(input.id);
      const service = privileged();
      const { data: v, error } = await service
        .from("location_verifications")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .is("used_at", null)
        .single();
      if (error || !v) throw new Error("Location unavailable. Capture again.");
      const { data: settings, error: settingsError } = await db
        .from("app_settings")
        .select("gps_accuracy_meters")
        .single();
      if (settingsError) throw settingsError;
      validateGPS(v, Number(settings.gps_accuracy_meters));
      if (action === "location.confirm" && !v.viewed_at)
        throw new Error("Open the location map first.");
      const patch =
        action === "location.view"
          ? { viewed_at: new Date().toISOString(), confirmed_at: null }
          : { confirmed_at: new Date().toISOString() };
      const { error: updateError } = await service
        .from("location_verifications")
        .update(patch)
        .eq("id", id)
        .eq("user_id", user.id)
        .is("used_at", null);
      if (updateError) throw updateError;
      return NextResponse.json({ ...v, ...patch });
    }
    if (action === "report.submit") {
      const p = reportSchema.parse(input);
      const { data, error } = await db.rpc("submit_report", { p });
      if (error) throw error;
      await sendNotification(data.id, p.kind);
      const { data: delivery } = await db
        .from("delivery_attempts")
        .select("status")
        .eq("record_id", data.id)
        .maybeSingle();
      return NextResponse.json({
        ...data,
        notification_status: delivery?.status || "pending",
      });
    }
    if (profile.role !== "admin") throw new Error("FORBIDDEN");
    if (action === "facility.create") {
      const p = facilitySchema.parse(input);
      const { data, error } = await db.rpc("register_facility", { p });
      if (error) throw error;
      return NextResponse.json({ id: data });
    }
    if (action === "record.update") {
      const type = z
        .enum(["waste", "facilities", "inspections"])
        .parse(input.type);
      const id = z.uuid().parse(input.id);
      let patch: Record<string, unknown>;
      if (type === "facilities") {
        patch = z
          .object({
            name: z.string().min(2).max(200),
            category: z.string().min(1),
            site: z.string().min(1).max(200),
            description: z.string().max(4000),
            status: z.string().min(1),
            assigned_supervisor: z.uuid().nullable(),
            remarks: z.string().max(4000),
            latitude: z.number().min(-90).max(90),
            longitude: z.number().min(-180).max(180),
          })
          .parse(input.patch);
      } else if (type === "waste") {
        patch = z
          .object({
            category: z.string().min(1),
            quantity: z.number().positive().max(100000000),
            unit: z.string().min(1),
            description: z.string().max(4000),
          })
          .refine(
            (p) => p.category !== "Other" || !!p.description.trim(),
            "Description required for Other",
          )
          .parse(input.patch);
      } else {
        patch = z
          .object({
            condition: z.string().min(1),
            description: z.string().min(1).max(4000),
          })
          .parse(input.patch);
      }
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
            : [["status", patch.condition]];
      for (const [kind, label] of pairs) {
        const { data, error } = await db
          .from("options")
          .select("id")
          .eq("kind", kind)
          .eq("label", label)
          .eq("is_active", true)
          .single();
        if (error || !data)
          throw new Error("Choose an active category, unit or status.");
      }
      if (type === "facilities" && patch.assigned_supervisor) {
        const { data } = await db
          .from("profiles")
          .select("id")
          .eq("id", patch.assigned_supervisor)
          .eq("role", "supervisor")
          .eq("is_active", true)
          .single();
        if (!data) throw new Error("Choose an active supervisor.");
      }
      if (type === "facilities") patch.updated_at = new Date().toISOString();
      const { data, error } = await db
        .from(tables[type])
        .update(patch)
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
      return NextResponse.json(data);
    }
    if (action === "record.delete") {
      const type = z
        .enum(["waste", "facilities", "inspections"])
        .parse(input.type);
      const id = z.uuid().parse(input.id);
      const result =
        type === "facilities"
          ? await db
              .from("facilities")
              .update({ archived_at: new Date().toISOString() })
              .eq("id", id)
              .select("id")
              .single()
          : await db
              .from(tables[type])
              .delete()
              .eq("id", id)
              .select("id")
              .single();
      if (result.error) throw result.error;
      return NextResponse.json({ ok: true });
    }
    if (action === "user.create") {
      const v = z
        .object({
          full_name: z.string().trim().min(2).max(200),
          email: z.email(),
          password: z.string().min(12).max(128),
        })
        .parse(input);
      const service = privileged();
      const { data, error } = await service.auth.admin.createUser({
        email: v.email,
        password: v.password,
        email_confirm: true,
      });
      if (error) throw error;
      const { error: pError } = await service.from("profiles").insert({
        id: data.user.id,
        full_name: v.full_name,
        email: v.email,
        role: "supervisor",
      });
      if (pError) {
        await service.auth.admin.deleteUser(data.user.id);
        throw pError;
      }
      return NextResponse.json({ ok: true });
    }
    if (action === "user.toggle") {
      const id = z.uuid().parse(input.id);
      if (id === user.id) throw new Error("You cannot deactivate yourself.");
      const { error } = await db
        .from("profiles")
        .update({
          is_active: z.boolean().parse(input.is_active),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("role", "supervisor");
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === "notification.read") {
      const { error } = await db
        .from("notifications")
        .update({ is_read: true })
        .eq("id", z.uuid().parse(input.id))
        .eq("recipient_id", user.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === "delivery.retry") {
      await sendNotification(
        z.uuid().parse(input.record_id),
        z.enum(["waste", "inspection"]).parse(input.kind),
      );
      return NextResponse.json({ ok: true });
    }
    if (action === "option.add") {
      const v = z
        .object({
          kind: z.enum(["waste", "unit", "facility", "status"]),
          label: z.string().trim().min(1).max(100),
        })
        .parse(input);
      const { error } = await db.from("options").insert(v);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === "option.toggle") {
      const { error } = await db
        .from("options")
        .update({ is_active: z.boolean().parse(input.is_active) })
        .eq("id", z.uuid().parse(input.id));
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    throw new Error("Unknown action");
  } catch (e) {
    return failure(e);
  }
}
