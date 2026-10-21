"use client";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  Circle,
  useMap,
} from "react-leaflet";
import { useEffect } from "react";
import "leaflet/dist/leaflet.css";
import type { Row } from "@/lib/client";
function Bounds({ records }: { records: Row[] }) {
  const map = useMap();
  useEffect(() => {
    if (records.length)
      map.fitBounds(
        records.map((r) => [r.latitude, r.longitude] as [number, number]),
        { padding: [35, 35], maxZoom: 17 },
      );
  }, [records, map]);
  return null;
}
export default function LocationMap({
  records,
  onReady,
  onSelect,
}: {
  records: Row[];
  onReady?: () => void;
  onSelect?: (r: Row) => void;
}) {
  return (
    <div className="map-frame">
      <MapContainer
        center={
          records.length
            ? [records[0].latitude, records[0].longitude]
            : [24.7136, 46.6753]
        }
        zoom={records.length ? 16 : 5}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{ load: () => onReady?.() }}
        />
        <Bounds records={records} />
        {records.map((r) => (
          <span key={r.id}>
            <CircleMarker
              center={[r.latitude, r.longitude]}
              radius={9}
              pathOptions={{
                color: "#fff",
                weight: 3,
                fillColor:
                  r.status === "Needs Attention" ? "#df9a22" : "#008d78",
                fillOpacity: 1,
              }}
            >
              <Popup>
                <strong>{r.number || "Captured position"}</strong>
                <p>
                  {r.name ||
                    r.category ||
                    r.condition ||
                    "Verify this location"}
                </p>
                <p>
                  {r.latitude}, {r.longitude}
                </p>
                {r.status && <p>{r.status}</p>}
                {(r.waste_report_photos?.[0]?.url ||
                  r.facility_photos?.[0]?.url) && (
                  <img
                    alt="Site photograph"
                    width="120"
                    src={
                      r.waste_report_photos?.[0]?.url ||
                      r.facility_photos?.[0]?.url
                    }
                  />
                )}
                <a
                  href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Google Maps ↗
                </a>
                {onSelect && (
                  <button className="map-detail" onClick={() => onSelect(r)}>
                    View details →
                  </button>
                )}
              </Popup>
            </CircleMarker>
            {(r.accuracy || r.gps_accuracy_meters) && (
              <Circle
                center={[r.latitude, r.longitude]}
                radius={r.accuracy || r.gps_accuracy_meters}
                pathOptions={{ color: "#008d78", weight: 1, fillOpacity: 0.12 }}
              />
            )}
          </span>
        ))}
      </MapContainer>
    </div>
  );
}
