"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  Eye,
  MapPin,
  ShieldCheck,
  Pencil,
  Trash2,
  Archive,
  Check,
  History,
} from "lucide-react";
import { api, read, formatDate, type Row } from "@/lib/client";
import Modal from "./modal";
import { Button } from "./ui/button";
const LocationMap = dynamic(() => import("./map"), {
  ssr: false,
  loading: () => <div className="map-loading">Loading map…</div>,
});
export default function RecordDetail({
  record: r,
  type,
  admin,
  viewer = false,
  users,
  options,
  timezone,
  onClose,
  onPhoto,
  onRefresh,
}: {
  record: Row;
  type: string;
  admin: boolean;
  viewer?: boolean;
  users: Row[];
  options: Row[];
  timezone: string;
  onClose: () => void;
  onPhoto: (urls: string[], index: number) => void;
  onRefresh: () => void;
}) {
  const [edit, setEdit] = useState(false),
    [deleting, setDeleting] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [history, setHistory] = useState<Row[]>([]),
    [historyPage, setHistoryPage] = useState(0),
    [historyCount, setHistoryCount] = useState(0),
    [audit, setAudit] = useState<Row[]>([]),
    [delivery, setDelivery] = useState(""),
    [values, setValues] = useState<Record<string, any>>({ ...r });
  const photos: Row[] =
    r.waste_report_photos ||
    r.facility_photos ||
    r.facility_inspection_photos ||
    [];
  useEffect(() => {
    if (type === "facilities")
      read("inspections", { facility: r.id, page: String(historyPage) })
        .then((d) => {
          setHistory(d.data);
          setHistoryCount(d.count);
        })
        .catch((e) => setError(e.message));
    else if (!viewer)
      read("deliveries", { record: r.id })
        .then((d) => setDelivery(d.data[0]?.status || "pending"))
        .catch((e) => setError(e.message));
    if (admin)
      read("audit", { record: r.id })
        .then((d) => setAudit(d.data))
        .catch((e) => setError(e.message));
  }, [r.id, type, admin, viewer, historyPage]);
  function field(name: string, value: string) {
    setValues((v) => ({ ...v, [name]: value }));
  }
  const input = (name: string, label: string, numeric = false) => (
    <label>
      {label}
      <input
        required
        type={numeric ? "number" : "text"}
        step={numeric ? "any" : undefined}
        value={values[name] ?? ""}
        onChange={(e) => field(name, e.target.value)}
      />
    </label>
  );
  const select = (name: string, label: string, kind: string) => (
    <label>
      {label}
      <select
        required
        value={values[name] || ""}
        onChange={(e) => field(name, e.target.value)}
      >
        {Array.from(
          new Set([
            r[name],
            ...options
              .filter((o) => o.kind === kind && o.is_active)
              .map((o) => o.label),
          ]),
        ).map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  );
  return (
    <Modal
      title={`${r.number} · ${type === "facilities" ? "Facility" : "Report details"}`}
      onClose={onClose}
      wide
    >
      <div className="detail-heading">
        <div>
          <span className="eyebrow">
            {type === "waste"
              ? "OASIS WASTE TRACKING"
              : "ONSITE FACILITIES TRACKING"}
          </span>
          <h2>{r.name || r.category || r.facilities?.name || r.number}</h2>
          <p>
            {formatDate(r.created_at, timezone)}
            {r.profiles?.full_name ? ` · ${r.profiles.full_name}` : ""}
          </p>
        </div>
        {admin && (
          <div className="detail-actions">
            <Button variant="outline" size="sm" onClick={() => setEdit(!edit)}>
              <Pencil size={16} />
              {edit ? "Cancel edit" : "Edit"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleting(true)}
            >
              {type === "facilities" ? (
                <Archive size={16} />
              ) : (
                <Trash2 size={16} />
              )}{" "}
              {type === "facilities" ? "Archive" : "Delete"}
            </Button>
          </div>
        )}
      </div>
      {edit ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const patch =
                type === "facilities"
                  ? {
                      name: values.name,
                      category: values.category,
                      site: values.site,
                      description: values.description,
                      status: values.status,
                      assigned_supervisor: values.assigned_supervisor || null,
                      remarks: values.remarks,
                      latitude: Number(values.latitude),
                      longitude: Number(values.longitude),
                    }
                  : type === "waste"
                    ? {
                        site: values.site,
                        category: values.category,
                        quantity: Number(values.quantity),
                        unit: values.unit,
                        description: values.description,
                      }
                    : {
                        condition: values.condition,
                        description: values.description,
                      };
              await api("record.update", { type, id: r.id, patch });
              onRefresh();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-grid">
            {type === "facilities" ? (
              <>
                {input("name", "Facility name")}
                {select("category", "Category", "facility")}
                {input("site", "Project / site")}
                {select("status", "Status", "status")}
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
                      .filter((u) => u.is_active && u.role === "supervisor")
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name}
                        </option>
                      ))}
                  </select>
                </label>
                {input("latitude", "Latitude", true)}
                {input("longitude", "Longitude", true)}
                {input("remarks", "Remarks")}
              </>
            ) : type === "waste" ? (
              <>
                {input("site", "Project / site name")}
                {select("category", "Waste type", "waste")}
                {input("quantity", "Quantity", true)}
                {select("unit", "Unit", "unit")}
              </>
            ) : (
              select("condition", "Condition", "status")
            )}
          </div>
          <label>
            Description
            <textarea
              value={values.description || ""}
              onChange={(e) => field("description", e.target.value)}
              maxLength={4000}
            />
          </label>
          <Button disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
            <Check size={17} />
          </Button>
        </form>
      ) : (
        <>
          <dl className="detail-grid">
            {Object.entries(
              type === "facilities"
                ? {
                    "Facility number": r.number,
                    "Project / site": r.site,
                    Category: r.category,
                    Status: r.status,
                    "Assigned supervisor":
                      users.find((u) => u.id === r.assigned_supervisor)
                        ?.full_name || "Assigned facility",
                    Remarks: r.remarks || "—",
                  }
                : type === "waste"
                  ? {
                      "Report number": r.number,
                      Site: r.site || "—",
                      "Waste type": r.category,
                      Quantity: `${r.quantity} ${r.unit}`,
                      Supervisor: r.profiles?.full_name || "—",
                      "Manager email": delivery || "Loading…",
                    }
                  : {
                      "Inspection number": r.number,
                      Facility: `${r.facilities?.number || ""} ${r.facilities?.name || "Reference unavailable"}`,
                      Condition: r.condition,
                      "Inspection date": r.inspection_date,
                      Supervisor: r.profiles?.full_name || "—",
                      "Manager email": delivery || "Loading…",
                    },
            )
              .filter(
                ([k]) =>
                  !viewer ||
                  ![
                    "Supervisor",
                    "Assigned supervisor",
                    "Manager email",
                  ].includes(k),
              )
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{String(v)}</dd>
                </div>
              ))}
          </dl>
          <div className="detail-description">
            <h3>{type === "inspections" ? "Observations" : "Description"}</h3>
            <p>{r.description || "No remarks provided."}</p>
          </div>
        </>
      )}
      {photos.length > 0 && (
        <section className="detail-photos">
          <h3>
            <Eye size={18} />
            Site photographs
          </h3>
          <div>
            {photos.map((p, i) => (
              <button
                key={p.id}
                onClick={() =>
                  onPhoto(
                    photos.map((p) => p.url),
                    i,
                  )
                }
                aria-label={`View photograph ${i + 1}`}
              >
                <img src={p.url} alt={`Site photograph ${i + 1}`} />
                <span>
                  <Eye size={18} />
                  View photo
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      <section className="detail-location">
        <h3>
          <MapPin size={18} />
          Recorded location
        </h3>
        <LocationMap records={[r]} />
        <p className="coordinate-text">
          {r.latitude}, {r.longitude}
        </p>
        {type !== "facilities" && (
          <div className="gps-state verified">
            <ShieldCheck size={22} />
            <div>
              <strong>
                GPS confirmed · ±{Math.round(r.gps_accuracy_meters)} m
              </strong>
              <p>Captured {formatDate(r.gps_captured_at, timezone)}</p>
              <small>
                Confirmed {formatDate(r.location_confirmed_at, timezone)}
              </small>
            </div>
          </div>
        )}
      </section>
      {type === "facilities" && (
        <section className="detail-history">
          <h3>
            <History size={18} />
            Inspection history ({historyCount})
          </h3>
          {history.length ? (
            history.map((i) => (
              <article key={i.id}>
                <strong>
                  {i.number} · {i.condition}
                </strong>
                <small>
                  {formatDate(i.created_at, timezone)}
                  {!viewer && ` · ${i.profiles?.full_name || "Supervisor"}`}
                </small>
                <p>{i.description}</p>
                <div className="history-photos">
                  {i.facility_inspection_photos?.map((p: Row, n: number) => (
                    <Button
                      key={p.id}
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        onPhoto(
                          i.facility_inspection_photos.map((p: Row) => p.url),
                          n,
                        )
                      }
                    >
                      <Eye size={15} />
                      Photo {n + 1}
                    </Button>
                  ))}
                </div>
                <p>
                  GPS: {i.latitude}, {i.longitude} · ±{i.gps_accuracy_meters} m
                  · Confirmed {formatDate(i.location_confirmed_at, timezone)}
                </p>
              </article>
            ))
          ) : (
            <p className="muted">No inspections visible for this facility.</p>
          )}
          <div className="form-footer">
            <Button
              variant="ghost"
              disabled={!historyPage}
              onClick={() => setHistoryPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              disabled={(historyPage + 1) * 12 >= historyCount}
              onClick={() => setHistoryPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </section>
      )}
      {admin && (
        <section className="detail-history">
          <h3>
            <History size={18} />
            Audit trail
          </h3>
          {audit.map((a) => (
            <p key={a.id}>
              <strong>{a.action}</strong> · {formatDate(a.created_at, timezone)}
              <small>Actor: {a.actor_id}</small>
            </p>
          ))}
        </section>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {deleting && (
        <Modal
          title={
            type === "facilities"
              ? "Archive this facility?"
              : "Delete this report?"
          }
          onClose={() => setDeleting(false)}
        >
          <p>
            {type === "facilities"
              ? "The facility will be removed from active lists. Its inspection history will be preserved."
              : "This permanently removes the report and its photo references. An audit entry will remain."}
          </p>
          <div className="form-footer">
            <Button variant="secondary" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("record.delete", { type, id: r.id });
                  onRefresh();
                } catch (e) {
                  setError((e as Error).message);
                  setDeleting(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy
                ? "Please wait…"
                : type === "facilities"
                  ? "Archive facility"
                  : "Delete report"}
            </Button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
