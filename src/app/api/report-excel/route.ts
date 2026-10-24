import { reportLocation } from "@/lib/report-location";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/backend";
import { failure } from "@/lib/http";
import { reportExcel, type ExcelReport } from "@/lib/report-excel";
export async function GET(req:NextRequest){
 try{
  const {db,profile}=await requireUser(true);
  const kind=z.enum(['waste','inspection']).parse(req.nextUrl.searchParams.get('kind'));
  await db.limit('excel-export:'+profile.id,3,60000);
  async function* reports():AsyncGenerator<ExcelReport>{
   let cursor='';
   while(true){
    const rows=await db.all('SELECT * FROM reports WHERE kind=? AND id>? ORDER BY id LIMIT 100',kind,cursor);
    if(!rows.length)return;
    for(const row of rows){const photos=await db.all('SELECT url FROM record_photos WHERE report_id=? ORDER BY id',row.id);yield {...reportLocation(row),photos} as ExcelReport;}
    cursor=rows[rows.length-1].id;
   }
  }
  const abort=new AbortController(),iterator=reportExcel(kind,reports(),abort.signal);
  const stream=new ReadableStream<Uint8Array>({async pull(c){try{const v=await iterator.next();if(v.done)c.close();else c.enqueue(v.value);}catch(e){abort.abort();c.error(e);}},async cancel(){abort.abort();await iterator.return(undefined);}});
  return new Response(stream,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="oasis-${kind==='waste'?'waste':'facilities'}-reports-${new Date().toISOString().slice(0,10)}.xlsx"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){return failure(e);}
}
