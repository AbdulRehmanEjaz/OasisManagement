"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  MapPin,
  Navigation,
  Check,
  ArrowUpRight,
  ShieldCheck,
  LoaderCircle,
} from "lucide-react";
import { api, formatDate, type Row } from "@/lib/client";
import {
  wasteTypes,
  units,
  statuses,
  facilityCategories,
  validateGPS,
  structureTypes,
} from "@/lib/validation";
import Modal from "./modal";
import PhotoInput, { type Photo } from "./photo-input";
import { Button } from "./ui/button";
const LocationMap = dynamic(() => import("./map"), {
  ssr: false,
  loading: () => <div className="map-loading">Loading map…</div>,
});
export default function ReportForm({
  kind,
  facilities,
  users,
  options,
  onClose,
  onSaved,
  onPhoto,
  enabled,
  threshold,
  timezone,
  ownerId,
}: {
  kind: "waste" | "inspection" | "facility";
  facilities: Row[];
  users: Row[];
  options: Row[];
  onClose: () => void;
  onSaved: (r: Row) => void;
  onPhoto: (urls: string[], index: number) => void;
  enabled: boolean;
  threshold: number;
  timezone: string;
  ownerId: string;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [gpsBusy, setGpsBusy] = useState(false),
    [gpsHint, setGpsHint] = useState(""),
    [gps, setGps] = useState<Row | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [mapOpen, setMapOpen] = useState(false),
    [mapViewed, setMapViewed] = useState(false),
    [values, setValues] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null),
    idempotency = useRef(""),
    watchRef = useRef<number | null>(null),
    timerRef = useRef<ReturnType<typeof setTimeout> | null>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    idempotency.current = crypto.randomUUID();
    try {
      setValues(
        JSON.parse(
          localStorage.getItem(`oasis-draft-${ownerId}-${kind}`) || "{}",
        ),
      );
    } catch {}
    return () => {
      mounted.current = false;
      if (watchRef.current !== null)
        navigator.geolocation?.clearWatch(watchRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [kind, ownerId]);
  useEffect(() => {
    if (!gps) return;
    const remaining = 300000 - (Date.now() - Date.parse(gps.captured_at));
    const expiry = setTimeout(
      () => {
        setConfirmed(false);
        setError("GPS reading expired. Capture and confirm a new location.");
      },
      Math.max(0, remaining),
    );
    return () => clearTimeout(expiry);
  }, [gps]);
  function field(name: string, value: string) {
    const next = { ...values, [name]: value };
    setValues(next);
    try {
      localStorage.setItem(
        `oasis-draft-${ownerId}-${kind}`,
        JSON.stringify(next),
      );
    } catch {
      /* A full/private browser storage must not block reporting. */
    }
  }
  function opts(kind: string, fallback: string[]) {
    const found = options
      .filter((o) => o.kind === kind && o.is_active)
      .map((o) => o.label);
    return found.length ? found : fallback;
  }
  async function capture() {
    setError("");
    setGps(null);
    setConfirmed(false);
    setMapViewed(false);
    setGpsHint("");
    if (!window.isSecureContext) {
      setError("Location access requires HTTPS or localhost. Open the dashboard using a secure connection.");
      return;
    }
    if (!navigator.geolocation) {
      setError("This browser does not support device GPS.");
      return;
    }
    setGpsBusy(true);
    let best: GeolocationPosition | undefined;
    let done = false;
    function cleanup() {
      if (watchRef.current !== null)
        navigator.geolocation.clearWatch(watchRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
      watchRef.current = null;
    }
    async function finish(position?: GeolocationPosition, message?: string) {
      if (done) return;
      done = true;
      cleanup();
      if (!mounted.current) return;
      try {
        if (!position)
          throw new Error(message || "GPS timed out. Move outdoors and retry.");
        if (Date.now() - position.timestamp > 90000)
          throw new Error("The device returned an old position. Get location again for a fresh reading.");
        const v = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          captured_at: new Date(position.timestamp).toISOString(),
        };
        // Retain a real but imprecise fix for map preview. Never label it
        // confirmed or persist it as a report-ready location.
        validateGPS(v, Number.MAX_VALUE);
        if (mounted.current) setGps({ ...v, id: "" });
        if (v.accuracy > threshold) {
          setGpsHint(`Your device located you within ±${Math.ceil(v.accuracy)} m. You can view this approximate position on the map, but reports need accuracy within ${threshold} m. Enable precise location in your device settings, move outdoors, and tap Try again. A GPS-equipped phone usually provides a better fix than a computer.`);
          return;
        }
        // Device capture works independently of database configuration.
        // Only a server-issued ID can later confirm and submit a report.
        if (!enabled) return;
        const result = await api("location.capture", v);
        if (mounted.current) setGps({ ...v, id: result.id });
      } catch (e) {
        if (mounted.current) setError((e as Error).message);
      } finally {
        if (mounted.current) setGpsBusy(false);
      }
    }
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        if (done || Date.now() - p.timestamp > 30000 || p.timestamp > Date.now() + 10000 ||
          !Number.isFinite(p.coords.accuracy) || p.coords.accuracy <= 0) return;
        if (!Number.isFinite(p.coords.latitude) || Math.abs(p.coords.latitude) > 90 ||
          !Number.isFinite(p.coords.longitude) || Math.abs(p.coords.longitude) > 180) return;
        if (!best || p.coords.accuracy <= best.coords.accuracy) {
          best = p;
          setGps({ latitude: p.coords.latitude, longitude: p.coords.longitude,
            accuracy: p.coords.accuracy, captured_at: new Date(p.timestamp).toISOString(), id: "" });
        }
        if (p.coords.accuracy <= threshold && Date.now() - p.timestamp < 30000)
          void finish(p);
      },
      (e) => {
        // A watch timeout is recoverable: continue seeking a better fix
        // until the overall acquisition deadline instead of discarding it.
        if (e.code !== 1) return;
        void finish(
          undefined,
          "Location permission denied. Enable location access in browser settings, then retry.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
    timerRef.current = setTimeout(() => void finish(best), 60000);
  }
  async function mapReady() {
    if (!gps || mapViewed) return;
    try {
      if (gps.id) await api("location.view", { id: gps.id });
      setMapViewed(true);
      setConfirmed(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function confirm() {
    if (!mapViewed || !gps) return;
    if (!gps.id) {
      setError("Location captured on this device. Database connection is required to confirm and save a report.");
      setMapOpen(false);
      return;
    }
    setBusy(true);
    try {
      await api("location.confirm", { id: gps.id });
      setConfirmed(true);
      setMapOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (!enabled)
        throw new Error(
          "Configure D1 and image hosting before submitting.",
        );
      if (kind !== "facility" && (!confirmed || !gps?.id))
        throw new Error("Capture and confirm your location first.");
      if (
        photos.some((p) => p.busy || !p.id) ||
        photos.length < (kind === "facility" ? 0 : 2)
      )
        throw new Error("Finish uploading the required photos.");
      const body = { ...values, photo_ids: photos.map((p) => p.id) };
      let result;
      if (kind === "facility") {
        result = await api("facility.create", {
          ...body,
          latitude: Number(values.latitude),
          longitude: Number(values.longitude),
          assigned_supervisor: values.assigned_supervisor || null,
        });
      } else {
        result = await api("report.submit", {
          ...body,
          kind,
          quantity: kind === "waste" ? Number(values.quantity) : undefined,
          location_id: gps?.id,
          idempotency_key: idempotency.current,
        });
      }
      try {
        localStorage.removeItem(`oasis-draft-${ownerId}-${kind}`);
      } catch {}
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
      onSaved(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const input = (
    name: string,
    label: string,
    required = true,
    type = "text",
  ) => (
    <label>
      {label}
      <input
        name={name}
        type={type}
        required={required}
        min={type === "number" ? "0.000001" : undefined}
        step={type === "number" ? "any" : undefined}
        inputMode={type === "number" ? "decimal" : undefined}
        value={values[name] || ""}
        onChange={(e) => field(name, e.target.value)}
      />
    </label>
  );
  const select = (name: string, label: string, list: string[]) => (
    <label>
      {label}
      <select
        required
        name={name}
        value={values[name] || ""}
        onChange={(e) => field(name, e.target.value)}
      >
        <option value="">Select {label.toLowerCase()}</option>
        {list.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  );
  return (
    <Modal
      title={
        kind === "waste"
          ? "New waste report"
          : kind === "facility"
            ? "Register a facility"
            : "New facility inspection"
      }
      onClose={onClose}
      wide
    >
      <form ref={formRef} onSubmit={submit}>
        <div className="form-intro">
          <span className="pill">
            <ShieldCheck size={14} />
            Secure field record
          </span>
          <p>
            {kind === "facility"
              ? "Create a facility reference and assign a supervisor."
              : "Your name and report number are added automatically on submission. Text fields are saved as a draft on this device."}
          </p>
        </div>
        <section className="form-section">
          <div className="section-label">
            <span className="step-number">01</span>
            <div>
              <h3>
                {kind === "waste"
                  ? "Waste information"
                  : kind === "facility"
                    ? "Facility information"
                    : "Inspection details"}
              </h3>
              <p>Complete the details from your site visit.</p>
            </div>
          </div>
          <div className="form-grid">
            {kind === "waste" ? (
              <>
                {input("site", "Site Name")}
                {select("category", "Waste type", opts("waste", wasteTypes))}
                {input("quantity", "Estimated quantity", true, "number")}
                {select("unit", "Measurement unit", opts("unit", units))}
              </>
            ) : kind === "facility" ? (
              <>
                {input("name", "Facility name")}
                {select("structure_type", "Type of Structure", [...structureTypes])}
                {select(
                  "category",
                  "Facility category",
                  opts("facility", facilityCategories),
                )}
                {input("site", "Site Name")}
                {select("status", "Current status", opts("status", statuses))}
                <label>
                  Assigned supervisor
                  <select
                    value={values.assigned_supervisor || ""}
                    onChange={(e) =>
                      field("assigned_supervisor", e.target.value)
                    }
                  >
                    <option value="">Unassigned</option>
                    {users
                      .filter((u) => u.role === "supervisor" && u.is_active)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Latitude
                  <input
                    required
                    type="number"
                    step="any"
                    min="-90"
                    max="90"
                    value={values.latitude || ""}
                    onChange={(e) => field("latitude", e.target.value)}
                  />
                </label>
                <label>
                  Longitude
                  <input
                    required
                    type="number"
                    step="any"
                    min="-180"
                    max="180"
                    value={values.longitude || ""}
                    onChange={(e) => field("longitude", e.target.value)}
                  />
                </label>
                {input("remarks", "Remarks", false)}
              </>
            ) : (
              <>
                <label>
                  Authorized facility
                  <select
                    required
                    value={values.facility_id || ""}
                    onChange={(e) => field("facility_id", e.target.value)}
                  >
                    <option value="">Select a facility</option>
                    {facilities.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.number} · {f.name}
                      </option>
                    ))}
                  </select>
                </label>
                {select(
                  "condition",
                  "Facility condition",
                  opts("status", statuses),
                )}
                {input("site", "Site Name")}
                {select("structure_type", "Type of Structure", [...structureTypes])}
              </>
            )}
          </div>
          <p className="muted">Submission date and time are captured automatically when you submit.</p>
          <label>
            {kind === "inspection" ? "Observations" : "Description / remarks"}
            <textarea
              rows={3}
              required={kind === "inspection" || values.category === "Other"}
              maxLength={4000}
              value={values.description || ""}
              onChange={(e) => field("description", e.target.value)}
              placeholder="Describe what you observed on site…"
            />
          </label>
        </section>
        <PhotoInput photos={photos} setPhotos={setPhotos} onView={onPhoto} />
        {kind !== "facility" && (
          <section className="form-section">
            <div className="section-label">
              <span className="step-number">03</span>
              <div>
                <h3>Verify your location</h3>
                <p>
                  Capture GPS, open the map, and explicitly confirm your
                  position.
                </p>
              </div>
            </div>
            <div className="gps-controls">
              <Button
                type="button"
                variant="secondary"
                disabled={gpsBusy}
                onClick={capture}
              >
                {gpsBusy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <Navigation size={18} />
                )}{" "}
                {gpsBusy ? "Improving accuracy…" : gps && gps.accuracy > threshold ? "Try again" : "Get location"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!gps || gpsBusy}
                onClick={() => {
                  setMapViewed(false);
                  setConfirmed(false);
                  setMapOpen(true);
                }}
              >
                <MapPin size={18} />
                View Location
              </Button>
            </div>
            <p className="muted" role="status" aria-live="polite">
              {gpsBusy
                ? `Looking for a precise position for up to 60 seconds${gps ? ` · best accuracy so far: ±${Math.ceil(gps.accuracy)} m` : ""}. Allow precise location access when prompted.`
                : `Uses your device's location services with high accuracy enabled. Required accuracy: within ${threshold} m. Your browser controls GPS availability and permission.`}
            </p>
            {gpsHint && <p className="notice" role="status">{gpsHint}</p>}
            {gps && (
              <div className={`gps-state ${confirmed ? "verified" : ""}`}>
                <ShieldCheck size={22} />
                <div>
                  <strong>
                    {confirmed
                      ? "Location confirmed"
                      : gps.accuracy > threshold ? "Approximate location · better accuracy needed" : gps.id ? "Location captured · verification required" : "Location captured on this device"}
                  </strong>
                  <p>
                    {gps.latitude}, {gps.longitude} · ±
                    {Math.ceil(gps.accuracy)} m
                  </p>
                  <small>
                    {formatDate(gps.captured_at, timezone)} · expires after 5
                    minutes
                  </small>
                </div>
                {confirmed && <Check size={20} />}
              </div>
            )}
          </section>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <footer className="form-footer">
          <small>
            {kind === "facility"
              ? "Facility reference records can be managed by administrators."
              : "Submitted records are read-only for supervisors."}
          </small>
          <Button
            type="submit"
            disabled={
              busy ||
              !enabled ||
              photos.some((p) => p.busy) ||
              (kind !== "facility" &&
                (!confirmed || photos.filter((p) => p.id).length < 2))
            }
          >
            {busy
              ? "Saving…"
              : kind === "facility"
                ? "Register facility"
                : "Submit report"}
            <ArrowUpRight size={18} />
          </Button>
        </footer>
      </form>
      {mapOpen && gps && (
        <Modal
          title="Verify your captured position"
          onClose={() => setMapOpen(false)}
          wide
        >
          <LocationMap records={[gps]} onReady={() => void mapReady()} />
          <div className="map-meta">
            <strong>
              {gps.latitude}, {gps.longitude}
            </strong>
            <p>
              Accuracy ±{Math.round(gps.accuracy)} m ·{" "}
              {formatDate(gps.captured_at, timezone)}
            </p>
            <a
              href={`https://www.google.com/maps?q=${gps.latitude},${gps.longitude}`}
              target="_blank"
              rel="noreferrer"
            >
              Open in Google Maps ↗
            </a>
          </div>
          <p className="muted">
            Check the marker against your actual position. GPS shows
            device-reported accuracy. Map tiles require an internet connection.
          </p>
          <div className="form-footer">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setMapOpen(false);
                void capture();
              }}
            >
              Re-Capture Location
            </Button>
            <Button
              type="button"
              disabled={!mapViewed || busy || gps.accuracy > threshold}
              onClick={confirm}
            >
              {mapViewed ? "Confirm This Location" : "Waiting for map…"}
              <Check size={18} />
            </Button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
