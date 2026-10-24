-- Keep original GPS capture evidence immutable; record Admin corrections separately.
ALTER TABLE reports ADD COLUMN admin_latitude REAL CHECK(admin_latitude IS NULL OR admin_latitude BETWEEN -90 AND 90);
ALTER TABLE reports ADD COLUMN admin_longitude REAL CHECK(admin_longitude IS NULL OR admin_longitude BETWEEN -180 AND 180);
ALTER TABLE reports ADD COLUMN location_edited_at TEXT;
ALTER TABLE reports ADD COLUMN location_edited_by TEXT REFERENCES users(id);
CREATE TRIGGER authorize_report_location_edit BEFORE UPDATE OF admin_latitude,admin_longitude,location_edited_at,location_edited_by ON reports BEGIN
 SELECT CASE WHEN NEW.admin_latitude IS NULL OR NEW.admin_longitude IS NULL OR NEW.location_edited_at IS NULL OR NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions s ON s.token_hash=g.token_hash JOIN users u ON u.id=s.user_id WHERE g.role='admin' AND u.role='admin' AND u.id=NEW.location_edited_by AND u.is_active=1 AND u.deleted_at IS NULL AND u.version=s.version AND s.expires_at>unixepoch()*1000) THEN RAISE(ABORT,'FORBIDDEN') END;
END;
