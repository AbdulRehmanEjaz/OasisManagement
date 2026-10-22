"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { read, type Row } from "@/lib/client";
import { Button } from "./ui/button";
const LocationMap = dynamic(() => import("./map"), { ssr: false, loading: () => <div className="map-loading">Loading map…</div> });

export default function OverviewReportMap({ refresh, onSelect }: { refresh: number; onSelect: (record: Row, type: string) => void }) {
  const [tab, setTab] = useState<"waste" | "inspections">("waste");
  const [records, setRecords] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setRecords([]);
    (async () => {
      try {
        const first = await read(tab, { map: "1", page: "0" });
        const data = [...first.data];
        for (let offset = 1000; offset < first.count; offset += 1000) {
          if (!active) return;
          const next = await read(tab, { map: "1", page: String(offset / 1000) });
          data.push(...next.data);
        }
        if (active) setRecords(data);
      } catch (e) { if (active) setError((e as Error).message); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [tab, refresh, retry]);
  return <section className="records-card overview-map">
    <div className="card-heading">
      <div className="segmented" role="tablist" aria-label="Report maps">
        <button role="tab" aria-selected={tab === "waste"} className={tab === "waste" ? "selected" : ""} onClick={() => setTab("waste")}>Waste Reports</button>
        <button role="tab" aria-selected={tab === "inspections"} className={tab === "inspections" ? "selected" : ""} onClick={() => setTab("inspections")}>Facilities</button>
      </div>
      <span className="pill">{loading ? "Loading…" : `${records.length} reports`}</span>
    </div>
    <div role="tabpanel" aria-label={tab === "waste" ? "Waste Reports" : "Facilities"}>
      {error ? <div className="notice error" role="alert">{error}<Button variant="ghost" onClick={() => setRetry(n => n + 1)}>Retry</Button></div> : loading ? <div className="map-loading">Loading report locations…</div> : <>
        <LocationMap records={records} onSelect={record => onSelect(record, tab)} />
        {!records.length && <p className="muted">No {tab === "waste" ? "waste" : "facility"} reports submitted yet.</p>}
      </>}
    </div>
  </section>;
}
