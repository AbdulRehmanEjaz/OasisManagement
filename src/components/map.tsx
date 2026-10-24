"use client";
import { MapContainer, Marker, Popup, Circle, useMap } from "react-leaflet";
import { Fragment, useEffect, useMemo, useState } from "react";
import { divIcon } from "leaflet";
import "leaflet/dist/leaflet.css";
import MapReportPopup from "./map-report-popup";
import SatelliteLayer from "./satellite-layer";
import { reportPinLabel } from "@/lib/report-pin";
import type { Row } from "@/lib/client";
function Bounds({records}: {records: Row[]}) {
 const map = useMap();
 useEffect(() => {map.invalidateSize(); if(records.length) map.fitBounds(records.map(r=>[r.latitude,r.longitude] as [number,number]),{padding:[40,40],maxZoom:18});},[records,map]);
 return null;
}
export default function LocationMap({records,onReady,onSelect}:{records:Row[];onReady?:()=>void;onSelect?:(r:Row)=>void}) {
 const [tileError,setTileError]=useState(false);
 const [enlargedImagery,setEnlargedImagery]=useState(false);
 const pins=useMemo(()=>records.filter(r=>typeof r.latitude==="number"&&typeof r.longitude==="number"&&Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)&&Math.abs(r.latitude)<=90&&Math.abs(r.longitude)<=180),[records]);
 const locations = useMemo(() => {
  const unique = new Map<string, Row>();
  for (const row of pins) { const key = row.latitude + "," + row.longitude; if (!unique.has(key)) unique.set(key, row); }
  return Array.from(unique.values());
 }, [pins]);
 return <div className="satellite-map"><div className="map-frame"><MapContainer center={pins.length?[pins[0].latitude,pins[0].longitude]:[26.61,37.92]} zoom={pins.length?16:11} maxZoom={21} style={{height:"100%",width:"100%"}}>
 <SatelliteLayer onReady={()=>{setTileError(false);onReady?.();}} onError={()=>setTileError(true)} onFallback={()=>setEnlargedImagery(true)}/>
 <Bounds records={pins}/>
 {locations.map((r)=>{return <Fragment key={(r.kind||"facility")+r.id}>
 <Marker position={[r.latitude,r.longitude]} title={r.number||"Captured position"} riseOnHover icon={divIcon({className:"report-map-pin",html:'<span><b>'+reportPinLabel(r.number)+'</b></span>',iconSize:[32,40],iconAnchor:[16,40],popupAnchor:[0,-38]})}>
 <Popup minWidth={240} maxWidth={360} className="compact-map-popup"><MapReportPopup records={pins.filter(record => record.latitude === r.latitude && record.longitude === r.longitude)} onSelect={onSelect}/></Popup></Marker>
 {(r.accuracy||r.gps_accuracy_meters)&&<Circle center={[r.latitude,r.longitude]} radius={r.accuracy||r.gps_accuracy_meters} pathOptions={{color:"#f3c762",weight:1,fillOpacity:0.12}}/>}
 </Fragment>;})}
 </MapContainer></div>
 {tileError&&<p className="notice" role="status">Satellite imagery could not load. Check your connection and zoom out; saved GPS coordinates are unchanged.</p>}
 {enlargedImagery&&<p className="map-caption">Showing enlarged available imagery where higher-resolution satellite coverage is missing. GPS pins stay at their recorded coordinates.</p>}
 <p className="map-caption">Satellite imagery · {pins.length} locations · Tap a pin for details. Position accuracy follows the recorded device GPS.</p>
 </div>;
}
