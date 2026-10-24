import {z} from 'zod';
import {D1Store,HttpError,type Actor,type Data} from '../d1-store';
import {PROJECT,ACTIVITY_FIELDS,type DailyKpiReport} from './config';
import {saudiDate} from './calculations';
const metricsSchema=z.object(Object.fromEntries(ACTIVITY_FIELDS.map(f=>[f.key,f.integer?z.number().int().min(0).max(1000000000).default(0):z.number().min(0).max(1000000000).default(0)]))).strict().refine(v=>v.date_palm_pruning<=v.tree_pruning,{message:'Date Palm Pruning is a breakdown of Pruning of Trees (all trees), and cannot exceed that total.'});
export const kpiEntrySchema=z.object({report_date:z.iso.date().refine(d=>d>=PROJECT.start&&d<=PROJECT.end,'Report date must be within 01 Oct–31 Dec 2026.'),location:z.string().trim().min(1).max(200),notes:z.string().max(4000).default(''),metrics:metricsSchema,supervisor_id:z.uuid().optional()});
export async function readKpiReports(db:D1Store,actor:Actor,cursor=''){
 const rows=await db.all(`SELECT r.*,u.full_name supervisor_name FROM kpi_daily_reports r JOIN users u ON u.id=r.supervisor_id WHERE r.project_id=? AND r.deleted_at IS NULL AND r.id>?${actor.role==='supervisor'?' AND r.supervisor_id=?':''} ORDER BY r.id LIMIT 251`,PROJECT.id,cursor,...(actor.role==='supervisor'?[actor.id]:[]));
 const more=rows.length>250,selected=rows.slice(0,250);
 const reports=selected.map(row=>{
  const result:Data={...JSON.parse(row.metrics),id:row.id,project_id:row.project_id,report_date:row.report_date,location:row.location,notes:row.notes,created_at:row.created_at,updated_at:row.updated_at};
  if(actor.role!=='viewer'){result.supervisor_id=row.supervisor_id;result.supervisor_name=row.supervisor_name;}
  return result as DailyKpiReport;
 });
 return {reports,nextCursor:more?selected[selected.length-1].id:null};
}
export async function createKpiReport(db:D1Store,actor:Actor,input:unknown,now=new Date()){
 if(!['admin','supervisor'].includes(actor.role))throw new HttpError('FORBIDDEN',403);
 const raw=z.object({idempotency_key:z.uuid(),entry:kpiEntrySchema}).parse(input),p=raw.entry;
 if(actor.role!=='admin'&&(p.report_date!==saudiDate(now)||(p.supervisor_id&&p.supervisor_id!==actor.id)))throw new HttpError('Supervisors must report today under their own name.',403);
 const supervisor=p.supervisor_id||actor.id;
 if(!await db.one("SELECT id FROM users WHERE id=? AND role IN ('admin','supervisor') AND is_active=1 AND deleted_at IS NULL",supervisor))throw new HttpError('Choose an active reporting supervisor.');
 const existing=await db.one('SELECT id FROM kpi_daily_reports WHERE created_by=? AND idempotency_key=?',actor.id,raw.idempotency_key);if(existing)return {id:existing.id};
 const id=crypto.randomUUID();
 try{await db.write(actor,actor.role==='admin'?'admin':'submit',[
  db.stmt('INSERT INTO kpi_daily_reports(id,project_id,supervisor_id,report_date,location,metrics,notes,created_by,updated_by,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,?)',id,PROJECT.id,supervisor,p.report_date,p.location,JSON.stringify(p.metrics),p.notes,actor.id,actor.id,raw.idempotency_key),
  db.audit(actor.id,'kpi',id,'KPI_CREATED',{date:p.report_date,supervisor_id:supervisor}),
 ]);}catch(e){const saved=await db.one('SELECT id FROM kpi_daily_reports WHERE created_by=? AND idempotency_key=?',actor.id,raw.idempotency_key);if(saved)return {id:saved.id};throw e;}
 return {id};
}
export async function updateKpiReport(db:D1Store,actor:Actor,input:unknown){
 if(!['admin','supervisor'].includes(actor.role))throw new HttpError('FORBIDDEN',403);
 const raw=z.object({id:z.uuid(),entry:kpiEntrySchema}).parse(input),p=raw.entry;
 const old=await db.one('SELECT * FROM kpi_daily_reports WHERE id=? AND project_id=? AND deleted_at IS NULL',raw.id,PROJECT.id);
 if(!old)throw new HttpError('Report unavailable.',404);
 const supervisor=p.supervisor_id||old.supervisor_id;
 if(actor.role!=='admin'&&(old.supervisor_id!==actor.id||supervisor!==old.supervisor_id||p.report_date!==old.report_date))throw new HttpError('FORBIDDEN',403);
 if(supervisor!==old.supervisor_id&&!await db.one("SELECT id FROM users WHERE id=? AND role IN ('admin','supervisor') AND is_active=1 AND deleted_at IS NULL",supervisor))throw new HttpError('Choose an active reporting supervisor.');
 await db.write(actor,actor.role==='admin'?'admin':'submit',[
  db.stmt('UPDATE kpi_daily_reports SET supervisor_id=?,report_date=?,location=?,metrics=?,notes=?,updated_by=?,updated_at=? WHERE id=?',supervisor,p.report_date,p.location,JSON.stringify(p.metrics),p.notes,actor.id,new Date().toISOString(),raw.id),
  db.audit(actor.id,'kpi',raw.id,'KPI_UPDATED',{old:{date:old.report_date,location:old.location,metrics:JSON.parse(old.metrics)},new:{date:p.report_date,location:p.location,metrics:p.metrics}}),
 ]);return {id:raw.id};
}
export async function deleteKpiReport(db:D1Store,actor:Actor,id:string){
 if(actor.role!=='admin')throw new HttpError('FORBIDDEN',403);z.uuid().parse(id);
 const old=await db.one('SELECT id FROM kpi_daily_reports WHERE id=? AND project_id=? AND deleted_at IS NULL',id,PROJECT.id);if(!old)throw new HttpError('Report unavailable.',404);
 const now=new Date().toISOString();await db.write(actor,'admin',[db.stmt('UPDATE kpi_daily_reports SET deleted_at=?,updated_at=?,updated_by=? WHERE id=?',now,now,actor.id,id),db.audit(actor.id,'kpi',id,'KPI_DELETED')]);return {id};
}
