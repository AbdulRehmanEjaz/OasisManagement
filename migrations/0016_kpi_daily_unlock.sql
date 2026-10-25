CREATE TABLE kpi_daily_access (
 project_id TEXT NOT NULL CHECK(project_id='advacon-2026-q4'),
 supervisor_id TEXT NOT NULL REFERENCES users(id),
 report_date TEXT NOT NULL CHECK(length(report_date)=10 AND date(report_date,'+0 days')=report_date),
 allowed_reports INTEGER NOT NULL CHECK(allowed_reports>=1),
 unlocked_by TEXT NOT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(project_id,supervisor_id,report_date)
);
CREATE TRIGGER kpi_daily_access_insert BEFORE INSERT ON kpi_daily_access BEGIN
 SELECT CASE WHEN NEW.report_date<>date('now','+3 hours') OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.supervisor_id AND dashboard='kpi' AND role='supervisor' AND is_active=1 AND deleted_at IS NULL) OR NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions s ON s.token_hash=g.token_hash JOIN users u ON u.id=s.user_id WHERE g.role='admin' AND u.id=NEW.unlocked_by AND u.dashboard='kpi' AND u.role='admin' AND u.is_active=1 AND u.deleted_at IS NULL AND s.version=u.version AND s.expires_at>unixepoch()*1000) THEN RAISE(ABORT,'FORBIDDEN') END;
END;
CREATE TRIGGER kpi_daily_access_update BEFORE UPDATE ON kpi_daily_access BEGIN
 SELECT CASE WHEN NEW.project_id<>OLD.project_id OR NEW.supervisor_id<>OLD.supervisor_id OR NEW.report_date<>OLD.report_date OR NEW.report_date<>date('now','+3 hours') OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.supervisor_id AND dashboard='kpi' AND role='supervisor' AND is_active=1 AND deleted_at IS NULL) OR NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions s ON s.token_hash=g.token_hash JOIN users u ON u.id=s.user_id WHERE g.role='admin' AND u.id=NEW.unlocked_by AND u.dashboard='kpi' AND u.role='admin' AND u.is_active=1 AND u.deleted_at IS NULL AND s.version=u.version AND s.expires_at>unixepoch()*1000) THEN RAISE(ABORT,'FORBIDDEN') END;
END;
CREATE TRIGGER kpi_daily_access_delete BEFORE DELETE ON kpi_daily_access BEGIN SELECT RAISE(ABORT,'Daily access history is retained.'); END;
DROP TRIGGER kpi_supervisor_daily_limit;
CREATE TRIGGER kpi_supervisor_daily_limit BEFORE INSERT ON kpi_daily_reports
WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.created_by AND role='supervisor') BEGIN
 SELECT CASE WHEN (SELECT count(*) FROM kpi_daily_reports WHERE project_id=NEW.project_id AND supervisor_id=NEW.supervisor_id AND report_date=NEW.report_date)>=COALESCE((SELECT allowed_reports FROM kpi_daily_access WHERE project_id=NEW.project_id AND supervisor_id=NEW.supervisor_id AND report_date=NEW.report_date),1) THEN RAISE(ABORT,'KPI_ALREADY_SUBMITTED') END;
END;
