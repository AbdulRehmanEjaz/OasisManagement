import { z } from "zod";
import { D1Store, HttpError, type Actor } from "./d1-store";
import { publicPhotoUrl, validateImportRow, type ImportKind } from "./report-import-xlsx";
export async function hostImportPhoto(value:string,fetchImage:typeof fetch=fetch):Promise<string>{
 let url=publicPhotoUrl(value),response:Response|undefined;
 for(let i=0;i<4;i++){
  response=await fetchImage(url,{redirect:'manual',signal:AbortSignal.timeout(30000)});
  if(response.status>=300&&response.status<400){const next=response.headers.get('location');await response.body?.cancel();if(!next)throw new HttpError('Photo redirect has no destination.');url=publicPhotoUrl(new URL(next,url).href);continue;}
  break;
 }
 if(!response?.ok||!response.body)throw new HttpError('Photo URL did not return an image. Use a direct public image link.');
 const mime=response.headers.get('content-type')?.split(';')[0].toLowerCase();
 if(!['image/jpeg','image/png','image/webp'].includes(mime||''))throw new HttpError('Photo URL must point directly to a JPEG, PNG or WebP image, not a web page.');
 if(Number(response.headers.get('content-length'))>15*1024*1024)throw new HttpError('Photo must be smaller than 15 MB.');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const c=await reader.read();if(c.done)break;size+=c.value.length;if(size>15*1024*1024)throw new HttpError('Photo must be smaller than 15 MB.');chunks.push(c.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 let bytes: Buffer=Buffer.concat(chunks);let converted:Buffer;try{const {processPhoto}=await import("@/lib/photo-processing");converted=await processPhoto(bytes);}catch{throw new HttpError("This photo cannot be decoded. Use a valid JPEG, PNG or WebP image.");}
 // Existing ImgBB originals stay unchanged; other sources are copied to the same host.
 if(new URL(url).hostname==='i.ibb.co'&&mime!=='image/webp')return url;
 if(mime==='image/webp')bytes=converted;
 if(!process.env.IMGBB_API_KEY)throw new HttpError('Image hosting is not configured.');
 const form=new FormData();form.set('key',process.env.IMGBB_API_KEY);form.set('image',bytes.toString('base64'));
 const uploaded=await fetchImage('https://api.imgbb.com/1/upload',{method:'POST',body:form,signal:AbortSignal.timeout(60000)});const result=await uploaded.json() as any;
 if(!uploaded.ok||!result.success||!result.data?.url?.startsWith('https://i.ibb.co/'))throw new HttpError('Could not save imported photo. Retry this row.');
 return result.data.url;
}
export async function importReport(db:D1Store,actor:Actor,kind:ImportKind,input:unknown,hostPhoto:typeof hostImportPhoto=hostImportPhoto):Promise<{id:string;number:string;skipped:boolean}>{
 if(actor.role!=='admin')throw new HttpError('FORBIDDEN',403);
 const row=validateImportRow(kind,input),key=kind+':'+row.key;
 const existing=await db.one('SELECT id,number FROM reports WHERE import_key=?',key);
 if(existing)return {id:existing.id,number:existing.number,skipped:true};
 const urls:string[]=[];for(const url of row.photos)urls.push(await hostPhoto(url));
 const id=crypto.randomUUID(),photos=urls.map(url=>({id:crypto.randomUUID(),url}));
 try{
  await db.write(actor,'admin',[
   ...photos.map(photo=>db.stmt('INSERT INTO photo_uploads(id,user_id,url) VALUES(?,?,?)',photo.id,actor.id,photo.url)),
   db.stmt(`INSERT INTO reports(id,kind,supervisor_id,site,category,quantity,unit,description,inspection_date,location_id,latitude,longitude,gps_accuracy_meters,gps_captured_at,location_confirmed,location_confirmed_at,photo_ids,idempotency_key,created_at,structure_type,source,import_key) VALUES(?,?,?,?,?,?,?,?,?,NULL,?,?,0,?,0,NULL,?,?,?,?, 'excel',?)`,id,kind,actor.id,row.site||null,kind==='waste'?row.category:null,kind==='waste'?row.quantity:null,kind==='waste'?'Kilograms (kg)':null,'',kind==='inspection'?row.date.slice(0,10):null,row.latitude,row.longitude,row.date,JSON.stringify(photos.map(p=>p.id)),id,row.date,row.structure_type||null,key),
   db.audit(actor.id,kind,id,'EXCEL_IMPORTED',{fileRowKey:row.key,photos:photos.length}),
  ]);
 }catch(e){const saved=await db.one('SELECT id,number FROM reports WHERE import_key=?',key);if(saved)return {id:saved.id,number:saved.number,skipped:true};throw e;}
 const saved=await db.one('SELECT id,number FROM reports WHERE id=?',id);if(!saved)throw new HttpError('Import could not be saved.');return {id:saved.id,number:saved.number,skipped:false};
}
