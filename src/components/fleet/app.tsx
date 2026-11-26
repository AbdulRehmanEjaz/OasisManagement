"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Car,
  Plus,
  RefreshCw,
  LogOut,
  Pencil,
  Trash2,
  Eye,
  Fuel,
  Wallet,
  CreditCard,
} from "lucide-react";
import type { FleetProfile, FleetVehicle } from "@/lib/fleet/store";
import Modal from "../modal";
import { Button } from "../ui/button";
import FleetImport from "./import";

type FormState = {
  vehicle_name: string;
  model: string;
  plate_number: string;
  fuel_type: string;
  owner: string;
  monthly_rent_type: "N/A" | "amount";
  monthly_rent: string;
  driver_name: string;
  driver_id_no: string;
  project_number: string;
  project_location: string;
  fuel_card_no: string;
  fuel_card_limit: string;
  phone_number: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  vehicle_name: "",
  model: "",
  plate_number: "",
  fuel_type: "",
  owner: "",
  monthly_rent_type: "N/A",
  monthly_rent: "",
  driver_name: "",
  driver_id_no: "",
  project_number: "",
  project_location: "",
  fuel_card_no: "",
  fuel_card_limit: "",
  phone_number: "",
  notes: "",
};

function toFormState(v?: FleetVehicle): FormState {
  if (!v) return { ...EMPTY_FORM };
  return {
    vehicle_name: v.vehicle_name || "",
    model: v.model || "",
    plate_number: v.plate_number || "",
    fuel_type: v.fuel_type || "",
    owner: v.owner || "",
    monthly_rent_type: v.monthly_rent_type === "amount" ? "amount" : "N/A",
    monthly_rent:
      v.monthly_rent_type === "amount" && v.monthly_rent !== null
        ? String(v.monthly_rent)
        : "",
    driver_name: v.driver_name || "",
    driver_id_no: v.driver_id_no || "",
    project_number: v.project_number || "",
    project_location: v.project_location || "",
    fuel_card_no: v.fuel_card_no || "",
    fuel_card_limit:
      v.fuel_card_limit !== null && v.fuel_card_limit !== undefined
        ? String(v.fuel_card_limit)
        : "",
    phone_number: v.phone_number || "",
    notes: v.notes || "",
  };
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

function formatRent(v: FleetVehicle) {
  if (v.monthly_rent_type === "N/A" || v.monthly_rent === null) return "N/A";
  return `${formatNumber(v.monthly_rent)} SAR`;
}

function formatLimit(limit: number | null) {
  if (limit === null || limit === undefined) return "—";
  return `${formatNumber(limit)} SAR`;
}

export default function FleetApp({ profile }: { profile: FleetProfile }) {
  const admin = profile.role === "admin";
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [search, setSearch] = useState("");
  const [fuelFilter, setFuelFilter] = useState("");
  const [rentFilter, setRentFilter] = useState("");
  const [page, setPage] = useState(0);

  const [editing, setEditing] = useState<FleetVehicle | "new" | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const [detail, setDetail] = useState<FleetVehicle | null>(null);
  const [deleting, setDeleting] = useState<FleetVehicle | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/fleet", {
        cache: "no-store",
        signal,
      });
      if (response.status === 401) {
        location.href = "/fleet/login";
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load vehicles.");
      if (!signal?.aborted) {
        setVehicles(data.vehicles || []);
        setError("");
      }
    } catch (e) {
      if (!signal?.aborted) setError((e as Error).message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    void load(abort.signal);
    return () => abort.abort();
  }, [load]);

  const fuelTypes = useMemo(() => {
    const set = new Set<string>();
    for (const v of vehicles) {
      if (v.fuel_type) set.add(v.fuel_type);
    }
    return Array.from(set).sort();
  }, [vehicles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (fuelFilter && v.fuel_type !== fuelFilter) return false;
      if (rentFilter === "rented" && v.monthly_rent_type !== "amount") return false;
      if (rentFilter === "na" && v.monthly_rent_type !== "N/A") return false;
      if (!q) return true;
      const hay = [
        v.vehicle_name,
        v.model,
        v.plate_number,
        v.fuel_type,
        v.owner,
        v.driver_name,
        v.driver_id_no,
        v.project_number,
        v.project_location,
        v.fuel_card_no,
        v.phone_number,
        v.notes,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [vehicles, search, fuelFilter, rentFilter]);

  const stats = useMemo(() => {
    let rentedCount = 0;
    let totalRent = 0;
    let totalFuelLimit = 0;
    for (const v of vehicles) {
      if (v.monthly_rent_type === "amount" && v.monthly_rent !== null) {
        rentedCount += 1;
        totalRent += Number(v.monthly_rent) || 0;
      }
      if (v.fuel_card_limit !== null && v.fuel_card_limit !== undefined) {
        totalFuelLimit += Number(v.fuel_card_limit) || 0;
      }
    }
    return { total: vehicles.length, rentedCount, totalRent, totalFuelLimit };
  }, [vehicles]);

  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const display = filtered.slice(
    currentPage * pageSize,
    currentPage * pageSize + pageSize,
  );

  function openNew() {
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setEditing("new");
  }

  function openEdit(v: FleetVehicle) {
    setForm(toFormState(v));
    setFormError("");
    setEditing(v);
  }

  async function saveVehicle(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      const payload = {
        action: editing === "new" ? "create" : "update",
        id: editing && editing !== "new" ? editing.id : undefined,
        vehicle: {
          vehicle_name: form.vehicle_name,
          model: form.model,
          plate_number: form.plate_number,
          fuel_type: form.fuel_type,
          owner: form.owner,
          monthly_rent_type: form.monthly_rent_type,
          monthly_rent:
            form.monthly_rent_type === "N/A"
              ? null
              : form.monthly_rent === ""
                ? null
                : Number(form.monthly_rent),
          driver_name: form.driver_name,
          driver_id_no: form.driver_id_no,
          project_number: form.project_number,
          project_location: form.project_location,
          fuel_card_no: form.fuel_card_no,
          fuel_card_limit:
            form.fuel_card_limit === "" ? null : Number(form.fuel_card_limit),
          phone_number: form.phone_number,
          notes: form.notes,
        },
      };
      const response = await fetch("/api/fleet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save vehicle.");
      setEditing(null);
      setSaved(
        editing === "new"
          ? "Vehicle record added."
          : "Vehicle record updated.",
      );
      await load();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/fleet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: deleting.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to delete vehicle.");
      setDeleting(null);
      setSaved("Vehicle record removed.");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="kpi-app">
      <header className="kpi-app-header">
        <a href="/" className="kpi-brand" aria-label="Back to Operations Hub">
          <img
            src="/branding/advacon-alula-oasis-transparent.png"
            width="300"
            height="100"
            alt="ADVACON and AlUla Oasis Management"
          />
        </a>
        <div className="kpi-app-title">
          <span>OASIS FLEET OPERATIONS</span>
          <h1>Vehicles Management</h1>
          <p>
            Vehicle registry, driver assignments, monthly rent &amp; fuel card
            limits
          </p>
        </div>
        <div className="kpi-account">
          <strong>{admin ? "Admin panel" : "Viewer panel"}</strong>
          <small>{profile.full_name}</small>
          <button
            aria-label="Sign out of Vehicles Management"
            onClick={async () => {
              try {
                await fetch("/api/fleet/auth", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "logout" }),
                });
                location.href = "/fleet/login";
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <LogOut size={17} />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      <nav className="kpi-app-nav" aria-label="Vehicles panel actions">
        <button aria-current="page" type="button">
          <Car size={18} />
          Fleet Registry
        </button>
        <div className="kpi-nav-actions">
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Refresh vehicles"
          >
            <RefreshCw size={17} />
          </button>
          {admin && <FleetImport onImported={load} />}
          {admin && (
            <button
              type="button"
              className="kpi-new-report"
              onClick={openNew}
            >
              <Plus size={18} />
              Add Vehicle
            </button>
          )}
        </div>
      </nav>

      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="notice" role="status">
          {saved}
          <button
            className="kpi-notice-dismiss"
            aria-label="Dismiss saved message"
            onClick={() => setSaved("")}
          >
            ×
          </button>
        </p>
      )}

      {loading ? (
        <div className="kpi-loading" role="status">
          Loading vehicles…
        </div>
      ) : (
        <>
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              gap: "14px",
              marginBottom: "18px",
            }}
            aria-label="Fleet summary"
          >
            <article className="kpi-report-list" style={{ margin: 0, padding: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--muted)", fontSize: "13px", fontWeight: 600 }}>
                <Car size={16} /> Total Vehicles
              </div>
              <div style={{ fontSize: "28px", fontWeight: 700, marginTop: "6px" }}>
                {formatNumber(stats.total)}
              </div>
            </article>
            <article className="kpi-report-list" style={{ margin: 0, padding: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--muted)", fontSize: "13px", fontWeight: 600 }}>
                <Wallet size={16} /> Rented Vehicles
              </div>
              <div style={{ fontSize: "28px", fontWeight: 700, marginTop: "6px" }}>
                {formatNumber(stats.rentedCount)}
              </div>
            </article>
            <article className="kpi-report-list" style={{ margin: 0, padding: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--muted)", fontSize: "13px", fontWeight: 600 }}>
                <Fuel size={16} /> Total Monthly Rent
              </div>
              <div style={{ fontSize: "28px", fontWeight: 700, marginTop: "6px" }}>
                {formatNumber(stats.totalRent)} <span style={{ fontSize: "14px", fontWeight: 500 }}>SAR</span>
              </div>
            </article>
            <article className="kpi-report-list" style={{ margin: 0, padding: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--muted)", fontSize: "13px", fontWeight: 600 }}>
                <CreditCard size={16} /> Total Fuel Card Limit
              </div>
              <div style={{ fontSize: "28px", fontWeight: 700, marginTop: "6px" }}>
                {formatNumber(stats.totalFuelLimit)} <span style={{ fontSize: "14px", fontWeight: 500 }}>SAR</span>
              </div>
            </article>
          </section>

          <section className="kpi-report-list">
            <div className="kpi-list-heading">
              <div>
                <h2>Vehicle Records</h2>
                <p>
                  {filtered.length} vehicle{filtered.length === 1 ? "" : "s"}
                  {filtered.length !== vehicles.length
                    ? ` of ${vehicles.length} total`
                    : ""}
                </p>
              </div>
              <label>
                Search vehicles
                <input
                  type="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  placeholder="Plate, name, driver, project, fuel card…"
                />
              </label>
            </div>

            <div className="kpi-report-filters">
              <label>
                Fuel Type
                <select
                  value={fuelFilter}
                  onChange={(e) => {
                    setFuelFilter(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="">All fuel types</option>
                  {fuelTypes.map((ft) => (
                    <option key={ft} value={ft}>
                      {ft}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Monthly Rent
                <select
                  value={rentFilter}
                  onChange={(e) => {
                    setRentFilter(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="">All</option>
                  <option value="rented">Rented (Amount)</option>
                  <option value="na">N/A</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setFuelFilter("");
                  setRentFilter("");
                  setPage(0);
                }}
              >
                Clear filters
              </button>
            </div>

            <div className="kpi-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Vehicle &amp; Model</th>
                    <th>Plate Number</th>
                    <th>Fuel Type</th>
                    <th>Owner</th>
                    <th>Monthly Rent</th>
                    <th>Driver</th>
                    <th>Project</th>
                    <th>Fuel Card &amp; Limit</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {display.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <strong>{v.vehicle_name}</strong>
                        {v.model && (
                          <small style={{ display: "block", color: "var(--muted)" }}>
                            {v.model}
                          </small>
                        )}
                      </td>
                      <td>{v.plate_number}</td>
                      <td>{v.fuel_type || "—"}</td>
                      <td>{v.owner || "—"}</td>
                      <td>{formatRent(v)}</td>
                      <td>
                        {v.driver_name || "—"}
                        {v.phone_number && (
                          <small style={{ display: "block", color: "var(--muted)" }}>
                            {v.phone_number}
                          </small>
                        )}
                      </td>
                      <td>
                        {v.project_number || "—"}
                        {v.project_location && (
                          <small style={{ display: "block", color: "var(--muted)" }}>
                            {v.project_location}
                          </small>
                        )}
                      </td>
                      <td>
                        {v.fuel_card_no || "—"}
                        <small style={{ display: "block", color: "var(--muted)" }}>
                          Limit: {formatLimit(v.fuel_card_limit)}
                        </small>
                      </td>
                      <td>
                        <div className="kpi-row-actions">
                          <button
                            aria-label={`View ${v.vehicle_name}`}
                            onClick={() => setDetail(v)}
                          >
                            <Eye size={17} />
                          </button>
                          {admin && (
                            <>
                              <button
                                aria-label={`Edit ${v.vehicle_name}`}
                                onClick={() => openEdit(v)}
                              >
                                <Pencil size={17} />
                              </button>
                              <button
                                aria-label={`Delete ${v.vehicle_name}`}
                                onClick={() => setDeleting(v)}
                              >
                                <Trash2 size={17} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!filtered.length && (
              <div className="kpi-empty">
                <Car size={32} />
                <h3>
                  {vehicles.length
                    ? "No matching vehicles"
                    : "No vehicles added yet"}
                </h3>
                <p>
                  {admin
                    ? "Click Add Vehicle to register your first vehicle."
                    : "Vehicle records added by Admin will appear here."}
                </p>
              </div>
            )}

            <footer className="kpi-list-footer">
              <button
                disabled={currentPage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </button>
              <span>
                Page {currentPage + 1} of {pageCount}
              </span>
              <button
                disabled={currentPage + 1 >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </footer>
          </section>
        </>
      )}

      {editing && (
        <Modal
          title={editing === "new" ? "Add Vehicle" : "Edit Vehicle"}
          wide
          onClose={() => !busy && setEditing(null)}
        >
          <form onSubmit={saveVehicle}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "12px",
              }}
            >
              <label>
                Name of Vehicle *
                <input
                  required
                  value={form.vehicle_name}
                  onChange={(e) =>
                    setForm({ ...form, vehicle_name: e.target.value })
                  }
                  placeholder="e.g. Toyota Hilux"
                />
              </label>
              <label>
                Model
                <input
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  placeholder="e.g. 2024 Double Cabin"
                />
              </label>
              <label>
                Plate Number *
                <input
                  required
                  value={form.plate_number}
                  onChange={(e) =>
                    setForm({ ...form, plate_number: e.target.value })
                  }
                  placeholder="e.g. ABC 1234"
                />
              </label>
              <label>
                Fuel Type
                <select
                  value={form.fuel_type || "N/A"}
                  onChange={(e) =>
                    setForm({ ...form, fuel_type: e.target.value })
                  }
                >
                  <option value="N/A">N/A</option>
                  <option value="Diesel">Diesel</option>
                  <option value="Petrol">Petrol</option>
                </select>
              </label>
              <label>
                Owner
                <input
                  value={form.owner}
                  onChange={(e) => setForm({ ...form, owner: e.target.value })}
                  placeholder="Company or rental owner"
                />
              </label>
              <label>
                Monthly Rent
                <select
                  value={form.monthly_rent_type}
                  onChange={(e) => {
                    const nextType = e.target.value as "N/A" | "amount";
                    setForm({
                      ...form,
                      monthly_rent_type: nextType,
                      monthly_rent: nextType === "N/A" ? "" : form.monthly_rent,
                    });
                  }}
                >
                  <option value="N/A">N/A</option>
                  <option value="amount">Monthly Amount (SAR)</option>
                </select>
              </label>
              {form.monthly_rent_type === "amount" && (
                <label>
                  Monthly Rent Amount (SAR) *
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={form.monthly_rent}
                    onChange={(e) =>
                      setForm({ ...form, monthly_rent: e.target.value })
                    }
                    placeholder="e.g. 3500"
                  />
                </label>
              )}
              <label>
                Driver&apos;s Name
                <input
                  value={form.driver_name}
                  onChange={(e) =>
                    setForm({ ...form, driver_name: e.target.value })
                  }
                  placeholder="Full name"
                />
              </label>
              <label>
                Driver&apos;s ID No
                <input
                  value={form.driver_id_no}
                  onChange={(e) =>
                    setForm({ ...form, driver_id_no: e.target.value })
                  }
                  placeholder="Iqama / National ID"
                />
              </label>
              <label>
                Project Number
                <input
                  value={form.project_number}
                  onChange={(e) =>
                    setForm({ ...form, project_number: e.target.value })
                  }
                  placeholder="e.g. PRJ-2026-01"
                />
              </label>
              <label>
                Project Location
                <input
                  value={form.project_location}
                  onChange={(e) =>
                    setForm({ ...form, project_location: e.target.value })
                  }
                  placeholder="e.g. AlUla Oasis North"
                />
              </label>
              <label>
                Fuel Card No
                <input
                  value={form.fuel_card_no}
                  onChange={(e) =>
                    setForm({ ...form, fuel_card_no: e.target.value })
                  }
                  placeholder="Card number"
                />
              </label>
              <label>
                Fuel Card Current Limit (SAR)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.fuel_card_limit}
                  onChange={(e) =>
                    setForm({ ...form, fuel_card_limit: e.target.value })
                  }
                  placeholder="e.g. 1500"
                />
              </label>
              <label>
                Phone Number
                <input
                  type="tel"
                  value={form.phone_number}
                  onChange={(e) =>
                    setForm({ ...form, phone_number: e.target.value })
                  }
                  placeholder="e.g. 05XXXXXXXX"
                />
              </label>
            </div>
            <label>
              Notes
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Additional vehicle notes, maintenance status, etc."
              />
            </label>
            {formError && (
              <p className="notice error" role="alert">
                {formError}
              </p>
            )}
            <div className="form-footer">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy
                  ? "Saving…"
                  : editing === "new"
                    ? "Add Vehicle"
                    : "Save Changes"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {detail && (
        <Modal
          title={detail.vehicle_name}
          wide
          onClose={() => setDetail(null)}
        >
          <div className="kpi-detail-meta">
            <strong>{detail.plate_number}</strong>
            {detail.model && <span>{detail.model}</span>}
            {detail.fuel_type && <span>{detail.fuel_type}</span>}
          </div>
          <dl className="kpi-detail-grid">
            <div>
              <dt>Name of Vehicle</dt>
              <dd>{detail.vehicle_name}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{detail.model || "—"}</dd>
            </div>
            <div>
              <dt>Plate Number</dt>
              <dd>{detail.plate_number}</dd>
            </div>
            <div>
              <dt>Fuel Type</dt>
              <dd>{detail.fuel_type || "—"}</dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>{detail.owner || "—"}</dd>
            </div>
            <div>
              <dt>Monthly Rent</dt>
              <dd>{formatRent(detail)}</dd>
            </div>
            <div>
              <dt>Driver&apos;s Name</dt>
              <dd>{detail.driver_name || "—"}</dd>
            </div>
            <div>
              <dt>Driver&apos;s ID No</dt>
              <dd>{detail.driver_id_no || "—"}</dd>
            </div>
            <div>
              <dt>Project Number</dt>
              <dd>{detail.project_number || "—"}</dd>
            </div>
            <div>
              <dt>Project Location</dt>
              <dd>{detail.project_location || "—"}</dd>
            </div>
            <div>
              <dt>Fuel Card No</dt>
              <dd>{detail.fuel_card_no || "—"}</dd>
            </div>
            <div>
              <dt>Fuel Card Current Limit</dt>
              <dd>{formatLimit(detail.fuel_card_limit)}</dd>
            </div>
            <div>
              <dt>Phone Number</dt>
              <dd>{detail.phone_number || "—"}</dd>
            </div>
          </dl>
          <p>{detail.notes || "No notes."}</p>
          <p className="muted">
            Created: {detail.created_at}
            <br />
            Last updated: {detail.updated_at}
          </p>
          {admin && (
            <Button
              onClick={() => {
                openEdit(detail);
                setDetail(null);
              }}
            >
              Edit vehicle
            </Button>
          )}
        </Modal>
      )}

      {deleting && (
        <Modal
          title="Delete vehicle record?"
          onClose={() => !busy && setDeleting(null)}
        >
          <p>
            Remove <strong>{deleting.vehicle_name}</strong> (
            {deleting.plate_number}) from Vehicles Management?
          </p>
          <div className="form-footer">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void confirmDelete()}
            >
              {busy ? "Deleting…" : "Delete vehicle"}
            </Button>
          </div>
        </Modal>
      )}

      <footer className="kpi-app-footer">
        ©AbdulRehman Ejaz - ADVACON Co. Ltd.®
      </footer>
    </main>
  );
}
