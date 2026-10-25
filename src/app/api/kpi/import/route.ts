import {NextRequest} from 'next/server';
import {requireUser} from '@/lib/backend';
import {failure,json} from '@/lib/http';
import {HttpError} from '@/lib/d1-store';
import {isSameOrigin} from '@/lib/request-security';
import {kpiImportTemplate,parseKpiWorkbook,matchSupervisor} from '@/lib/kpi/import-xlsx';
import {importKpiReport} from '@/lib/kpi/import-store';
export async function GET(){try{await requireUser(true,'kpi');return new Response(Buffer.from(kpiImportTemplate()),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="kpi-import-template.xlsx"','Cache-Control':'private, no-store'}});}catch(e){return failure(e);}}
export async function POST(req:NextRequest){try{
 if(!isSameOrigin(req))throw new HttpError('FORBIDDEN',403);const {db,profile}=await requireUser(true,'kpi');
 if(req.headers.get('content-type')?.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')){
  await db.limit('kpi-import-preview:'+profile.id,12,60000);if(Number(req.headers.get('content-length'))>2*1024*1024)throw new HttpError('Choose an .xlsx file smaller than 2 MB.');const bytes=new Uint8Array(await req.arrayBuffer());if(!bytes.length||bytes.length>2*1024*1024)throw new HttpError('Choose an .xlsx file smaller than 2 MB.');
  let rows;try{rows=parseKpiWorkbook(bytes);}catch(e){throw new HttpError((e as Error).message||'Invalid workbook.');}
  const supervisors=await db.all("SELECT id,full_name FROM users WHERE dashboard='kpi' AND role IN('supervisor','admin') AND is_active=1 AND deleted_at IS NULL ORDER BY full_name");
  return json({rows:rows.map(r=>({...r,suggestedSupervisorId:matchSupervisor(r.supervisorName,supervisors as {id:string;full_name:string}[])})),supervisors});
 }
 await db.limit('kpi-import-row:'+profile.id,600,60000);const text=await req.text();if(new TextEncoder().encode(text).length>100000)throw new HttpError('Import request is too large.');
 const input=JSON.parse(text);if(!Array.isArray(input.rows)||input.rows.length<1||input.rows.length>20)throw new HttpError('Send between 1 and 20 import rows.');
 const results=[];for(const row of input.rows){try{results.push({row:row.row?.row,...await importKpiReport(db,profile,row)});}catch(e){results.push({row:row.row?.row,error:e instanceof HttpError?e.message:'This row could not be imported. Verify its values and retry.'});}}return json({results});
}catch(e){return failure(e);}}
