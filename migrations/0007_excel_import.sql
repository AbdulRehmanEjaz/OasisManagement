-- Waste starts at COSA-102; Facilities keeps its existing sequence.
ALTER TABLE sequences ADD COLUMN start_value INTEGER NOT NULL DEFAULT 1;
UPDATE sequences SET start_value=102,value=max(value,101) WHERE kind='waste';
DROP TRIGGER IF EXISTS report_compact_after_delete;
PRAGMA defer_foreign_keys = ON;
CREATE TABLE _report_photos_backup AS SELECT * FROM record_photos;
CREATE TABLE _report_deliveries_backup AS SELECT * FROM delivery_attempts;
CREATE TABLE _reports_backup AS SELECT * FROM reports;
DROP TABLE reports;
CREATE TABLE reports (id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('waste','inspection')),number TEXT UNIQUE,supervisor_id TEXT NOT NULL REFERENCES users(id),site TEXT,category TEXT,quantity REAL,unit TEXT,description TEXT NOT NULL DEFAULT '',facility_id TEXT REFERENCES facilities(id),condition TEXT,inspection_date TEXT,location_id TEXT UNIQUE REFERENCES location_verifications(id),latitude REAL NOT NULL,longitude REAL NOT NULL,gps_accuracy_meters REAL NOT NULL,gps_captured_at TEXT NOT NULL,location_confirmed INTEGER NOT NULL DEFAULT 1 CHECK(location_confirmed IN (0,1)),location_confirmed_at TEXT,photo_ids TEXT NOT NULL CHECK(json_valid(photo_ids)),idempotency_key TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),structure_type TEXT CHECK(structure_type IS NULL OR structure_type IN ('Concrete/Blocks Building','Animal Shelters','Metal Structures')),source TEXT NOT NULL DEFAULT 'field' CHECK(source IN ('field','excel')),import_key TEXT UNIQUE,UNIQUE(supervisor_id,idempotency_key),CHECK((source='field' AND location_id IS NOT NULL AND location_confirmed=1 AND location_confirmed_at IS NOT NULL) OR (source='excel' AND location_id IS NULL AND location_confirmed=0)),CHECK(kind<>'waste' OR (category IS NOT NULL AND quantity>0 AND unit IS NOT NULL)),CHECK(source='excel' OR category<>'Other' OR length(trim(description))>0),CHECK(kind<>'inspection' OR (inspection_date IS NOT NULL)));
INSERT INTO reports(id,kind,number,supervisor_id,site,category,quantity,unit,description,facility_id,condition,inspection_date,location_id,latitude,longitude,gps_accuracy_meters,gps_captured_at,location_confirmed,location_confirmed_at,photo_ids,idempotency_key,created_at,structure_type) SELECT id,kind,number,supervisor_id,site,category,quantity,unit,description,facility_id,condition,inspection_date,location_id,latitude,longitude,gps_accuracy_meters,gps_captured_at,location_confirmed,location_confirmed_at,photo_ids,idempotency_key,created_at,structure_type FROM _reports_backup;
INSERT OR IGNORE INTO record_photos SELECT * FROM _report_photos_backup;
INSERT OR IGNORE INTO delivery_attempts SELECT * FROM _report_deliveries_backup;
DROP TABLE _reports_backup;
DROP TABLE _report_photos_backup;
DROP TABLE _report_deliveries_backup;
CREATE INDEX reports_kind_date ON reports(kind,created_at DESC);
CREATE INDEX reports_facility ON reports(facility_id,created_at DESC);
CREATE INDEX reports_supervisor ON reports(supervisor_id,created_at DESC);

CREATE TRIGGER report_validate BEFORE INSERT ON reports WHEN NEW.source='field' BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.supervisor_id AND role IN ('admin','supervisor') AND is_active=1 AND deleted_at IS NULL) THEN RAISE(ABORT,'FORBIDDEN') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM location_verifications l,app_settings s WHERE l.id=NEW.location_id AND l.user_id=NEW.supervisor_id AND l.used_at IS NULL AND l.viewed_at IS NOT NULL AND l.confirmed_at>=l.viewed_at AND julianday(l.captured_at) BETWEEN julianday('now','-5 minutes') AND julianday('now','+10 seconds') AND l.accuracy<=s.gps_accuracy_meters AND l.latitude=NEW.latitude AND l.longitude=NEW.longitude AND l.accuracy=NEW.gps_accuracy_meters AND l.captured_at=NEW.gps_captured_at AND l.confirmed_at=NEW.location_confirmed_at) THEN RAISE(ABORT,'Capture and confirm a recent accurate GPS location.') END;
 SELECT CASE WHEN json_array_length(NEW.photo_ids) NOT BETWEEN 1 AND 3 OR (SELECT count(DISTINCT value) FROM json_each(NEW.photo_ids))<>json_array_length(NEW.photo_ids) OR (SELECT count(*) FROM photo_uploads WHERE id IN (SELECT value FROM json_each(NEW.photo_ids)) AND user_id=NEW.supervisor_id AND used_at IS NULL)<>json_array_length(NEW.photo_ids) THEN RAISE(ABORT,'One to three distinct unused photographs belonging to you are required.') END;
 SELECT CASE WHEN NEW.kind='waste' AND (NOT EXISTS(SELECT 1 FROM options WHERE kind='waste' AND label=NEW.category AND is_active=1) OR NOT EXISTS(SELECT 1 FROM options WHERE kind='unit' AND label=NEW.unit AND is_active=1)) THEN RAISE(ABORT,'Choose active categories, units and statuses.') END;
 SELECT CASE WHEN NEW.kind='inspection' AND NEW.facility_id IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM options WHERE kind='status' AND label=NEW.condition AND is_active=1) OR NOT EXISTS(SELECT 1 FROM facilities f,users u WHERE f.id=NEW.facility_id AND u.id=NEW.supervisor_id AND f.archived_at IS NULL AND (u.role='admin' OR f.assigned_supervisor=u.id))) THEN RAISE(ABORT,'Facility unavailable or not assigned to you.') END;
END;
CREATE TRIGGER report_commit AFTER INSERT ON reports BEGIN
 UPDATE sequences SET value=value+1 WHERE kind=NEW.kind;
 UPDATE reports SET number=CASE NEW.kind WHEN 'waste' THEN 'COSA-'||printf('%03d',(SELECT value FROM sequences WHERE kind=NEW.kind)) ELSE 'OFT-'||printf('%03d',(SELECT value FROM sequences WHERE kind=NEW.kind)) END WHERE id=NEW.id;
 INSERT INTO record_photos(id,report_id,url) SELECT id,NEW.id,url FROM photo_uploads WHERE id IN (SELECT value FROM json_each(NEW.photo_ids));
 UPDATE photo_uploads SET used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id IN (SELECT value FROM json_each(NEW.photo_ids));
 UPDATE location_verifications SET used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.location_id;
 INSERT INTO notifications(id,report_type,record_id,recipient_id,message) SELECT lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-8'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))),NEW.kind,NEW.id,id,(SELECT number FROM reports WHERE id=NEW.id)||CASE NEW.source WHEN 'excel' THEN ' imported by ' ELSE ' submitted by ' END||(SELECT full_name FROM users WHERE id=NEW.supervisor_id) FROM users WHERE role='admin' AND is_active=1 AND deleted_at IS NULL;
 INSERT INTO delivery_attempts(id,record_type,record_id) SELECT lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-8'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))),NEW.kind,NEW.id WHERE NEW.source='field';
END;

CREATE TRIGGER report_compact_after_delete AFTER DELETE ON reports BEGIN
 UPDATE reports SET number='recode-'||CASE kind WHEN 'waste' THEN 'COSA-' ELSE 'OFT-' END||printf('%03d',CAST(substr(number,instr(number,'-')+1) AS INTEGER)-1) WHERE kind=OLD.kind AND CAST(substr(number,instr(number,'-')+1) AS INTEGER)>CAST(substr(OLD.number,instr(OLD.number,'-')+1) AS INTEGER);
 UPDATE reports SET number=substr(number,8) WHERE kind=OLD.kind AND number LIKE 'recode-%';
 UPDATE sequences SET value=start_value-1+(SELECT count(*) FROM reports WHERE kind=OLD.kind) WHERE kind=OLD.kind;
 UPDATE notifications SET message=(SELECT number FROM reports WHERE id=notifications.record_id)||substr(message,instr(message,' ')) WHERE record_id IN (SELECT id FROM reports WHERE kind=OLD.kind);
END;

CREATE TRIGGER report_import_validate BEFORE INSERT ON reports WHEN NEW.source='excel' BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.supervisor_id AND role='admin' AND is_active=1 AND deleted_at IS NULL) THEN RAISE(ABORT,'FORBIDDEN') END;
 SELECT CASE WHEN NEW.import_key IS NULL OR json_array_length(NEW.photo_ids) NOT BETWEEN 1 AND 2 OR (SELECT count(DISTINCT value) FROM json_each(NEW.photo_ids))<>json_array_length(NEW.photo_ids) OR (SELECT count(*) FROM photo_uploads WHERE id IN (SELECT value FROM json_each(NEW.photo_ids)) AND user_id=NEW.supervisor_id AND used_at IS NULL)<>json_array_length(NEW.photo_ids) THEN RAISE(ABORT,'One or two imported photographs are required.') END;
END;
CREATE TRIGGER immutable_report_gps BEFORE UPDATE OF supervisor_id,kind,source,import_key,location_id,latitude,longitude,gps_accuracy_meters,gps_captured_at,location_confirmed_at,photo_ids,idempotency_key ON reports BEGIN SELECT RAISE(ABORT,'Report ownership, source, photos and GPS metadata are immutable.'); END;
CREATE TRIGGER inspection_structure_required BEFORE INSERT ON reports WHEN NEW.kind='inspection' BEGIN
 SELECT CASE WHEN NEW.structure_type IS NULL OR length(trim(coalesce(NEW.site,'')))=0 THEN RAISE(ABORT,'Choose a structure type and enter a site name.') END;
END;

PRAGMA defer_foreign_keys=OFF;
