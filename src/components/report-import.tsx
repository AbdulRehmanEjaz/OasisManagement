"use client";
import {useState,useRef,useEffect} from "react";
import {Download,Upload} from "lucide-react";
import {Button} from "./ui/button";
import type {ImportKind,ImportRow} from "@/lib/report-import-xlsx";
export default function ReportImport({kind,onImported,onBusy}:{kind:ImportKind;onImported:()=>void;onBusy:(busy:boolean)=>void}){
 const [rows,setRows]=useState<ImportRow[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[completed,setCompleted]=useState(0),[message,setMessage]=useState(''),[name,setName]=useState('');
 const input=useRef<HTMLInputElement>(null),abort=useRef<AbortController|null>(null);
 useEffect(()=>()=>{abort.current?.abort();},[]);
 async function preview(file:File){setBusy(true);onBusy(true);setError('');setRows([]);setCompleted(0);setMessage('');setName(file.name);abort.current=new AbortController();
  try{const response=await fetch(`/api/report-import?kind=${kind}`,{method:'POST',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},body:file,signal:abort.current.signal});const data=await response.json();if(!response.ok)throw new Error(data.error);setRows(data.rows);}
  catch(e){setError((e as Error).message);}finally{setBusy(false);onBusy(false);if(input.current)input.current.value='';}
 }
 async function submit(){setBusy(true);onBusy(true);setError('');abort.current=new AbortController();let count=completed,last='';
  try{for(let i=completed;i<rows.length;i++){const response=await fetch(`/api/report-import?kind=${kind}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(rows[i]),signal:abort.current.signal});const result=await response.json();if(!response.ok)throw new Error(`Row ${i+2}: ${result.error}`);count=i+1;last=result.number;setCompleted(count);setMessage(`${count} of ${rows.length} reports processed. Latest: ${last}`);}setMessage(`Import complete: ${count} reports processed. Last report: ${last}`);}
  catch(e){setError((e as Error).message+' Completed rows are saved; retry resumes safely.');}
  finally{setBusy(false);onBusy(false);onImported();}
 }
 return <section className="report-import">
  <h3>Bulk import reports</h3><p>Download the template, fill it in Excel, and upload it here. Include one required photo URL and an optional second URL. Report codes are assigned automatically{kind==='waste'?' from COSA-102 onwards':''}.</p>
  <div className="import-actions"><Button variant="outline" disabled={busy} onClick={()=>window.location.assign(`/api/report-import?kind=${kind}`)}><Download size={17}/>Download template (.xlsx)</Button><Button variant="secondary" disabled={busy} onClick={()=>input.current?.click()}><Upload size={17}/>{busy?'Processing…':'Upload Excel (.xlsx)'}</Button><input ref={input} hidden type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Upload reports Excel file" onChange={e=>{if(e.target.files?.[0])void preview(e.target.files[0]);}}/></div>
  {rows.length>0&&<div className="import-preview"><strong>{name} · {rows.length} valid report rows</strong><p>{rows.slice(0,4).map((row,i)=>`Row ${i+2}: ${row.site||row.category} · ${row.photos.length} photo${row.photos.length>1?'s':''}`).join('\n')}</p><Button disabled={busy||completed===rows.length} onClick={submit}>{busy?`Importing ${completed} / ${rows.length}…`:completed>0&&completed<rows.length?'Resume import':`Import ${rows.length} reports`}</Button></div>}
  {message&&<p className="notice" role="status">{message}</p>}{error&&<p className="notice error import-errors" role="alert">{error}</p>}
  <p className="muted">Up to 100 rows per file. Photo URLs must open a public image directly. Imported coordinates are shown as Excel import, not hardware GPS verification.</p>
 </section>;
}
