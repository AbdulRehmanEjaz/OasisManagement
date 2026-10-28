import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/backend";
import { failure, json } from "@/lib/http";
import { HttpError } from "@/lib/d1-store";
import { photoZip, trustedPhotoUrl, type ExportPhoto } from "@/lib/photo-zip";

export async function GET(req: NextRequest) {
  try {
    const {db, profile} = await requireUser(true);
    const kind = z.enum(["waste", "inspection", "palms"]).parse(req.nextUrl.searchParams.get("kind"));
    const photoId=req.nextUrl.searchParams.get('photo');
    if(photoId){
      z.uuid().parse(photoId);
      const photo=await db.one(kind==='palms'?'SELECT p.url,r.number FROM photo_uploads p JOIN date_palm_reports r ON p.id IN(SELECT value FROM json_each(r.photo_ids)) WHERE p.id=? AND r.deleted_at IS NULL':'SELECT p.url,r.number FROM record_photos p JOIN reports r ON r.id=p.report_id WHERE p.id=? AND r.kind=?',...kind==='palms'?[photoId]:[photoId,kind]);
      if(!photo)throw new HttpError('Photo no longer exists in this category. Refresh and retry.',404);
      let upstream:Response;
      try{const source=new URL(trustedPhotoUrl(photo.url));if(req.nextUrl.searchParams.get('fresh')==='1')source.searchParams.set('_oasis_export_retry',crypto.randomUUID());upstream=await fetch(source.href,{redirect:'manual',signal:AbortSignal.any([req.signal,AbortSignal.timeout(60000)])});}catch{throw new HttpError('Image host did not respond. Retry the download.',502);}
      const mime=upstream.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
      if(!upstream.ok||!upstream.body||!['image/jpeg','image/png','image/webp','image/gif'].includes(mime||'')){await upstream.body?.cancel();throw new HttpError('Image host could not provide the original photo for '+photo.number+'.',502);}
      return new Response(upstream.body,{headers:{'Content-Type':mime!,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    }
    if(req.nextUrl.searchParams.get('manifest')==='1'){
      const cursor=req.nextUrl.searchParams.get('cursor')||'';if(cursor)z.uuid().parse(cursor);
      const rows=await db.all(kind==='palms'?'SELECT p.id,p.url,r.number FROM photo_uploads p JOIN date_palm_reports r ON p.id IN(SELECT value FROM json_each(r.photo_ids)) WHERE r.deleted_at IS NULL AND p.id>? ORDER BY p.id LIMIT 251':'SELECT p.id,p.url,r.number FROM record_photos p JOIN reports r ON r.id=p.report_id WHERE r.kind=? AND p.id>? ORDER BY p.id LIMIT 251',...kind==='palms'?[cursor]:[kind,cursor]);
      const photos=rows.slice(0,250);return json({photos,nextCursor:rows.length>250?photos[photos.length-1].id:null});
    }
    const counts = kind==='palms'?await db.one("SELECT count(*) reports,COALESCE(SUM(json_array_length(photo_ids)),0) photos FROM date_palm_reports WHERE deleted_at IS NULL"):await db.one("SELECT count(DISTINCT r.id) reports,count(p.id) photos FROM reports r LEFT JOIN record_photos p ON p.report_id=r.id WHERE r.kind=?",kind);
    if (req.nextUrl.searchParams.get("download") !== "1") return json(counts);
    if (!counts?.photos) throw new HttpError("There are no submitted photos to download.",404);
    if (counts.photos > 65535) throw new HttpError("This archive exceeds the ZIP file count limit.");
    await db.limit("photo-export:"+profile.id,3,60000);
    async function* photos(): AsyncGenerator<ExportPhoto> {
      let cursor = "";
      while (true) {
        const rows = await db.all(kind==='palms'?'SELECT p.id,p.url,r.number FROM photo_uploads p JOIN date_palm_reports r ON p.id IN(SELECT value FROM json_each(r.photo_ids)) WHERE r.deleted_at IS NULL AND p.id>? ORDER BY p.id LIMIT 250':'SELECT p.id,p.url,r.number FROM record_photos p JOIN reports r ON r.id=p.report_id WHERE r.kind=? AND p.id>? ORDER BY p.id LIMIT 250',...kind==='palms'?[cursor]:[kind,cursor]);
        if (!rows.length) return;
        for (const row of rows) yield {number:row.number,url:row.url};
        cursor=rows[rows.length-1].id;
      }
    }
    const abort = new AbortController();
    const iterator = photoZip(photos(),abort.signal);
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try { const chunk=await iterator.next(); if(chunk.done)controller.close(); else controller.enqueue(chunk.value); }
        catch(e) {abort.abort();controller.error(e);}
      },
      async cancel() {abort.abort();await iterator.return(undefined);},
    });
    return new Response(stream,{headers:{"Content-Type":"application/zip","Content-Disposition":`attachment; filename="oasis-${kind === "waste" ? "waste" : kind === "palms" ? "date-palms" : "facilities"}-photos-${new Date().toISOString().slice(0,10)}.zip"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  } catch(e) {return failure(e);}
}
