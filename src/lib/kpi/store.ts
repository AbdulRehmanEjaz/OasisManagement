import {z} from 'zod';
import {D1Store,HttpError,type Actor,type Data} from '../d1-store';
import {PROJECT,ACTIVITY_FIELDS,type DailyKpiReport} from './config';
import {saudiDate} from './calculations';
const metricsSchema=z.object(Object.fromEntries(ACTIVITY_FIELDS.map(f=>[f.key,f.integer?z.number().int().min(0).max(1000000000).default(0):z.number().min(0).max(1000000000).default(0)]))).strict();
export const kpiEntrySchema=z.object({report_date:z.iso.date().refine(d=>d>=PROJECT.start&&d<=PROJECT.end,'Report date must be within 01 Oct–31 Dec 2026.'),location:z.string().trim().max(200).default(''),notes:z.string().max(4000).default(''),custom_fields:z.record(z.string().regex(/^custom_[a-zA-Z0-9_-]{1,64}$/),z.string().max(2000)).default({}),metrics:metricsSchema,supervisor_id:z.uuid().optional()});
export async function readKpiReports(db:D1Store,actor:Actor,cursor=''){
 const rows=await db.all(`SELECT r.*,u.full_name supervisor_name FROM kpi_daily_reports r JOIN users u ON u.id=r.supervisor_id WHERE r.project_id=? AND r.deleted_at IS NULL AND r.id>?${actor.role==='supervisor'?' AND r.supervisor_id=?':''} ORDER BY r.id LIMIT 251`,PROJECT.id,cursor,...(actor.role==='supervisor'?[actor.id]:[]));
 const more=rows.length>250,selected=rows.slice(0,250);
 const reports=selected.map(row=>{
  const result:Data={...JSON.parse(row.metrics),id:row.id,project_id:row.project_id,report_date:row.report_date,location:row.location,notes:row.notes,custom_fields:JSON.parse(row.custom_fields||'{}'),created_at:row.created_at,updated_at:row.updated_at};
  if(actor.role!=='viewer'){result.supervisor_id=row.supervisor_id;result.supervisor_name=row.supervisor_name;}
  return result as DailyKpiReport;
 });
 const submittedToday=actor.role==='supervisor'&&!!await db.one('SELECT id FROM kpi_daily_reports WHERE project_id=? AND supervisor_id=? AND report_date=?',PROJECT.id,actor.id,saudiDate());
 const settings=await db.one("SELECT fields FROM kpi_form_settings WHERE id='daily'");
 return {reports,submittedToday,formSettings:settings?JSON.parse(settings.fields):{},nextCursor:more?selected[selected.length-1].id:null};
}
export async function createKpiReport(db:D1Store,actor:Actor,input:unknown,now=new Date()){
 if(!['admin','supervisor'].includes(actor.role))throw new HttpError('FORBIDDEN',403);
 const raw=z.object({idempotency_key:z.uuid(),entry:kpiEntrySchema}).parse(input),p=raw.entry;
 if(actor.role!=='admin'&&(p.report_date!==saudiDate(now)||(p.supervisor_id&&p.supervisor_id!==actor.id)))throw new HttpError('Supervisors must report today under their own name.',403);
 const supervisor=p.supervisor_id||actor.id;
 if(!await db.one("SELECT id FROM users WHERE id=? AND role IN ('admin','supervisor') AND is_active=1 AND deleted_at IS NULL",supervisor))throw new HttpError('Choose an active reporting supervisor.');
 const existing=await db.one('SELECT id FROM kpi_daily_reports WHERE created_by=? AND idempotency_key=?',actor.id,raw.idempotency_key);if(existing)return {id:existing.id};
 if(actor.role==='supervisor'&&await db.one('SELECT id FROM kpi_daily_reports WHERE project_id=? AND supervisor_id=? AND report_date=?',PROJECT.id,supervisor,p.report_date))throw new HttpError('You have already submitted, please contact your Manager.',409);
 await validateForm(db,p);
 const id=crypto.randomUUID();
 try{await db.write(actor,actor.role==='admin'?'admin':'submit',[
  db.stmt('INSERT INTO kpi_daily_reports(id,project_id,supervisor_id,report_date,location,metrics,notes,created_by,updated_by,idempotency_key,custom_fields) VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,PROJECT.id,supervisor,p.report_date,p.location||'—',JSON.stringify(p.metrics),p.notes,actor.id,actor.id,raw.idempotency_key,JSON.stringify(p.custom_fields)),
  db.audit(actor.id,'kpi',id,'KPI_CREATED',{date:p.report_date,supervisor_id:supervisor}),
 ]);}catch(e){const saved=await db.one('SELECT id FROM kpi_daily_reports WHERE created_by=? AND idempotency_key=?',actor.id,raw.idempotency_key);if(saved)return {id:saved.id};if(String(e).includes('KPI_ALREADY_SUBMITTED'))throw new HttpError('You have already submitted, please contact your Manager.',409);throw e;}
 return {id};
}
export async function updateKpiReport(db:D1Store,actor:Actor,input:unknown){
 if(actor.role==='supervisor')throw new HttpError('You have already submitted, please contact your Manager.',403);
 if(!['admin','supervisor'].includes(actor.role))throw new HttpError('FORBIDDEN',403);
 const raw=z.object({id:z.uuid(),entry:kpiEntrySchema}).parse(input),p=raw.entry;
 const old=await db.one('SELECT * FROM kpi_daily_reports WHERE id=? AND project_id=? AND deleted_at IS NULL',raw.id,PROJECT.id);
 if(!old)throw new HttpError('Report unavailable.',404);
 await validateForm(db,p,true);
 const supervisor=p.supervisor_id||old.supervisor_id;
 if(actor.role!=='admin'&&(old.supervisor_id!==actor.id||supervisor!==old.supervisor_id||p.report_date!==old.report_date))throw new HttpError('FORBIDDEN',403);
 if(supervisor!==old.supervisor_id&&!await db.one("SELECT id FROM users WHERE id=? AND role IN ('admin','supervisor') AND is_active=1 AND deleted_at IS NULL",supervisor))throw new HttpError('Choose an active reporting supervisor.');
 await db.write(actor,actor.role==='admin'?'admin':'submit',[
  db.stmt('UPDATE kpi_daily_reports SET supervisor_id=?,report_date=?,location=?,metrics=?,notes=?,custom_fields=?,updated_by=?,updated_at=? WHERE id=?',supervisor,p.report_date,p.location||'—',JSON.stringify(p.metrics),p.notes,JSON.stringify(p.custom_fields),actor.id,new Date().toISOString(),raw.id),
  db.audit(actor.id,'kpi',raw.id,'KPI_UPDATED',{old:{date:old.report_date,location:old.location,metrics:JSON.parse(old.metrics),custom_fields:JSON.parse(old.custom_fields||'{}')},new:{date:p.report_date,location:p.location,metrics:p.metrics,custom_fields:p.custom_fields}}),
 ]);return {id:raw.id};
}
export async function deleteKpiReport(db:D1Store,actor:Actor,id:string){
 if(actor.role!=='admin')throw new HttpError('FORBIDDEN',403);z.uuid().parse(id);
 const old=await db.one('SELECT id FROM kpi_daily_reports WHERE id=? AND project_id=? AND deleted_at IS NULL',id,PROJECT.id);if(!old)throw new HttpError('Report unavailable.',404);
 const now=new Date().toISOString();await db.write(actor,'admin',[db.stmt('UPDATE kpi_daily_reports SET deleted_at=?,updated_at=?,updated_by=? WHERE id=?',now,now,actor.id,id),db.audit(actor.id,'kpi',id,'KPI_DELETED')]);return {id};
}

export async function saveKpiFormSettings(db:D1Store,actor:Actor,input:unknown){
 if(actor.role!=='admin')throw new HttpError('FORBIDDEN',403);
 const field=z.object({en:z.string().trim().min(1).max(100),ar:z.string().trim().min(1).max(100),hintEn:z.string().max(400),hintAr:z.string().max(400),hidden:z.boolean().optional()}).strict();
 const fields=z.object({...Object.fromEntries([...ACTIVITY_FIELDS.map(f=>f.key),'location','notes'].map(key=>[key,field.optional()])),custom:z.array(z.object({id:z.string().regex(/^custom_[a-zA-Z0-9_-]{1,64}$/),en:z.string().trim().min(1).max(100),ar:z.string().trim().min(1).max(100),required:z.boolean(),hidden:z.boolean().optional()}).strict()).max(30).optional()}).strict().refine(v=>new Set(v.custom?.map(f=>f.id)).size===(v.custom?.length||0),'Duplicate field IDs.').parse(input);
 await db.write(actor,'admin',[
 db.stmt("INSERT INTO kpi_form_settings(id,fields,updated_by,updated_at) VALUES('daily',?,?,?) ON CONFLICT(id) DO UPDATE SET fields=excluded.fields,updated_by=excluded.updated_by,updated_at=excluded.updated_at",JSON.stringify(fields),actor.id,new Date().toISOString()),
 db.audit(actor.id,'kpi','daily-form','KPI_FORM_UPDATED',{fields}),
 ]);return {saved:true};
}

async function validateForm(db:D1Store,p:z.infer<typeof kpiEntrySchema>,editing=false){
 const row=await db.one("SELECT fields FROM kpi_form_settings WHERE id='daily'");
 const fields=JSON.parse(row?.fields||'{}');
 if(!fields.tree_pruning?.hidden&&!fields.date_palm_pruning?.hidden&&p.metrics.date_palm_pruning>p.metrics.tree_pruning)throw new HttpError('Date Palm Pruning cannot exceed the all-tree pruning total.');
 if(!fields.location?.hidden&&!p.location.trim())throw new HttpError('Location is required.');
 if(!editing)for(const f of fields.custom||[])if(!f.hidden&&f.required&&!p.custom_fields[f.id]?.trim())throw new HttpError('Complete all required form fields.');
 const known=new Set((fields.custom||[]).map((f:{id:string})=>f.id));
 if(!editing&&Object.keys(p.custom_fields).some(k=>!known.has(k)))throw new HttpError('Form changed. Refresh and try again.');
}
