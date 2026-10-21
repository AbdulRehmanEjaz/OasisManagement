import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/backend";
import { canSubmit } from "@/lib/access-policy";
import { isSameOrigin } from "@/lib/request-security";
import { json, failure } from "@/lib/http";
import { HttpError } from "@/lib/d1-store";
import {
  readRecords,
  captureLocation,
  verifyLocation,
  submitReport,
  registerFacility,
  updateRecord,
  deleteRecord,
} from "@/lib/d1-operations";
import { sendNotification } from "@/lib/notifications";
export async function GET(req: NextRequest) {
  try {
    const { db, profile } = await requireUser();
    return json(
      await readRecords(
        db,
        profile,
        req.nextUrl.searchParams.get("type") || "overview",
        req.nextUrl.searchParams,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req)) throw new HttpError("FORBIDDEN", 403);
    const { db, profile } = await requireUser();
    if (!canSubmit(profile.role)) throw new HttpError("FORBIDDEN", 403);
    const input = await req.json(),
      action = z.enum([
        "location.capture", "location.view", "location.confirm", "report.submit",
        "facility.create", "record.update", "record.delete", "notification.read",
        "delivery.retry", "option.add", "option.toggle",
      ]).parse(input.action);
    await db.limit("operation:" + profile.id + ":" + action, 40);
    if (action === "location.capture")
      return json(await captureLocation(db, profile, input));
    if (action === "location.view" || action === "location.confirm")
      return json(
        await verifyLocation(db, profile, action, z.uuid().parse(input.id)),
      );
    if (action === "report.submit") {
      const data = await submitReport(db, profile, input);
      await sendNotification(db, data.id);
      return json({
        ...data,
        notification_status:
          (
            await db.one(
              "SELECT status FROM delivery_attempts WHERE record_id=?",
              data.id,
            )
          )?.status || "pending",
      });
    }
    if (profile.role !== "admin") throw new HttpError("FORBIDDEN", 403);
    if (action === "facility.create")
      return json(await registerFacility(db, profile, input));
    if (action === "record.update")
      return json(await updateRecord(db, profile, input));
    if (action === "record.delete")
      return json(await deleteRecord(db, profile, input));
    if (action === "notification.read") {
      await db.write(profile, "admin", [
        db.stmt(
          "UPDATE notifications SET is_read=1 WHERE id=? AND recipient_id=?",
          z.uuid().parse(input.id),
          profile.id,
        ),
      ]);
    } else if (action === "delivery.retry") {
      await sendNotification(db, z.uuid().parse(input.record_id));
    } else if (action === "option.add") {
      const v = z
          .object({
            kind: z.enum(["waste", "unit", "facility", "status"]),
            label: z.string().trim().min(1).max(100),
          })
          .parse(input),
        id = crypto.randomUUID();
      await db.write(profile, "admin", [
        db.stmt(
          "INSERT INTO options(id,kind,label) VALUES(?,?,?)",
          id,
          v.kind,
          v.label,
        ),
        db.audit(profile.id, "options", id, "ADDED", v),
      ]);
    } else if (action === "option.toggle") {
      const id = z.uuid().parse(input.id),
        active = z.boolean().parse(input.is_active);
      await db.write(profile, "admin", [
        db.stmt("UPDATE options SET is_active=? WHERE id=?", active, id),
        db.audit(profile.id, "options", id, "ACCESS_CHANGED", {
          is_active: active,
        }),
      ]);
    } else throw new HttpError("Unknown action");
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
