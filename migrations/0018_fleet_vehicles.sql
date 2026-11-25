CREATE TABLE IF NOT EXISTS fleet_sessions (
  token_hash TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK(role IN ('admin','viewer')),
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS fleet_sessions_expires ON fleet_sessions(expires_at);

CREATE TABLE IF NOT EXISTS fleet_vehicles (
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
);

CREATE INDEX IF NOT EXISTS fleet_vehicles_active ON fleet_vehicles(deleted_at, created_at DESC);
