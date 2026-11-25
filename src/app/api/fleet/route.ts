import { NextRequest } from "next/server";
import { z } from "zod";
import { isSameOrigin } from "@/lib/request-security";
import { json, failure } from "@/lib/http";
import { HttpError } from "@/lib/d1-store";
import {
  createVehicle,
  deleteVehicle,
  listVehicles,
  requireFleet,
  updateVehicle,
  vehicleInputSchema,
} from "@/lib/fleet/store";

export async function GET() {
  try {
    const { db, profile } = await requireFleet(false);
    const vehicles = await listVehicles(db);
    return json({ vehicles, profile });
  } catch (e) {
    return failure(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req)) throw new HttpError("FORBIDDEN", 403);
    const { db } = await requireFleet(true);
    const body = await req.json();
    const action = z.enum(["create", "update", "delete"]).parse(body.action);

    if (action === "create") {
      const data = vehicleInputSchema.parse(body.vehicle);
      const vehicle = await createVehicle(db, data);
      return json({ ok: true, vehicle }, 201);
    }

    const id = z.uuid("Invalid vehicle ID.").parse(body.id);

    if (action === "update") {
      const data = vehicleInputSchema.parse(body.vehicle);
      const vehicle = await updateVehicle(db, id, data);
      return json({ ok: true, vehicle });
    }

    await deleteVehicle(db, id);
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
