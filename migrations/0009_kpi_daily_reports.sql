CREATE TABLE kpi_daily_reports (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL CHECK(project_id='advacon-2026-q4'),
 supervisor_id TEXT NOT NULL REFERENCES users(id),
 report_date TEXT NOT NULL CHECK(report_date BETWEEN '2026-10-01' AND '2026-12-31' AND length(report_date)=10 AND date(report_date,'+0 days')=report_date),
 location TEXT NOT NULL CHECK(length(trim(location)) BETWEEN 1 AND 200),
 metrics TEXT NOT NULL CHECK(json_valid(metrics) AND json_type(metrics)='object'),
 notes TEXT NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
 created_by TEXT NOT NULL REFERENCES users(id),
 updated_by TEXT NOT NULL REFERENCES users(id),
 idempotency_key TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 deleted_at TEXT,
 UNIQUE(created_by,idempotency_key)
);
CREATE INDEX kpi_project_date ON kpi_daily_reports(project_id,report_date,deleted_at);
CREATE INDEX kpi_supervisor ON kpi_daily_reports(supervisor_id,deleted_at,id);
CREATE TRIGGER kpi_create_authorization BEFORE INSERT ON kpi_daily_reports BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions s ON s.token_hash=g.token_hash JOIN users u ON u.id=s.user_id WHERE g.role IN ('admin','submit') AND u.id=NEW.created_by AND u.id=NEW.updated_by AND u.is_active=1 AND u.deleted_at IS NULL AND s.version=u.version AND s.expires_at>unixepoch()*1000 AND (u.role='admin' OR (u.role='supervisor' AND NEW.supervisor_id=u.id AND NEW.report_date=date('now','+3 hours')))) THEN RAISE(ABORT,'FORBIDDEN') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.supervisor_id AND role IN ('admin','supervisor') AND is_active=1 AND deleted_at IS NULL) THEN RAISE(ABORT,'FORBIDDEN') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.metrics) WHERE type NOT IN ('integer','real') OR value<0 OR value>1000000000) THEN RAISE(ABORT,'Invalid activity quantities.') END;
END;
CREATE TRIGGER kpi_update_authorization BEFORE UPDATE ON kpi_daily_reports BEGIN
 SELECT CASE WHEN NEW.id<>OLD.id OR NEW.project_id<>OLD.project_id OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NEW.idempotency_key<>OLD.idempotency_key THEN RAISE(ABORT,'Report identity and creation evidence are immutable.') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards g JOIN sessions s ON s.token_hash=g.token_hash JOIN users u ON u.id=s.user_id WHERE g.role IN ('admin','submit') AND u.id=NEW.updated_by AND u.is_active=1 AND u.deleted_at IS NULL AND s.version=u.version AND s.expires_at>unixepoch()*1000 AND (u.role='admin' OR (u.role='supervisor' AND OLD.supervisor_id=u.id AND NEW.supervisor_id=OLD.supervisor_id AND NEW.report_date=OLD.report_date AND NEW.deleted_at IS OLD.deleted_at))) THEN RAISE(ABORT,'FORBIDDEN') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.metrics) WHERE type NOT IN ('integer','real') OR value<0 OR value>1000000000) THEN RAISE(ABORT,'Invalid activity quantities.') END;
END;
CREATE TRIGGER kpi_no_hard_delete BEFORE DELETE ON kpi_daily_reports BEGIN SELECT RAISE(ABORT,'Use audited soft deletion for KPI reports.'); END;
