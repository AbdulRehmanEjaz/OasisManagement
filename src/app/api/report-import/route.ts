import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/backend";
import { failure,json } from "@/lib/http";
import { HttpError } from "@/lib/d1-store";
import { isSameOrigin } from "@/lib/request-security";
import { importTemplate,parseImportWorkbook } from "@/lib/report-import-xlsx";
import { importReport } from "@/lib/report-import";
export async function GET(req:NextRequest){try{
 await requireUser(true);const kind=z.enum(['waste','inspection']).parse(req.nextUrl.searchParams.get('kind'));
 return new Response(Buffer.from(importTemplate(kind)),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${kind==='waste'?'waste':'facilities'}-import-template.xlsx"`,'Cache-Control':'private, no-store'}});
}catch(e){return failure(e);}}
export async function POST(req:NextRequest){try{
 if(!isSameOrigin(req))throw new HttpError('FORBIDDEN',403);
 const {db,profile}=await requireUser(true);const kind=z.enum(['waste','inspection']).parse(req.nextUrl.searchParams.get('kind'));
 if(req.headers.get('content-type')?.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')){
  await db.limit('import-preview:'+profile.id,12,60000);
  if(Number(req.headers.get('content-length'))>2200000)throw new HttpError('Choose an .xlsx file smaller than 2 MB.');
  const bytes=new Uint8Array(await req.arrayBuffer());if(!bytes.length||bytes.length>2*1024*1024)throw new HttpError('Choose an .xlsx file smaller than 2 MB.');
  let rows;try{rows=await parseImportWorkbook(kind,bytes);}catch(e){throw new HttpError((e as Error).message||"Invalid .xlsx template.");}
  return json({rows,nextCode:kind==='waste'?'COSA-'+String(((await db.one("SELECT value FROM sequences WHERE kind='waste'"))?.value||101)+1).padStart(3,'0'):undefined});
 }
 await db.limit('import-row:'+profile.id,120,60000);
 if(Number(req.headers.get('content-length'))>16000)throw new HttpError('Import row is too large.');
 return json(await importReport(db,profile,kind,await req.json()));
}catch(e){return failure(e);}}
