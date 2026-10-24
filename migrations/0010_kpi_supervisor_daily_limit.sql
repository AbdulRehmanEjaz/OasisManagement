CREATE TRIGGER kpi_supervisor_daily_limit BEFORE INSERT ON kpi_daily_reports
WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.created_by AND role='supervisor')
BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM kpi_daily_reports WHERE project_id=NEW.project_id AND supervisor_id=NEW.supervisor_id AND report_date=NEW.report_date) THEN RAISE(ABORT,'KPI_ALREADY_SUBMITTED') END;
END;
CREATE TRIGGER kpi_supervisor_submission_locked BEFORE UPDATE ON kpi_daily_reports
WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.updated_by AND role='supervisor')
BEGIN SELECT RAISE(ABORT,'KPI_CONTACT_MANAGER'); END;
