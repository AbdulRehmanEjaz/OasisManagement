import {z} from 'zod';
import {D1Store,HttpError,type Actor} from '../d1-store';
import {PROJECT} from './config';
import {kpiEntrySchema} from './store';
import {importDate,importTime,type KpiImportRow} from './import-xlsx';
export const kpiImportRowSchema=z.object({row:z.number().int().min(2).max(1048576),date:z.string().transform(v=>importDate(v)),dateRaw:z.string().max(100),time:z.string().transform(importTime),supervisor:z.string().max(200),supervisorName:z.string().trim().min(1).max(200),location:z.string().trim().min(1).max(200),gps:z.string().max(1000),metrics:kpiEntrySchema.shape.metrics,notes:z.string().max(4000)}).strict();
export async function importKpiReport(db:D1Store,actor:Actor,input:unknown){
 if(actor.dashboard!=='kpi'||db.dashboard!=='kpi'||actor.role!=='admin')throw new HttpError('FORBIDDEN',403);
 const raw=z.object({row:kpiImportRowSchema,supervisor_id:z.uuid(),fileName:z.string().max(150)}).strict().parse(input),r=raw.row;
 if(!await db.one("SELECT id FROM users WHERE id=? AND dashboard='kpi' AND role IN('admin','supervisor') AND is_active=1 AND deleted_at IS NULL",raw.supervisor_id))throw new HttpError('Select an active KPI supervisor for this row.');
 const identityData={project:PROJECT.id,supervisor:raw.supervisor_id,date:r.date,time:r.time,location:r.location,gps:r.gps};
 const canonical=JSON.stringify({...identityData,metrics:r.metrics,notes:r.notes});
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical))),b=>b.toString(16).padStart(2,'0')).join(''),key='kpi:'+digest;
 const identity=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(identityData)))),b=>b.toString(16).padStart(2,'0')).join('');
 const prior=await db.one('SELECT id,deleted_at FROM kpi_daily_reports WHERE import_key=?',key);if(prior)return {id:prior.id,skipped:true,deleted:!!prior.deleted_at};
 if(await db.one('SELECT id FROM kpi_daily_reports WHERE import_identity=?',identity))throw new HttpError('Different values were already imported for this supervisor, date, time, location and GPS. Review the existing report; nothing was overwritten.',409);
 const id=crypto.randomUUID(),metadata={time:r.time,gps:r.gps,supervisor:r.supervisor,supervisorName:r.supervisorName,dateRaw:r.dateRaw,fileName:raw.fileName,row:r.row};
 try{await db.write(actor,'admin',[
 db.stmt('INSERT INTO kpi_daily_reports(id,project_id,supervisor_id,report_date,location,metrics,notes,created_by,updated_by,idempotency_key,import_key,import_metadata,import_identity) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',id,PROJECT.id,raw.supervisor_id,r.date,r.location,JSON.stringify(r.metrics),r.notes,actor.id,actor.id,crypto.randomUUID(),key,JSON.stringify(metadata),identity),
 db.audit(actor.id,'kpi',id,'KPI_EXCEL_IMPORTED',{key,date:r.date,supervisor_id:raw.supervisor_id,fileName:raw.fileName,row:r.row}),
 ]);}catch(e){const saved=await db.one('SELECT id,deleted_at FROM kpi_daily_reports WHERE import_key=?',key);if(saved)return {id:saved.id,skipped:true,deleted:!!saved.deleted_at};if(await db.one('SELECT id FROM kpi_daily_reports WHERE import_identity=?',identity))throw new HttpError('Different values already exist for this historical entry. Nothing was overwritten.',409);throw e;}
 return {id,skipped:false,deleted:false};
}
