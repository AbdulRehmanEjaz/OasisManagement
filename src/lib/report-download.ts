import {photoZip, trustedPhotoUrl, type ExportPhoto} from './photo-zip';
import {reportExcel, type ExcelReport} from './report-excel';
type Photo=ExportPhoto&{id:string};
type Report=ExcelReport&{photos:{id:string;url:string}[]};
export async function downloadReportArchive(kind:'waste'|'inspection'|'palms',format:'zip'|'xlsx',progress:(done:number,total:number,unavailable?:number)=>void,request:typeof fetch=fetch):Promise<Blob>{
 const photos:Photo[]=[],reports:Report[]=[];let cursor='';const seen=new Set<string>();
 do{
  const endpoint=format==='zip'?'/api/report-photos':'/api/report-excel';
  const response=await request(`${endpoint}?kind=${kind}&manifest=1${cursor?'&cursor='+encodeURIComponent(cursor):''}`,{cache:'no-store',credentials:'same-origin'});
  if(!response.ok)throw new Error((await response.json()).error||'Unable to load reports.');
  const data=await response.json();
  if(format==='zip')photos.push(...data.photos);else{reports.push(...data.reports);for(const r of data.reports)photos.push(...r.photos.map((p:{id:string;url:string})=>({...p,number:r.number})));}
  cursor=data.nextCursor||'';if(cursor&&seen.has(cursor))throw new Error('Report listing changed. Refresh and retry.');seen.add(cursor);
 }while(cursor);
 if(format==='zip'&&!photos.length)throw new Error('There are no photos in this category.');
 if(format==='xlsx'&&!reports.length)throw new Error('There are no reports in this category.');
 const ids=new Map(photos.map(p=>[trustedPhotoUrl(p.url),p.id]));let done=0,unavailable=0,lastPhotoDownloaded=false;progress(0,photos.length,0);
 const fetchOriginal=(async(input:RequestInfo|URL,options?:RequestInit)=>{
  lastPhotoDownloaded=false;const id=ids.get(String(input));if(!id)throw new Error('Photo is not in the selected category.');
  let failure='Could not download an original photo.';
  for(let attempt=0;attempt<6;attempt++){
   options?.signal?.throwIfAborted();
   if(attempt&&request===fetch)await new Promise(resolve=>setTimeout(resolve,Math.min(attempt*500,2000)));
   try{
    let response:Response;
    try{const source=new URL(trustedPhotoUrl(String(input)));if(attempt>=2)source.searchParams.set('_oasis_export_retry',String(Date.now())+'_'+attempt);response=await request(source.href,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',...(attempt?{cache:'reload' as RequestCache}:{}),signal:options?.signal});if(!response.ok)throw new Error('Image host request failed.');}
    catch{response=await request(`/api/report-photos?kind=${kind}&photo=${encodeURIComponent(id)}${attempt>=2?'&fresh=1':''}`,{cache:'no-store',credentials:'same-origin',signal:options?.signal});}
    if(!response.ok){const data=await response.json();failure=data.error||failure;if(response.status<500&&response.status!==429)throw new Error(failure);continue;}
    // Consume the body here so interrupted photo streams can be retried before adding to the archive.
    const bytes=await response.arrayBuffer();if(!bytes.byteLength){failure='Image host returned an empty photo.';continue;}
    lastPhotoDownloaded=true;progress(++done,photos.length,unavailable);return new Response(bytes,{headers:{'Content-Type':response.headers.get('content-type')||''}});
   }catch(e){if(options?.signal?.aborted)throw e;failure=(e as Error).message;}
  }
  throw new Error(failure);
 }) as typeof fetch;
 const signal=new AbortController().signal;
 async function* entries<T>(rows:T[]){yield* rows;}
 const markUnavailable=()=>{unavailable++;if(!lastPhotoDownloaded)done++;progress(done,photos.length,unavailable);};
 const stream=format==='zip'?photoZip(entries(photos),signal,fetchOriginal,markUnavailable):reportExcel(kind,entries(reports),signal,fetchOriginal,markUnavailable);
 const parts:BlobPart[]=[];for await(const chunk of stream)parts.push(new Uint8Array(chunk));
 return new Blob(parts,{type:format==='zip'?'application/zip':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
