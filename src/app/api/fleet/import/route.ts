import { NextRequest } from "next/server";
import { isSameOrigin } from "@/lib/request-security";
import { failure, json } from "@/lib/http";
import { HttpError } from "@/lib/d1-store";
import {
  createVehicle,
  requireFleet,
  vehicleInputSchema,
} from "@/lib/fleet/store";
import {
  fleetImportTemplate,
  parseFleetWorkbook,
} from "@/lib/fleet/import-xlsx";

export async function GET() {
  try {
    await requireFleet(true);
    return new Response(Buffer.from(fleetImportTemplate()), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="fleet-vehicles-template.xlsx"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req)) throw new HttpError("FORBIDDEN", 403);
    const { db } = await requireFleet(true);

    if (
      req.headers
        .get("content-type")
        ?.includes(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    ) {
      if (Number(req.headers.get("content-length")) > 2 * 1024 * 1024) {
        throw new HttpError("Choose an .xlsx file smaller than 2 MB.");
      }
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (!bytes.length || bytes.length > 2 * 1024 * 1024) {
        throw new HttpError("Choose an .xlsx file smaller than 2 MB.");
      }
      try {
        const rows = parseFleetWorkbook(bytes);
        return json({ rows });
      } catch (e) {
        throw new HttpError((e as Error).message || "Invalid workbook.");
      }
    }

    const body = await req.json();
    if (
      !Array.isArray(body.rows) ||
      body.rows.length < 1 ||
      body.rows.length > 50
    ) {
      throw new HttpError("Send between 1 and 50 rows per batch.");
    }

    const results: { row: number; ok: boolean; error?: string }[] = [];
    for (const item of body.rows) {
      try {
        const parsed = vehicleInputSchema.parse(item.vehicle);
        await createVehicle(db, parsed);
        results.push({ row: Number(item.row) || 0, ok: true });
      } catch (e) {
        results.push({
          row: Number(item.row) || 0,
          ok: false,
          error: (e as Error).message || "Could not import this row.",
        });
      }
    }
    return json({ results });
  } catch (e) {
    return failure(e);
  }
}
