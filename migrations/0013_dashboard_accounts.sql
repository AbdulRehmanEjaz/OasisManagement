ALTER TABLE users ADD COLUMN dashboard TEXT NOT NULL DEFAULT 'survey' CHECK(dashboard IN ('survey','kpi','hr'));
UPDATE users SET pin_fingerprint='survey:'||pin_fingerprint;
CREATE INDEX users_dashboard ON users(dashboard,role,deleted_at);
CREATE TABLE dashboard_setup_lock(dashboard TEXT PRIMARY KEY CHECK(dashboard IN ('survey','kpi','hr')));
INSERT INTO dashboard_setup_lock SELECT 'survey' WHERE EXISTS(SELECT 1 FROM setup_lock);
DROP TRIGGER protect_last_admin;
CREATE TRIGGER protect_last_admin BEFORE UPDATE ON users
WHEN OLD.role='admin' AND OLD.is_active=1 AND OLD.deleted_at IS NULL AND (NEW.role<>'admin' OR NEW.is_active=0 OR NEW.deleted_at IS NOT NULL) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id<>OLD.id AND dashboard=OLD.dashboard AND role='admin' AND is_active=1 AND deleted_at IS NULL) THEN RAISE(ABORT,'Keep at least one active administrator.') END;
END;
CREATE TRIGGER kpi_scope_create BEFORE INSERT ON kpi_daily_reports BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM users WHERE id IN(NEW.supervisor_id,NEW.created_by,NEW.updated_by) AND dashboard<>'kpi') THEN RAISE(ABORT,'FORBIDDEN') END;
END;
CREATE TRIGGER kpi_scope_update BEFORE UPDATE ON kpi_daily_reports BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM users WHERE id IN(NEW.supervisor_id,NEW.created_by,NEW.updated_by) AND dashboard<>'kpi') THEN RAISE(ABORT,'FORBIDDEN') END;
END;
CREATE TRIGGER survey_scope_report BEFORE INSERT ON reports BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.supervisor_id AND dashboard='survey') THEN RAISE(ABORT,'FORBIDDEN') END;
END;
CREATE TRIGGER survey_scope_facility BEFORE INSERT ON facilities BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.creator_id AND dashboard='survey') OR (NEW.assigned_supervisor IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.assigned_supervisor AND dashboard='survey')) THEN RAISE(ABORT,'FORBIDDEN') END;
END;
DELETE FROM sessions;

CREATE TRIGGER reports_dashboard_insert BEFORE INSERT ON reports
WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='survey') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER reports_dashboard_update BEFORE UPDATE ON reports
WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='survey') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER reports_dashboard_delete BEFORE DELETE ON reports
WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='survey') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER facilities_dashboard_insert BEFORE INSERT ON facilities
WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='survey') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER facilities_dashboard_update BEFORE UPDATE ON facilities
WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='survey') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER facilities_dashboard_delete BEFORE DELETE ON facilities
WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='survey') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER photo_uploads_dashboard_insert BEFORE INSERT ON photo_uploads
WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='survey') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER photo_uploads_dashboard_update BEFORE UPDATE ON photo_uploads
WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='survey') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER photo_uploads_dashboard_delete BEFORE DELETE ON photo_uploads
WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='survey') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER location_verifications_dashboard_insert BEFORE INSERT ON location_verifications
WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='survey') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER location_verifications_dashboard_update BEFORE UPDATE ON location_verifications
WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='survey') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER location_verifications_dashboard_delete BEFORE DELETE ON location_verifications
WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='survey') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER options_dashboard_insert BEFORE INSERT ON options
WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='survey') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER options_dashboard_update BEFORE UPDATE ON options
WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='survey') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER options_dashboard_delete BEFORE DELETE ON options
WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='survey') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER app_settings_dashboard_insert BEFORE INSERT ON app_settings
WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='survey') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER app_settings_dashboard_update BEFORE UPDATE ON app_settings
WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='survey') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER app_settings_dashboard_delete BEFORE DELETE ON app_settings
WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='survey') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER notifications_dashboard_insert BEFORE INSERT ON notifications
WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='survey') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER notifications_dashboard_update BEFORE UPDATE ON notifications
WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='survey') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER notifications_dashboard_delete BEFORE DELETE ON notifications
WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='survey') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER delivery_attempts_dashboard_insert BEFORE INSERT ON delivery_attempts
WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='survey') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER delivery_attempts_dashboard_update BEFORE UPDATE ON delivery_attempts
WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='survey') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER delivery_attempts_dashboard_delete BEFORE DELETE ON delivery_attempts
WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='survey') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER kpi_daily_reports_dashboard_insert BEFORE INSERT ON kpi_daily_reports WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='kpi') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER kpi_daily_reports_dashboard_update BEFORE UPDATE ON kpi_daily_reports WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='kpi') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER kpi_form_settings_dashboard_insert BEFORE INSERT ON kpi_form_settings WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='kpi') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER kpi_form_settings_dashboard_update BEFORE UPDATE ON kpi_form_settings WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard='kpi') THEN RAISE(ABORT,'FORBIDDEN') END;
END;

CREATE TRIGGER users_dashboard_update BEFORE UPDATE ON users WHEN EXISTS(SELECT 1 FROM write_guards) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions se ON se.token_hash=g.token_hash JOIN users u ON u.id=se.user_id WHERE u.dashboard=OLD.dashboard AND NEW.dashboard=OLD.dashboard) THEN RAISE(ABORT,'FORBIDDEN') END;
END;

DROP TRIGGER report_commit;
CREATE TRIGGER report_commit AFTER INSERT ON reports BEGIN
 UPDATE sequences SET value=value+1 WHERE kind=NEW.kind;
 UPDATE reports SET number=CASE NEW.kind WHEN 'waste' THEN 'COSA-'||printf('%03d',(SELECT value FROM sequences WHERE kind=NEW.kind)) ELSE 'OFT-'||printf('%03d',(SELECT value FROM sequences WHERE kind=NEW.kind)) END WHERE id=NEW.id;
 INSERT INTO record_photos(id,report_id,url) SELECT id,NEW.id,url FROM photo_uploads WHERE id IN (SELECT value FROM json_each(NEW.photo_ids));
 UPDATE photo_uploads SET used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id IN (SELECT value FROM json_each(NEW.photo_ids));
 UPDATE location_verifications SET used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.location_id;
 INSERT INTO notifications(id,report_type,record_id,recipient_id,message) SELECT lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-8'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))),NEW.kind,NEW.id,id,(SELECT number FROM reports WHERE id=NEW.id)||CASE NEW.source WHEN 'excel' THEN ' imported by ' ELSE ' submitted by ' END||(SELECT full_name FROM users WHERE id=NEW.supervisor_id) FROM users WHERE dashboard='survey' AND role='admin' AND is_active=1 AND deleted_at IS NULL;
 INSERT INTO delivery_attempts(id,record_type,record_id) SELECT lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-8'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))),NEW.kind,NEW.id WHERE NEW.source='field';
END;
