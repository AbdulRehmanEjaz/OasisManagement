ALTER TABLE kpi_daily_reports ADD COLUMN import_key TEXT;
ALTER TABLE kpi_daily_reports ADD COLUMN import_metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(import_metadata) AND json_type(import_metadata)='object');
CREATE UNIQUE INDEX kpi_import_key ON kpi_daily_reports(import_key) WHERE import_key IS NOT NULL;
ALTER TABLE kpi_daily_reports ADD COLUMN import_identity TEXT;
CREATE UNIQUE INDEX kpi_import_identity ON kpi_daily_reports(import_identity) WHERE import_identity IS NOT NULL;
