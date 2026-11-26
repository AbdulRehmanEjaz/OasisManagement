import { NextRequest } from "next/server";
import { z } from "zod";
import { isSameOrigin } from "@/lib/request-security";
import { failure, json } from "@/lib/http";
import { HttpError } from "@/lib/d1-store";
import {
  createFuelCard,
  deleteFuelCard,
  fuelCardInputSchema,
  listFuelCards,
  requireFleet,
  updateFuelCard,
} from "@/lib/fleet/store";

export async function GET() {
  try {
    const { db } = await requireFleet(false);
    const cards = await listFuelCards(db);
    return json({ cards });
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
      const data = fuelCardInputSchema.parse(body.card);
      const card = await createFuelCard(db, data);
      return json({ ok: true, card }, 201);
    }

    const id = z.uuid("Invalid fuel card ID.").parse(body.id);

    if (action === "update") {
      const data = fuelCardInputSchema.parse(body.card);
      const card = await updateFuelCard(db, id, data);
      return json({ ok: true, card });
    }

    await deleteFuelCard(db, id);
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
