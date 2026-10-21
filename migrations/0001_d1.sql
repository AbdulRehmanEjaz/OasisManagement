PRAGMA foreign_keys = ON;
CREATE TABLE users (
 id TEXT PRIMARY KEY, full_name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','viewer','supervisor')),
 pin_hash TEXT NOT NULL, pin_fingerprint TEXT NOT NULL UNIQUE, is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE setup_lock (id INTEGER PRIMARY KEY CHECK(id=1));
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), version INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE write_guards (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, role TEXT NOT NULL);
CREATE TRIGGER validate_write_guard BEFORE INSERT ON write_guards BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id
 WHERE s.token_hash=NEW.token_hash AND s.version=u.version AND s.expires_at>unixepoch()*1000
 AND u.is_active=1 AND u.deleted_at IS NULL AND (NEW.role='any' OR u.role=NEW.role OR (NEW.role='submit' AND u.role IN ('admin','supervisor'))))
 THEN RAISE(ABORT,'UNAUTHORIZED') END;
END;
CREATE TRIGGER revoke_user_sessions AFTER UPDATE OF version,is_active,deleted_at ON users BEGIN
 DELETE FROM sessions WHERE user_id=NEW.id;
END;
CREATE TRIGGER protect_last_admin BEFORE UPDATE ON users
 WHEN OLD.role='admin' AND OLD.is_active=1 AND OLD.deleted_at IS NULL
 AND (NEW.role<>'admin' OR NEW.is_active=0 OR NEW.deleted_at IS NOT NULL) BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM users WHERE id<>OLD.id AND role='admin' AND is_active=1 AND deleted_at IS NULL)
 THEN RAISE(ABORT,'Keep at least one active administrator.') END;
END;
CREATE TABLE app_settings (id INTEGER PRIMARY KEY CHECK(id=1), gps_accuracy_meters REAL NOT NULL DEFAULT 20 CHECK(gps_accuracy_meters>0));
INSERT INTO app_settings(id) VALUES(1);
CREATE TABLE options (id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('waste','unit','facility','status')),label TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),UNIQUE(kind,label));
CREATE TABLE sequences (kind TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0);
INSERT INTO sequences(kind) VALUES('waste'),('inspection'),('facility');
CREATE TABLE location_verifications (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),latitude REAL NOT NULL CHECK(latitude BETWEEN -90 AND 90),longitude REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180),accuracy REAL NOT NULL CHECK(accuracy>0),captured_at TEXT NOT NULL,viewed_at TEXT,confirmed_at TEXT,used_at TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE INDEX location_owner ON location_verifications(user_id,created_at);
CREATE TABLE photo_uploads (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),url TEXT NOT NULL CHECK(url LIKE 'https://i.ibb.co/%'),used_at TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE facilities (id TEXT PRIMARY KEY,number TEXT UNIQUE,name TEXT NOT NULL,category TEXT NOT NULL,site TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',status TEXT NOT NULL,latitude REAL NOT NULL CHECK(latitude BETWEEN -90 AND 90),longitude REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180),assigned_supervisor TEXT REFERENCES users(id),remarks TEXT NOT NULL DEFAULT '',archived_at TEXT,photo_ids TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(photo_ids)),creator_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE INDEX facilities_assignee ON facilities(assigned_supervisor,archived_at);
CREATE TABLE reports (id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('waste','inspection')),number TEXT UNIQUE,supervisor_id TEXT NOT NULL REFERENCES users(id),site TEXT,category TEXT,quantity REAL,unit TEXT,description TEXT NOT NULL DEFAULT '',facility_id TEXT REFERENCES facilities(id),condition TEXT,inspection_date TEXT,location_id TEXT NOT NULL UNIQUE REFERENCES location_verifications(id),latitude REAL NOT NULL,longitude REAL NOT NULL,gps_accuracy_meters REAL NOT NULL,gps_captured_at TEXT NOT NULL,location_confirmed INTEGER NOT NULL DEFAULT 1 CHECK(location_confirmed=1),location_confirmed_at TEXT NOT NULL,photo_ids TEXT NOT NULL CHECK(json_valid(photo_ids)),idempotency_key TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),UNIQUE(supervisor_id,idempotency_key),CHECK(kind<>'waste' OR (length(trim(site))>0 AND category IS NOT NULL AND quantity>0 AND unit IS NOT NULL)),CHECK(category<>'Other' OR length(trim(description))>0),CHECK(kind<>'inspection' OR (facility_id IS NOT NULL AND condition IS NOT NULL AND inspection_date IS NOT NULL AND length(trim(description))>0)));
CREATE INDEX reports_kind_date ON reports(kind,created_at DESC);
CREATE INDEX reports_facility ON reports(facility_id,created_at DESC);
CREATE INDEX reports_supervisor ON reports(supervisor_id,created_at DESC);
CREATE TABLE record_photos (id TEXT PRIMARY KEY REFERENCES photo_uploads(id),report_id TEXT REFERENCES reports(id) ON DELETE CASCADE,facility_id TEXT REFERENCES facilities(id),url TEXT NOT NULL, CHECK((report_id IS NOT NULL)+(facility_id IS NOT NULL)=1));
CREATE INDEX photos_report ON record_photos(report_id);
CREATE INDEX photos_facility ON record_photos(facility_id);
CREATE TABLE notifications (id TEXT PRIMARY KEY,report_type TEXT NOT NULL,record_id TEXT NOT NULL,recipient_id TEXT NOT NULL REFERENCES users(id),message TEXT NOT NULL,is_read INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE INDEX notification_recipient ON notifications(recipient_id,created_at DESC);
CREATE TABLE delivery_attempts (id TEXT PRIMARY KEY,record_type TEXT NOT NULL,record_id TEXT NOT NULL UNIQUE REFERENCES reports(id) ON DELETE CASCADE,channel TEXT NOT NULL DEFAULT 'email',recipient TEXT NOT NULL DEFAULT 'pending configuration',provider_message_id TEXT,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','delivered','failed')),attempts INTEGER NOT NULL DEFAULT 0,claim_token TEXT,claimed_at TEXT,last_error TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE audit_logs (id TEXT PRIMARY KEY,record_type TEXT NOT NULL,record_id TEXT NOT NULL,actor_id TEXT REFERENCES users(id),action TEXT NOT NULL,change_summary TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE INDEX audit_record ON audit_logs(record_id,created_at DESC);
CREATE TRIGGER report_validate BEFORE INSERT ON reports BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.supervisor_id AND role IN ('admin','supervisor') AND is_active=1 AND deleted_at IS NULL) THEN RAISE(ABORT,'FORBIDDEN') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM location_verifications l,app_settings s WHERE l.id=NEW.location_id AND l.user_id=NEW.supervisor_id AND l.used_at IS NULL AND l.viewed_at IS NOT NULL AND l.confirmed_at>=l.viewed_at AND julianday(l.captured_at) BETWEEN julianday('now','-5 minutes') AND julianday('now','+10 seconds') AND l.accuracy<=s.gps_accuracy_meters AND l.latitude=NEW.latitude AND l.longitude=NEW.longitude AND l.accuracy=NEW.gps_accuracy_meters AND l.captured_at=NEW.gps_captured_at AND l.confirmed_at=NEW.location_confirmed_at) THEN RAISE(ABORT,'Capture and confirm a recent accurate GPS location.') END;
 SELECT CASE WHEN json_array_length(NEW.photo_ids) NOT BETWEEN 2 AND 3 OR (SELECT count(DISTINCT value) FROM json_each(NEW.photo_ids))<>json_array_length(NEW.photo_ids) OR (SELECT count(*) FROM photo_uploads WHERE id IN (SELECT value FROM json_each(NEW.photo_ids)) AND user_id=NEW.supervisor_id AND used_at IS NULL)<>json_array_length(NEW.photo_ids) THEN RAISE(ABORT,'Two or three distinct unused photographs belonging to you are required.') END;
 SELECT CASE WHEN NEW.kind='waste' AND (NOT EXISTS(SELECT 1 FROM options WHERE kind='waste' AND label=NEW.category AND is_active=1) OR NOT EXISTS(SELECT 1 FROM options WHERE kind='unit' AND label=NEW.unit AND is_active=1)) THEN RAISE(ABORT,'Choose active categories, units and statuses.') END;
 SELECT CASE WHEN NEW.kind='inspection' AND (NOT EXISTS(SELECT 1 FROM options WHERE kind='status' AND label=NEW.condition AND is_active=1) OR NOT EXISTS(SELECT 1 FROM facilities f,users u WHERE f.id=NEW.facility_id AND u.id=NEW.supervisor_id AND f.archived_at IS NULL AND (u.role='admin' OR f.assigned_supervisor=u.id))) THEN RAISE(ABORT,'Facility unavailable or not assigned to you.') END;
END;
CREATE TRIGGER report_commit AFTER INSERT ON reports BEGIN
 UPDATE sequences SET value=value+1 WHERE kind=NEW.kind;
 UPDATE reports SET number=CASE NEW.kind WHEN 'waste' THEN 'COSA-'||printf('%04d',(SELECT value FROM sequences WHERE kind=NEW.kind)) ELSE 'OFT-I-'||printf('%06d',(SELECT value FROM sequences WHERE kind=NEW.kind)) END WHERE id=NEW.id;
 INSERT INTO record_photos(id,report_id,url) SELECT id,NEW.id,url FROM photo_uploads WHERE id IN (SELECT value FROM json_each(NEW.photo_ids));
 UPDATE photo_uploads SET used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id IN (SELECT value FROM json_each(NEW.photo_ids));
 UPDATE location_verifications SET used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.location_id;
 INSERT INTO notifications(id,report_type,record_id,recipient_id,message) SELECT lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-8'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))),NEW.kind,NEW.id,id,(SELECT number FROM reports WHERE id=NEW.id)||' submitted by '||(SELECT full_name FROM users WHERE id=NEW.supervisor_id) FROM users WHERE role='admin' AND is_active=1 AND deleted_at IS NULL;
 INSERT INTO delivery_attempts(id,record_type,record_id) VALUES(lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-8'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))),NEW.kind,NEW.id);
END;
CREATE TRIGGER immutable_report_gps BEFORE UPDATE OF supervisor_id,kind,location_id,latitude,longitude,gps_accuracy_meters,gps_captured_at,location_confirmed_at,photo_ids,idempotency_key ON reports BEGIN SELECT RAISE(ABORT,'Report ownership, photos and GPS metadata are immutable.'); END;
CREATE TRIGGER facility_validate BEFORE INSERT ON facilities BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.creator_id AND role='admin' AND is_active=1 AND deleted_at IS NULL) THEN RAISE(ABORT,'FORBIDDEN') END;
 SELECT CASE WHEN NEW.assigned_supervisor IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.assigned_supervisor AND role='supervisor' AND is_active=1 AND deleted_at IS NULL) THEN RAISE(ABORT,'Choose an active supervisor.') END;
 SELECT CASE WHEN json_array_length(NEW.photo_ids)>3 OR (SELECT count(DISTINCT value) FROM json_each(NEW.photo_ids))<>json_array_length(NEW.photo_ids) OR (SELECT count(*) FROM photo_uploads WHERE id IN(SELECT value FROM json_each(NEW.photo_ids)) AND user_id=NEW.creator_id AND used_at IS NULL)<>json_array_length(NEW.photo_ids) THEN RAISE(ABORT,'Photographs must belong to you and be unused.') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM options WHERE kind='facility' AND label=NEW.category AND is_active=1) OR NOT EXISTS(SELECT 1 FROM options WHERE kind='status' AND label=NEW.status AND is_active=1) THEN RAISE(ABORT,'Choose active categories, units and statuses.') END;
END;
CREATE TRIGGER facility_commit AFTER INSERT ON facilities BEGIN
 UPDATE sequences SET value=value+1 WHERE kind='facility';
 UPDATE facilities SET number='OFT-'||printf('%06d',(SELECT value FROM sequences WHERE kind='facility')) WHERE id=NEW.id;
 INSERT INTO record_photos(id,facility_id,url) SELECT id,NEW.id,url FROM photo_uploads WHERE id IN(SELECT value FROM json_each(NEW.photo_ids));
 UPDATE photo_uploads SET used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id IN(SELECT value FROM json_each(NEW.photo_ids));
END;

INSERT INTO options(id,kind,label) VALUES('34fa4a12-8cc4-42b6-b7fd-79f60f463ea4','waste','Palm Waste');
INSERT INTO options(id,kind,label) VALUES('8a0f3e56-f00a-4541-8812-2c53e433399b','waste','Tree Branches');
INSERT INTO options(id,kind,label) VALUES('92507f26-37e5-4968-9ec8-e827d5dd8c01','waste','Pruning Waste');
INSERT INTO options(id,kind,label) VALUES('5e92f787-7530-476a-88a5-9df4ff177e91','waste','Dry Leaves');
INSERT INTO options(id,kind,label) VALUES('af692121-07d9-4a45-9c35-ef0ed1c08420','waste','Grass and Weeds');
INSERT INTO options(id,kind,label) VALUES('258082ed-2560-41eb-b4c1-b3c2f042b0fd','waste','Mixed Agricultural Waste');
INSERT INTO options(id,kind,label) VALUES('9e6224ec-a4ac-435b-9e14-100dcfc9af3d','waste','Other');
INSERT INTO options(id,kind,label) VALUES('8686a488-eb9a-4a05-b8fe-6c310e721f60','unit','Kilograms (kg)');
INSERT INTO options(id,kind,label) VALUES('ecfb1a8f-7106-4eaa-b08d-bfb4b955152c','unit','Tonnes');
INSERT INTO options(id,kind,label) VALUES('b38d110a-0bbd-46ce-abc3-f4d29ba9c8d1','unit','Cubic Meters (m³)');
INSERT INTO options(id,kind,label) VALUES('10af9551-6738-4eaf-8084-c6336f8792f5','unit','Bags');
INSERT INTO options(id,kind,label) VALUES('ac778b49-f16b-4591-a681-4bf7ed6083cf','unit','Piles');
INSERT INTO options(id,kind,label) VALUES('70c5ee84-4532-483d-b44d-29e7f6873166','status','Operational');
INSERT INTO options(id,kind,label) VALUES('ef423561-98ee-422a-84e0-680d6bbfbe80','status','Needs Attention');
INSERT INTO options(id,kind,label) VALUES('2dd7e392-f233-4e26-b1ed-364e989d093c','status','Under Maintenance');
INSERT INTO options(id,kind,label) VALUES('f62f2845-379a-41f1-a25b-c83d41d6847d','status','Out of Service');
INSERT INTO options(id,kind,label) VALUES('5b648b25-1c6b-46ec-9264-a2e7e651ac59','facility','Office / Site Cabin');
INSERT INTO options(id,kind,label) VALUES('338e4570-a1e8-4135-bf46-4633d7dac958','facility','Worker Accommodation');
INSERT INTO options(id,kind,label) VALUES('fcde626e-db27-4554-870d-edf6ce35dfd2','facility','Toilets / Washrooms');
INSERT INTO options(id,kind,label) VALUES('8e5642b0-f186-4cfa-b378-016cfb4263a2','facility','Storage');
INSERT INTO options(id,kind,label) VALUES('0ddfe7e8-1982-424f-a9da-9649f31d45b0','facility','Water Supply Facility');
INSERT INTO options(id,kind,label) VALUES('e7c29b70-3429-459b-a717-b65b323dd3fe','facility','Electrical / Generator Facility');
INSERT INTO options(id,kind,label) VALUES('99aa472b-bf84-4c8f-96dc-7a8dc1d4a815','facility','Waste Collection Facility');
INSERT INTO options(id,kind,label) VALUES('8309bb26-22c5-4272-a4f4-033af275079a','facility','Other');
