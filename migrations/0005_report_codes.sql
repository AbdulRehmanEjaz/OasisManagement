-- Preserve report IDs and photo associations while assigning chronological codes.
CREATE TABLE _report_codes AS SELECT id,number old_number,CASE kind WHEN 'waste' THEN 'COSA-' ELSE 'OFT-' END || printf('%03d',row_number() OVER(PARTITION BY kind ORDER BY created_at,id)) new_number FROM reports;
UPDATE reports SET number='migration-'||id;
UPDATE reports SET number=(SELECT new_number FROM _report_codes WHERE id=reports.id);
UPDATE notifications SET message=replace(message,(SELECT old_number FROM _report_codes WHERE id=notifications.record_id),(SELECT new_number FROM _report_codes WHERE id=notifications.record_id)) WHERE record_id IN (SELECT id FROM _report_codes WHERE old_number IS NOT NULL);
UPDATE sequences SET value=(SELECT count(*) FROM reports WHERE reports.kind=sequences.kind) WHERE kind IN ('waste','inspection');
DROP TABLE _report_codes;
DROP TRIGGER report_commit;
CREATE TRIGGER report_commit AFTER INSERT ON reports BEGIN
 UPDATE sequences SET value=value+1 WHERE kind=NEW.kind;
 UPDATE reports SET number=CASE NEW.kind WHEN 'waste' THEN 'COSA-'||printf('%03d',(SELECT value FROM sequences WHERE kind=NEW.kind)) ELSE 'OFT-'||printf('%03d',(SELECT value FROM sequences WHERE kind=NEW.kind)) END WHERE id=NEW.id;
 INSERT INTO record_photos(id,report_id,url) SELECT id,NEW.id,url FROM photo_uploads WHERE id IN (SELECT value FROM json_each(NEW.photo_ids));
 UPDATE photo_uploads SET used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id IN (SELECT value FROM json_each(NEW.photo_ids));
 UPDATE location_verifications SET used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.location_id;
 INSERT INTO notifications(id,report_type,record_id,recipient_id,message) SELECT lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-8'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))),NEW.kind,NEW.id,id,(SELECT number FROM reports WHERE id=NEW.id)||' submitted by '||(SELECT full_name FROM users WHERE id=NEW.supervisor_id) FROM users WHERE role='admin' AND is_active=1 AND deleted_at IS NULL;
 INSERT INTO delivery_attempts(id,record_type,record_id) VALUES(lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-8'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))),NEW.kind,NEW.id);
END;
