"use client";
import {useState} from "react";
import dynamic from "next/dynamic";
import {MapPin,Check} from "lucide-react";
import {api,type Row} from "@/lib/client";
import {Button} from "./ui/button";
const LocationMap=dynamic(()=>import('./map'),{ssr:false,loading:()=> <div className="map-loading">Loading map…</div>});
export default function AdminReportLocation({record,type,admin,onSaved}:{record:Row;type:string;admin:boolean;onSaved:()=>void}){
 const [editing,setEditing]=useState(false),[latitude,setLatitude]=useState(String(record.latitude)),[longitude,setLongitude]=useState(String(record.longitude)),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lat=Number(latitude),lng=Number(longitude),valid=latitude.trim()!==''&&longitude.trim()!==''&&Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180;
 const preview=editing&&valid?{...record,latitude:lat,longitude:lng,gps_accuracy_meters:null,accuracy:null}:record;
 return <>
  <LocationMap records={[preview]}/>
  <p className="coordinate-text">{preview.latitude}, {preview.longitude}</p>
  {admin&&type!=='facilities'&&!editing&&<Button variant="outline" onClick={()=>{setLatitude(String(record.latitude));setLongitude(String(record.longitude));setError('');setEditing(true);}}><MapPin size={17}/>Change location</Button>}
  {editing&&<form className="admin-location-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await api('record.location.update',{type,id:record.id,latitude:lat,longitude:lng});onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
   <div className="form-grid"><label>Latitude<input type="number" required min="-90" max="90" step="any" value={latitude} onChange={e=>setLatitude(e.target.value)}/></label><label>Longitude<input type="number" required min="-180" max="180" step="any" value={longitude} onChange={e=>setLongitude(e.target.value)}/></label></div>
   <p className="muted">Check the map preview before saving. This is an Admin correction, not a new GPS capture.</p>
   {error&&<p className="notice error" role="alert">{error}</p>}
   <Button disabled={busy||!valid}><Check size={17}/>{busy?'Saving…':'Save location'}</Button><Button type="button" variant="ghost" disabled={busy} onClick={()=>setEditing(false)}>Cancel</Button>
  </form>}
 </>;
}
