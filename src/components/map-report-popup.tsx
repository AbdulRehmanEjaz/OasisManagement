"use client";
import { useState } from "react";
import type { Row } from "@/lib/client";

export default function MapReportPopup({ records, onSelect }: { records: Row[]; onSelect?: (r: Row) => void }) {
  const [selected, setSelected] = useState("");
  const r = records.find(record => record.id === selected) || records[0];
  if (!r) return null;
  const photo = r.waste_report_photos?.[0]?.url || r.facility_inspection_photos?.[0]?.url || r.facility_photos?.[0]?.url;
  return <div className="compact-report">
    {records.length > 1 && <select aria-label="Reports at this location" value={r.id} onChange={e => setSelected(e.target.value)}>{records.map(record => <option key={record.id} value={record.id}>{record.number}</option>)}</select>}
    <header><strong>{r.number || "Captured position"}</strong>{r.created_at && <time>{new Date(r.created_at).toLocaleString(undefined, {dateStyle:"short",timeStyle:"short"})}</time>}</header>
    <div className="compact-report-body">
      {photo && <img src={photo} alt="Site photograph" loading="lazy" />}
      <div><b>{r.site || r.name || r.structure_type || "Site location"}</b>
        {r.structure_type && r.site && <span>{r.structure_type}</span>}
        {r.category && <span>{r.category}</span>}
        {r.quantity != null && <span><b>{r.quantity} {r.unit}</b></span>}
        {r.description && <span className="compact-notes" title={r.description}>{r.description}</span>}
      </div>
    </div>
    <div className="compact-coordinates">{r.latitude.toFixed(6)}, {r.longitude.toFixed(6)}{(r.accuracy || r.gps_accuracy_meters) ? ` · ±${Math.ceil(r.accuracy || r.gps_accuracy_meters)} m` : ""}</div>
    <footer><a href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`} target="_blank" rel="noopener noreferrer">Google Maps ↗</a>{onSelect && <button onClick={() => onSelect(r)}>Full report →</button>}</footer>
  </div>;
}
