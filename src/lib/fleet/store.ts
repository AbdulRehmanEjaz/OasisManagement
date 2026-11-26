import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import type { D1Database } from "@cloudflare/workers-types";
import { z } from "zod";
import { getBindings } from "@/lib/runtime";
import { HttpError, pinSchema, tokenHash } from "@/lib/d1-store";

export type FleetRole = "admin" | "viewer";
export type FleetProfile = { role: FleetRole; full_name: string };

export type FleetVehicle = {
  id: string;
  vehicle_name: string;
  model: string;
  plate_number: string;
  fuel_type: string;
  owner: string;
  monthly_rent_type: "N/A" | "amount";
  monthly_rent: number | null;
  driver_name: string;
  driver_id_no: string;
  project_number: string;
  project_location: string;
  fuel_card_no: string;
  fuel_card_limit: number | null;
  phone_number: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type FleetFuelCard = {
  id: string;
  card_no: string;
  card_limit: number | null;
  assigned_to: string;
  assigned_id_no: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

const FLEET_PINS: Record<string, FleetRole> = {
  "090": "admin",
  "080": "viewer",
};

export const fleetCookieName = () =>
  process.env.NODE_ENV === "production"
    ? "__Host-fleet-session"
    : "fleet-panel-session";

let fleetSchemaReady = false;

async function ensureFleetSchema(db: D1Database) {
  if (fleetSchemaReady) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS fleet_sessions (
      token_hash TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK(role IN ('admin','viewer')),
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS fleet_sessions_expires ON fleet_sessions(expires_at)`,
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS fleet_vehicles (
      id TEXT PRIMARY KEY,
      vehicle_name TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT '',
      plate_number TEXT NOT NULL,
      fuel_type TEXT NOT NULL DEFAULT '',
      owner TEXT NOT NULL DEFAULT '',
      monthly_rent_type TEXT NOT NULL DEFAULT 'N/A' CHECK(monthly_rent_type IN ('amount','N/A')),
      monthly_rent REAL,
      driver_name TEXT NOT NULL DEFAULT '',
      driver_id_no TEXT NOT NULL DEFAULT '',
      project_number TEXT NOT NULL DEFAULT '',
      project_location TEXT NOT NULL DEFAULT '',
      fuel_card_no TEXT NOT NULL DEFAULT '',
      fuel_card_limit REAL,
      phone_number TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      deleted_at TEXT
    )`),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS fleet_vehicles_active ON fleet_vehicles(deleted_at, created_at DESC)`,
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS fleet_fuel_cards (
      id TEXT PRIMARY KEY,
      card_no TEXT NOT NULL,
      card_limit REAL,
      assigned_to TEXT NOT NULL DEFAULT 'Inventory',
      assigned_id_no TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      deleted_at TEXT
    )`),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS fleet_fuel_cards_active ON fleet_fuel_cards(deleted_at, created_at ASC)`,
    ),
  ]);
  fleetSchemaReady = true;
}

export async function getFleetDb(): Promise<D1Database> {
  const env = await getBindings();
  if (!env.DB) {
    throw new HttpError(
      "D1 is not bound. Complete the Cloudflare database setup.",
      503,
    );
  }
  await ensureFleetSchema(env.DB);
  return env.DB;
}

const optionalNumber = z.preprocess((v) => {
  if (v === "" || v === null || v === undefined) return null;
  if (typeof v === "string" && /^(n\/?a|-|—|none)$/i.test(v.trim())) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}, z.number().min(0, "Must be 0 or greater.").max(100000000).nullable());

export const vehicleInputSchema = z
  .object({
    vehicle_name: z.string().trim().min(1, "Vehicle name is required.").max(120),
    model: z.string().trim().max(100).default(""),
    plate_number: z.string().trim().min(1, "Plate number is required.").max(60),
    fuel_type: z.string().trim().max(60).default(""),
    owner: z.string().trim().max(120).default(""),
    monthly_rent_type: z.enum(["N/A", "amount"]).default("N/A"),
    monthly_rent: optionalNumber.default(null),
    driver_name: z.string().trim().max(120).default(""),
    driver_id_no: z.string().trim().max(60).default(""),
    project_number: z.string().trim().max(60).default(""),
    project_location: z.string().trim().max(160).default(""),
    fuel_card_no: z.string().trim().max(60).default(""),
    fuel_card_limit: optionalNumber.default(null),
    phone_number: z.string().trim().max(40).default(""),
    notes: z.string().trim().max(2000).default(""),
  })
  .superRefine((data, ctx) => {
    if (data.monthly_rent_type === "amount" && data.monthly_rent === null) {
      ctx.addIssue({
        code: "custom",
        path: ["monthly_rent"],
        message: "Enter the monthly rent amount or select N/A.",
      });
    }
  })
  .transform((data) => ({
    ...data,
    monthly_rent: data.monthly_rent_type === "N/A" ? null : data.monthly_rent,
  }));

export type VehicleInput = z.infer<typeof vehicleInputSchema>;

export async function fleetLogin(db: D1Database, pin: string, now = Date.now()) {
  pinSchema.parse(pin);
  const role = FLEET_PINS[pin];
  if (!role) throw new HttpError("Incorrect PIN. Please try again.", 401);
  const token = randomBytes(32).toString("hex");
  await db.batch([
    db
      .prepare(
        "INSERT INTO fleet_sessions(token_hash,role,expires_at) VALUES(?,?,?)",
      )
      .bind(tokenHash(token), role, now + 8 * 3600000),
    db.prepare("DELETE FROM fleet_sessions WHERE expires_at<?").bind(now),
  ]);
  return { token, role };
}

export async function fleetLogout(db: D1Database, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return;
  await db
    .prepare("DELETE FROM fleet_sessions WHERE token_hash=?")
    .bind(tokenHash(token))
    .run();
}

export async function fleetSession(
  db: D1Database,
  token: string,
  now = Date.now(),
): Promise<FleetProfile> {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new HttpError("UNAUTHORIZED", 401);
  const row = await db
    .prepare(
      "SELECT role FROM fleet_sessions WHERE token_hash=? AND expires_at>?",
    )
    .bind(tokenHash(token), now)
    .first<{ role: FleetRole }>();
  if (!row) throw new HttpError("UNAUTHORIZED", 401);
  return {
    role: row.role,
    full_name: row.role === "admin" ? "Fleet Admin" : "Fleet Viewer",
  };
}

export async function requireFleet(admin = false) {
  const db = await getFleetDb();
  const token = (await cookies()).get(fleetCookieName())?.value || "";
  const profile = await fleetSession(db, token);
  if (admin && profile.role !== "admin") throw new HttpError("FORBIDDEN", 403);
  return { db, profile };
}

export async function listVehicles(db: D1Database): Promise<FleetVehicle[]> {
  const res = await db
    .prepare(
      `SELECT id,vehicle_name,model,plate_number,fuel_type,owner,monthly_rent_type,monthly_rent,driver_name,driver_id_no,project_number,project_location,fuel_card_no,fuel_card_limit,phone_number,notes,created_at,updated_at
       FROM fleet_vehicles
       WHERE deleted_at IS NULL
       ORDER BY created_at ASC, rowid ASC`,
    )
    .all<FleetVehicle>();
  return res.results;
}

export const fuelCardInputSchema = z.object({
  card_no: z.string().trim().min(1, "Fuel card number is required.").max(80),
  card_limit: optionalNumber.default(null),
  assigned_to: z.string().trim().min(1, "Assigned to is required.").max(120).default("Inventory"),
  assigned_id_no: z.string().trim().max(60).default(""),
  notes: z.string().trim().max(1000).default(""),
});

export type FuelCardInput = z.infer<typeof fuelCardInputSchema>;

export async function listFuelCards(db: D1Database): Promise<FleetFuelCard[]> {
  const res = await db
    .prepare(
      `SELECT id,card_no,card_limit,assigned_to,assigned_id_no,notes,created_at,updated_at
       FROM fleet_fuel_cards
       WHERE deleted_at IS NULL
       ORDER BY created_at ASC, rowid ASC`,
    )
    .all<FleetFuelCard>();
  return res.results;
}

function normUnique(val: string | null | undefined) {
  const s = (val || "").trim();
  if (!s || /^(-|—|n\/?a|none)$/i.test(s)) return "";
  return s.toLowerCase();
}

async function checkVehicleDuplicates(
  db: D1Database,
  input: VehicleInput,
  excludeId?: string,
) {
  const plate = normUnique(input.plate_number);
  const card = normUnique(input.fuel_card_no);
  const driverId = normUnique(input.driver_id_no);

  const vehicles = await listVehicles(db);
  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    if (excludeId && v.id === excludeId) continue;
    const ref = `Fleet Registry #${i + 1} (${v.vehicle_name}${v.driver_name ? `, Driver: ${v.driver_name}` : ""})`;
    if (plate && normUnique(v.plate_number) === plate) {
      throw new HttpError(
        `Duplicate Plate No. "${input.plate_number}" — already exists in ${ref}.`,
        409,
      );
    }
    if (card && normUnique(v.fuel_card_no) === card) {
      throw new HttpError(
        `Duplicate Fuel Card No. "${input.fuel_card_no}" — already assigned in ${ref}.`,
        409,
      );
    }
    if (driverId && normUnique(v.driver_id_no) === driverId) {
      throw new HttpError(
        `Duplicate Driver ID "${input.driver_id_no}" — already assigned in ${ref}.`,
        409,
      );
    }
  }

  if (card) {
    const cards = await listFuelCards(db);
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      if (normUnique(c.card_no) === card) {
        throw new HttpError(
          `Duplicate Fuel Card No. "${input.fuel_card_no}" — already exists in Fuel Cards tab (${c.assigned_to}).`,
          409,
        );
      }
    }
  }
}

async function checkFuelCardDuplicates(
  db: D1Database,
  input: FuelCardInput,
  excludeId?: string,
) {
  const card = normUnique(input.card_no);
  const idNo = normUnique(input.assigned_id_no);

  if (card) {
    const vehicles = await listVehicles(db);
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (normUnique(v.fuel_card_no) === card) {
        throw new HttpError(
          `Duplicate Fuel Card No. "${input.card_no}" — already assigned in Fleet Registry #${i + 1} (${v.vehicle_name}, Plate: ${v.plate_number}, Driver: ${v.driver_name || "Unassigned"}).`,
          409,
        );
      }
    }
  }

  const cards = await listFuelCards(db);
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (excludeId && c.id === excludeId) continue;
    if (card && normUnique(c.card_no) === card) {
      throw new HttpError(
        `Duplicate Fuel Card No. "${input.card_no}" — already exists in Fuel Cards tab (${c.assigned_to}).`,
        409,
      );
    }
    if (idNo && normUnique(c.assigned_id_no) === idNo) {
      throw new HttpError(
        `Duplicate Driver ID "${input.assigned_id_no}" — already assigned to card "${c.card_no}" in Fuel Cards tab (${c.assigned_to}).`,
        409,
      );
    }
  }
}

export async function createFuelCard(
  db: D1Database,
  input: FuelCardInput,
): Promise<FleetFuelCard> {
  await checkFuelCardDuplicates(db, input);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO fleet_fuel_cards(id,card_no,card_limit,assigned_to,assigned_id_no,notes,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?)`,
    )
    .bind(
      id,
      input.card_no,
      input.card_limit,
      input.assigned_to,
      input.assigned_id_no,
      input.notes,
      now,
      now,
    )
    .run();
  return { id, ...input, created_at: now, updated_at: now };
}

export async function updateFuelCard(
  db: D1Database,
  id: string,
  input: FuelCardInput,
): Promise<FleetFuelCard> {
  await checkFuelCardDuplicates(db, input, id);
  const now = new Date().toISOString();
  const res = await db
    .prepare(
      `UPDATE fleet_fuel_cards SET card_no=?,card_limit=?,assigned_to=?,assigned_id_no=?,notes=?,updated_at=?
       WHERE id=? AND deleted_at IS NULL`,
    )
    .bind(
      input.card_no,
      input.card_limit,
      input.assigned_to,
      input.assigned_id_no,
      input.notes,
      now,
      id,
    )
    .run();
  if (!res.meta.changes) throw new HttpError("Fuel card not found.", 404);
  const row = await db
    .prepare(
      `SELECT id,card_no,card_limit,assigned_to,assigned_id_no,notes,created_at,updated_at
       FROM fleet_fuel_cards WHERE id=?`,
    )
    .bind(id)
    .first<FleetFuelCard>();
  if (!row) throw new HttpError("Fuel card not found.", 404);
  return row;
}

export async function deleteFuelCard(db: D1Database, id: string) {
  const now = new Date().toISOString();
  const res = await db
    .prepare(
      "UPDATE fleet_fuel_cards SET deleted_at=?, updated_at=? WHERE id=? AND deleted_at IS NULL",
    )
    .bind(now, now, id)
    .run();
  if (!res.meta.changes) throw new HttpError("Fuel card not found.", 404);
}

export async function createVehicle(
  db: D1Database,
  input: VehicleInput,
): Promise<FleetVehicle> {
  await checkVehicleDuplicates(db, input);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO fleet_vehicles(
        id,vehicle_name,model,plate_number,fuel_type,owner,monthly_rent_type,monthly_rent,
        driver_name,driver_id_no,project_number,project_location,fuel_card_no,fuel_card_limit,
        phone_number,notes,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      id,
      input.vehicle_name,
      input.model,
      input.plate_number,
      input.fuel_type,
      input.owner,
      input.monthly_rent_type,
      input.monthly_rent,
      input.driver_name,
      input.driver_id_no,
      input.project_number,
      input.project_location,
      input.fuel_card_no,
      input.fuel_card_limit,
      input.phone_number,
      input.notes,
      now,
      now,
    )
    .run();
  return { id, ...input, created_at: now, updated_at: now };
}

export async function updateVehicle(
  db: D1Database,
  id: string,
  input: VehicleInput,
): Promise<FleetVehicle> {
  await checkVehicleDuplicates(db, input, id);
  const now = new Date().toISOString();
  const res = await db
    .prepare(
      `UPDATE fleet_vehicles SET
        vehicle_name=?,model=?,plate_number=?,fuel_type=?,owner=?,monthly_rent_type=?,monthly_rent=?,
        driver_name=?,driver_id_no=?,project_number=?,project_location=?,fuel_card_no=?,fuel_card_limit=?,
        phone_number=?,notes=?,updated_at=?
       WHERE id=? AND deleted_at IS NULL`,
    )
    .bind(
      input.vehicle_name,
      input.model,
      input.plate_number,
      input.fuel_type,
      input.owner,
      input.monthly_rent_type,
      input.monthly_rent,
      input.driver_name,
      input.driver_id_no,
      input.project_number,
      input.project_location,
      input.fuel_card_no,
      input.fuel_card_limit,
      input.phone_number,
      input.notes,
      now,
      id,
    )
    .run();
  if (!res.meta.changes) throw new HttpError("Vehicle not found.", 404);
  const row = await db
    .prepare(
      `SELECT id,vehicle_name,model,plate_number,fuel_type,owner,monthly_rent_type,monthly_rent,driver_name,driver_id_no,project_number,project_location,fuel_card_no,fuel_card_limit,phone_number,notes,created_at,updated_at
       FROM fleet_vehicles WHERE id=?`,
    )
    .bind(id)
    .first<FleetVehicle>();
  if (!row) throw new HttpError("Vehicle not found.", 404);
  return row;
}

export async function deleteVehicle(db: D1Database, id: string) {
  const now = new Date().toISOString();
  const res = await db
    .prepare(
      "UPDATE fleet_vehicles SET deleted_at=?, updated_at=? WHERE id=? AND deleted_at IS NULL",
    )
    .bind(now, now, id)
    .run();
  if (!res.meta.changes) throw new HttpError("Vehicle not found.", 404);
}
