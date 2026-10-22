"use client";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import { Fragment, useEffect, useMemo, useState } from "react";
import { divIcon } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Row } from "@/lib/client";
function Bounds({records}: {records: Row[]}) {
 const map = useMap();
 useEffect(() => {map.invalidateSize(); if(records.length) map.fitBounds(records.map(r=>[r.latitude,r.longitude] as [number,number]),{padding:[40,40],maxZoom:18});},[records,map]);
 return null;
}
export default function LocationMap({records,onReady,onSelect}:{records:Row[];onReady?:()=>void;onSelect?:(r:Row)=>void}) {
 const [tileError,setTileError]=useState(false);
 const pins=useMemo(()=>records.filter(r=>typeof r.latitude==="number"&&typeof r.longitude==="number"&&Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)&&Math.abs(r.latitude)<=90&&Math.abs(r.longitude)<=180),[records]);
 const locations = useMemo(() => Array.from(new Map(pins.map(r => [r.latitude + "," + r.longitude, r])).values()), [pins]);
 return <div className="satellite-map"><div className="map-frame"><MapContainer center={pins.length?[pins[0].latitude,pins[0].longitude]:[26.61,37.92]} zoom={pins.length?16:11} style={{height:"100%",width:"100%"}}>
 <TileLayer attribution='Tiles &copy; Esri — Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community' url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={19} maxZoom={21} eventHandlers={{tileload:()=>{setTileError(false);onReady?.();},tileerror:()=>setTileError(true)}}/>
 <Bounds records={pins}/>
 {locations.map((r,index)=>{return <Fragment key={(r.kind||"facility")+r.id}>
 <Marker position={[r.latitude,r.longitude]} title={r.number||"Captured position"} riseOnHover icon={divIcon({className:"report-map-pin",html:'<span><b>'+(index+1)+'</b></span>',iconSize:[32,40],iconAnchor:[16,40],popupAnchor:[0,-38]})}>
 <Popup minWidth={220} maxWidth={300} maxHeight={320}>{pins.filter(record => record.latitude === r.latitude && record.longitude === r.longitude).map(r => { const photo=r.waste_report_photos?.[0]?.url||r.facility_photos?.[0]?.url||r.facility_inspection_photos?.[0]?.url; return <div className="map-popup-record" key={r.id}><strong>{r.number||"Captured position"}</strong>
 <p>{r.name||r.category||r.structure_type||"Verify this location"}</p>
 {r.site&&<p><b>Site:</b> {r.site}</p>}
 {r.quantity!=null&&<p><b>Estimated amount:</b> {r.quantity} {r.unit}</p>}
 {r.created_at&&<p>{new Date(r.created_at).toLocaleString()}</p>}
 {r.description&&<p>{r.description}</p>}
 <p>{r.latitude}, {r.longitude}</p>
 {(r.accuracy||r.gps_accuracy_meters)&&<p>GPS accuracy: ±{Math.ceil(r.accuracy||r.gps_accuracy_meters)} m</p>}
 {photo&&<img alt="Site photograph" className="map-photo" width="240" loading="lazy" src={photo}/>}
 <a href={"https://www.google.com/maps?q="+r.latitude+","+r.longitude} target="_blank" rel="noreferrer">Open in Google Maps ↗</a>
 {onSelect&&<button className="map-detail" onClick={()=>onSelect(r)}>View details →</button>}
 </div>;})}</Popup></Marker>
 {(r.accuracy||r.gps_accuracy_meters)&&<Circle center={[r.latitude,r.longitude]} radius={r.accuracy||r.gps_accuracy_meters} pathOptions={{color:"#f3c762",weight:1,fillOpacity:0.12}}/>}
 </Fragment>;})}
 </MapContainer></div>
 {tileError&&<p className="notice" role="status">Satellite imagery could not load. Check your connection and zoom out; saved GPS coordinates are unchanged.</p>}
 <p className="map-caption">Satellite imagery · {pins.length} locations · Tap a pin for details. Position accuracy follows the recorded device GPS.</p>
 </div>;
}
