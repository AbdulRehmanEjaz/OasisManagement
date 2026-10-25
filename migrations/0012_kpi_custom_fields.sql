ALTER TABLE kpi_daily_reports ADD COLUMN custom_fields TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(custom_fields) AND json_type(custom_fields)='object');
