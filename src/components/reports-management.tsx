"use client";
import { useEffect, useState } from "react";
import { Download, Images, Recycle, Building2 } from "lucide-react";
import {downloadReportArchive} from "@/lib/report-download";
import ReportImport from "./report-import";
import { Button } from "./ui/button";
export default function ReportsManagement() {
  const [progress,setProgress]=useState({done:0,total:0,unavailable:0});
  const [kind,setKind]=useState<"waste"|"inspection"|"palms">("waste");
  const [counts,setCounts]=useState<{reports:number;photos:number}|null>(null);
  const [importBusy,setImportBusy]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const [error,setError]=useState("");
  const [downloading,setDownloading]=useState<"zip"|"xlsx"|null>(null);
  async function download(format:"zip"|"xlsx") {
    setDownloading(format);setError("");setProgress({done:0,total:0,unavailable:0});
    try {
      const blob=await downloadReportArchive(kind,format,(done,total,unavailable=0)=>setProgress({done,total,unavailable}));
      const signature=new DataView(await blob.slice(-22).arrayBuffer());
      if(signature.byteLength!==22||signature.getUint32(0,true)!==0x06054b50||signature.getUint16(10,true)===0)throw new Error("The download is incomplete. Please retry.");
      const url=URL.createObjectURL(blob),link=document.createElement("a");
      link.href=url;link.download=`oasis-${kind==="waste"?"waste":kind==="palms"?"date-palms":"facilities"}-${format==="zip"?"photos":"reports"}-${new Date().toISOString().slice(0,10)}.${format}`;
      document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    } catch(e){setError((e as Error).message||"Download failed. Please retry.");}
    finally{setDownloading(null);}
  }
  useEffect(()=>{
    let active=true;setCounts(null);setError("");
    fetch(`/api/report-photos?kind=${kind}`,{cache:"no-store"}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);if(active)setCounts(data);}).catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[kind,refresh]);
  return <section className="records-card export-panel">
    <div className="segmented" role="tablist" aria-label="Report exports"><button disabled={importBusy||!!downloading} role="tab" aria-selected={kind==="waste"} className={kind==="waste"?"selected":""} onClick={()=>setKind("waste")}><Recycle size={17}/>Waste Tracking</button><button disabled={importBusy||!!downloading} role="tab" aria-selected={kind==="inspection"} className={kind==="inspection"?"selected":""} onClick={()=>setKind("inspection")}><Building2 size={17}/>Facilities Tracking</button><button disabled={importBusy||!!downloading} role="tab" aria-selected={kind==="palms"} className={kind==="palms"?"selected":""} onClick={()=>setKind("palms")}>Date Palms Tracking</button></div>
    <div role="tabpanel" aria-label={kind==="waste"?"Waste Tracking":kind==="palms"?"Date Palms Tracking":"Facilities Tracking"}>
      {kind!=="palms"&&<ReportImport key={kind} kind={kind} onBusy={setImportBusy} onImported={()=>setRefresh(v=>v+1)}/>}
      <span className="export-symbol"><Images size={28}/></span>
      <h2>{kind==="waste"?"Waste reports":kind==="palms"?"Date Palms reports":"Facilities reports"}</h2>
      <p>Export reports to Excel with embedded photos, or download all photos in a ZIP named by report code.</p>
      <div className="export-counts"><span><strong>{counts?.reports ?? "—"}</strong> reports</span><span><strong>{counts?.photos ?? "—"}</strong> photos</span></div>
      <p className="muted">Stored full-size images are downloaded unchanged. No additional resizing or compression.</p>
      <p className="export-example">{kind==="waste"?"COSA-102/COSA-102-01.jpg":kind==="palms"?"DPT-001/DPT-001-01.jpg":"OFT-001/OFT-001-01.jpg"}</p>
      {!downloading&&progress.total>0&&progress.done===progress.total&&!error&&<p role="status" className="notice">Download prepared: {progress.total-progress.unavailable} photos included.{progress.unavailable>0&&<> {progress.unavailable} original photos are temporarily unavailable from ImgBB. See the unavailable-photo list in the ZIP or marked rows in Excel; retry later for these images.</>}</p>}
      {error&&<p className="notice error" role="alert">{error}</p>}
      <Button disabled={!counts?.photos||!!downloading||importBusy} onClick={()=>download("zip")}><Download size={18}/>Download all photos (.zip)</Button>
      <Button disabled={!counts?.reports||!!downloading||importBusy} onClick={()=>download("xlsx")}><Download size={18}/>Export Excel (.xlsx)</Button>
      {downloading&&<p role="status">Preparing {downloading.toUpperCase()}: {progress.done} / {progress.total} photos processed…</p>}
      {counts?.photos===0&&<p className="muted">No photos have been submitted in this category yet.</p>}
      <p className="muted">Large downloads may take a few minutes. Your browser will show the download progress. Keep this tab open; retry if the image host cannot be reached.</p>
    </div>
  </section>;
}
