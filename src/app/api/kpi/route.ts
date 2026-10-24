import {NextRequest} from 'next/server';
import {z} from 'zod';
import {requireUser} from '@/lib/backend';
import {failure,json} from '@/lib/http';
import {HttpError} from '@/lib/d1-store';
import {isSameOrigin} from '@/lib/request-security';
import {readKpiReports,createKpiReport,updateKpiReport,deleteKpiReport} from '@/lib/kpi/store';
export async function GET(req:NextRequest){try{const {db,profile}=await requireUser();const cursor=req.nextUrl.searchParams.get('cursor')||'';if(cursor)z.uuid().parse(cursor);return json(await readKpiReports(db,profile,cursor));}catch(e){return failure(e);}}
export async function POST(req:NextRequest){try{
 if(!isSameOrigin(req))throw new HttpError('FORBIDDEN',403);
 const {db,profile}=await requireUser();if(profile.role==='viewer')throw new HttpError('FORBIDDEN',403);
 if(Number(req.headers.get('content-length'))>20000)throw new HttpError('Report is too large.');
 const body=await req.json();const action=z.enum(['create','update','delete']).parse(body.action);await db.limit('kpi:'+profile.id+':'+action,40,60000);
 if(action==='create')return json(await createKpiReport(db,profile,body));
 if(action==='update')return json(await updateKpiReport(db,profile,body));
 return json(await deleteKpiReport(db,profile,z.uuid().parse(body.id)));
}catch(e){return failure(e);}}
