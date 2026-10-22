"use client";
import { useEffect, useState } from "react";
import { Download, Images, Recycle, Building2 } from "lucide-react";
import { Button } from "./ui/button";
export default function ReportsManagement() {
  const [kind,setKind]=useState<"waste"|"inspection">("waste");
  const [counts,setCounts]=useState<{reports:number;photos:number}|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;setCounts(null);setError("");
    fetch(`/api/report-photos?kind=${kind}`,{cache:"no-store"}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);if(active)setCounts(data);}).catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[kind]);
  return <section className="records-card export-panel">
    <div className="segmented" role="tablist" aria-label="Report photo exports"><button role="tab" aria-selected={kind==="waste"} className={kind==="waste"?"selected":""} onClick={()=>setKind("waste")}><Recycle size={17}/>Waste Tracking</button><button role="tab" aria-selected={kind==="inspection"} className={kind==="inspection"?"selected":""} onClick={()=>setKind("inspection")}><Building2 size={17}/>Facilities Tracking</button></div>
    <div role="tabpanel" aria-label={kind==="waste"?"Waste Tracking":"Facilities Tracking"}>
      <span className="export-symbol"><Images size={28}/></span>
      <h2>{kind==="waste"?"Waste report photos":"Facilities report photos"}</h2>
      <p>Download all submitted photos in one ZIP, organised and named by report number.</p>
      <div className="export-counts"><span><strong>{counts?.reports ?? "—"}</strong> reports</span><span><strong>{counts?.photos ?? "—"}</strong> photos</span></div>
      <p className="muted">Stored full-size images are downloaded unchanged. No additional resizing or compression.</p>
      <p className="export-example">{kind==="waste"?"COSA-0001/COSA-0001-01.jpg":"OFT-I-000001/OFT-I-000001-01.jpg"}</p>
      {error&&<p className="notice error" role="alert">{error}</p>}
      <Button disabled={!counts?.photos} onClick={()=>{window.location.assign(`/api/report-photos?kind=${kind}&download=1`);}}><Download size={18}/>Download all photos (.zip)</Button>
      {counts?.photos===0&&<p className="muted">No photos have been submitted in this category yet.</p>}
      <p className="muted">Large downloads may take a few minutes. Your browser will show the download progress. Keep this tab open; retry if the image host cannot be reached.</p>
    </div>
  </section>;
}
