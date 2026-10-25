ALTER TABLE kpi_daily_reports ADD COLUMN dayna_m3 REAL NOT NULL DEFAULT 0 CHECK(dayna_m3>=0);
ALTER TABLE kpi_daily_reports ADD COLUMN truck_m3 REAL NOT NULL DEFAULT 0 CHECK(truck_m3>=0);
