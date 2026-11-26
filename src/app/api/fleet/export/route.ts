import { failure } from "@/lib/http";
import { listVehicles, requireFleet } from "@/lib/fleet/store";
import { exportFleetWorkbook } from "@/lib/fleet/import-xlsx";

export async function GET() {
  try {
    const { db } = await requireFleet(false);
    const vehicles = await listVehicles(db);
    const date = new Date().toISOString().slice(0, 10);
    return new Response(Buffer.from(exportFleetWorkbook(vehicles)), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="fleet-vehicles-${date}.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
