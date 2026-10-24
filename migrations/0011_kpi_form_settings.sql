CREATE TABLE kpi_form_settings (
 id TEXT PRIMARY KEY CHECK(id='daily'),
 fields TEXT NOT NULL CHECK(json_valid(fields) AND json_type(fields)='object'),
 updated_by TEXT NOT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL
);
CREATE TRIGGER kpi_settings_insert_admin BEFORE INSERT ON kpi_form_settings BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions s ON s.token_hash=g.token_hash JOIN users u ON u.id=s.user_id WHERE g.role='admin' AND u.role='admin' AND u.id=NEW.updated_by AND u.is_active=1 AND u.deleted_at IS NULL AND s.version=u.version AND s.expires_at>unixepoch()*1000) THEN RAISE(ABORT,'FORBIDDEN') END;
END;
CREATE TRIGGER kpi_settings_update_admin BEFORE UPDATE ON kpi_form_settings BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions s ON s.token_hash=g.token_hash JOIN users u ON u.id=s.user_id WHERE g.role='admin' AND u.role='admin' AND u.id=NEW.updated_by AND u.is_active=1 AND u.deleted_at IS NULL AND s.version=u.version AND s.expires_at>unixepoch()*1000) THEN RAISE(ABORT,'FORBIDDEN') END;
END;
