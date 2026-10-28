import {z} from 'zod';
import {D1Store,HttpError,type Actor,type Data} from './d1-store';
export const surveyKinds=['waste','inspection','palms'] as const;
export async function surveyControls(db:D1Store){return (await db.all('SELECT * FROM survey_report_controls ORDER BY kind')).map(row=>({id:String(row.kind),kind:String(row.kind),submission_enabled:Number(row.submission_enabled),viewer_enabled:Number(row.viewer_enabled)}));}
export async function assertSurveyAccess(db:D1Store,actor:Actor,kind:string,mode:'view'|'submit'){
 if(db.dashboard!=='survey'||actor.dashboard!=='survey')throw new HttpError('FORBIDDEN',403);
 if(actor.role==='admin')return;
 if(mode==='submit'&&actor.role!=='supervisor')throw new HttpError('FORBIDDEN',403);
 if(mode==='view'&&actor.role==='supervisor')return;
 const row=await db.one('SELECT * FROM survey_report_controls WHERE kind=?',kind);
 if(!row||!row[mode==='submit'?'submission_enabled':'viewer_enabled'])throw new HttpError(mode==='submit'?'Report submissions are currently disabled by Admin.':'Viewing this report category is currently disabled by Admin.',403);
}
export async function saveSurveyControl(db:D1Store,actor:Actor,input:Data){
 if(db.dashboard!=='survey'||actor.dashboard!=='survey'||actor.role!=='admin')throw new HttpError('FORBIDDEN',403);
 const p=z.object({kind:z.enum(surveyKinds),submission_enabled:z.boolean(),viewer_enabled:z.boolean()}).parse(input);
 await db.write(actor,'admin',[db.stmt('UPDATE survey_report_controls SET submission_enabled=?,viewer_enabled=? WHERE kind=?',p.submission_enabled,p.viewer_enabled,p.kind),db.audit(actor.id,'survey-controls',p.kind,'ACCESS_CHANGED',p)]);return {saved:true};
}
export async function readPalms(db:D1Store,actor:Actor,q:URLSearchParams){
 await assertSurveyAccess(db,actor,'palms','view');const where=['p.deleted_at IS NULL'],values:unknown[]=[];
 if(actor.role==='supervisor'){where.push('p.supervisor_id=?');values.push(actor.id);}if(q.get('id')){where.push('p.id=?');values.push(z.uuid().parse(q.get('id')));}if(q.get('search')){where.push('(p.number LIKE ? OR p.site LIKE ?)');values.push('%'+q.get('search')+'%','%'+q.get('search')+'%');}
 const map=q.get('map')==='1',page=map?z.coerce.number().int().min(0).max(100000).parse(q.get('page')||0):0;
 const count=map?await db.one('SELECT count(*) n FROM date_palm_reports p WHERE '+where.join(' AND '),...values):null;
 const rows=await db.all("SELECT p.*,u.full_name,(SELECT json_group_array(json_object('url',ph.url)) FROM photo_uploads ph WHERE ph.id IN(SELECT value FROM json_each(p.photo_ids))) photos_json FROM date_palm_reports p JOIN users u ON u.id=p.supervisor_id WHERE "+where.join(' AND ')+" ORDER BY CAST(substr(p.number,5) AS INTEGER)"+(map?" LIMIT 1000 OFFSET ?":""),...values,...(map?[page*1000]:[]));
 const data=[];for(const r of rows){const photos=JSON.parse(r.photos_json||'[]');data.push({id:r.id,number:r.number,kind:'palms',site:r.site,description:r.description,latitude:r.latitude,longitude:r.longitude,gps_accuracy_meters:r.gps_accuracy_meters,gps_captured_at:r.gps_captured_at,created_at:r.created_at,waste_report_photos:photos,...(actor.role!=='viewer'?{supervisor_id:r.supervisor_id,profiles:{full_name:r.full_name}}:{})});}return {data,count:count?.n??data.length};
}
export async function submitPalms(db:D1Store,actor:Actor,input:Data){
 await assertSurveyAccess(db,actor,'palms','submit');const p=z.object({location_id:z.uuid(),idempotency_key:z.uuid(),photo_ids:z.array(z.uuid()).min(1).max(3).refine(v=>new Set(v).size===v.length),site:z.string().trim().max(200).default(''),description:z.string().max(4000).default('')}).parse(input);
 const previous=()=>db.one('SELECT id,number,created_at FROM date_palm_reports WHERE supervisor_id=? AND idempotency_key=?',actor.id,p.idempotency_key);const old=await previous();if(old)return old;
 const loc=await db.one('SELECT * FROM location_verifications WHERE id=? AND user_id=?',p.location_id,actor.id);if(!loc)throw new HttpError('Capture and confirm a recent accurate GPS location.');
 const id=crypto.randomUUID();try{await db.write(actor,'submit',[
 db.stmt("UPDATE sequences SET value=value+1 WHERE kind='palms'"),
 db.stmt("INSERT INTO date_palm_reports(id,number,supervisor_id,site,description,latitude,longitude,gps_accuracy_meters,gps_captured_at,location_id,photo_ids,idempotency_key) VALUES(?,'DPT-'||printf('%03d',(SELECT value FROM sequences WHERE kind='palms')),?,?,?,?,?,?,?,?,?,?)",id,actor.id,p.site,p.description,loc.latitude,loc.longitude,loc.accuracy,loc.captured_at,loc.id,JSON.stringify(p.photo_ids),p.idempotency_key),
 db.stmt("UPDATE photo_uploads SET used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id IN(SELECT value FROM json_each(?))",JSON.stringify(p.photo_ids)),db.stmt("UPDATE location_verifications SET used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",loc.id),db.audit(actor.id,'palms',id,'SUBMITTED')]);}catch(e){const retry=await previous();if(retry)return retry;throw e;}return (await previous())!;
}
export async function changePalms(db:D1Store,actor:Actor,input:Data){
 if(db.dashboard!=='survey'||actor.dashboard!=='survey'||actor.role!=='admin')throw new HttpError('FORBIDDEN',403);const id=z.uuid().parse(input.id);if(!await db.one('SELECT id FROM date_palm_reports WHERE id=? AND deleted_at IS NULL',id))throw new HttpError('Report unavailable.',404);
 if(input.action==='record.delete'){await db.write(actor,'admin',[db.stmt('UPDATE date_palm_reports SET deleted_at=? WHERE id=?',new Date().toISOString(),id),db.stmt("UPDATE date_palm_reports SET number='~'||number WHERE deleted_at IS NULL"),db.stmt("WITH ranked AS(SELECT id,row_number() OVER(ORDER BY CAST(substr(number,6) AS INTEGER),created_at,id) n FROM date_palm_reports WHERE deleted_at IS NULL) UPDATE date_palm_reports SET number='DPT-'||printf('%03d',(SELECT n FROM ranked WHERE ranked.id=date_palm_reports.id)) WHERE deleted_at IS NULL"),db.stmt("UPDATE sequences SET value=(SELECT count(*) FROM date_palm_reports WHERE deleted_at IS NULL) WHERE kind='palms'"),db.audit(actor.id,'palms',id,'DELETED')]);}
 else{const p=z.object({site:z.string().trim().max(200),description:z.string().max(4000),latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)}).parse(input.patch);await db.write(actor,'admin',[db.stmt('UPDATE date_palm_reports SET site=?,description=?,latitude=?,longitude=? WHERE id=?',p.site,p.description,p.latitude,p.longitude,id),db.audit(actor.id,'palms',id,'UPDATED',p)]);}return {saved:true};
}
