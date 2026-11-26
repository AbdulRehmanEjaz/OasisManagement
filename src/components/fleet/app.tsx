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
  Download,
  Package,
  UserCheck,
} from "lucide-react";
import type {
  FleetFuelCard,
  FleetProfile,
  FleetVehicle,
} from "@/lib/fleet/store";
import Modal from "../modal";
import { Button } from "../ui/button";
import FleetImport from "./import";

type Tab = "vehicles" | "cards";

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

type CardFormState = {
  card_no: string;
  card_limit: string;
  assign_mode: "Inventory" | "Driver";
  driver_name: string;
  assigned_id_no: string;
  notes: string;
};

type UnifiedFuelCard = {
  key: string;
  source: "vehicle" | "standalone";
  card_no: string;
  card_limit: number | null;
  assigned_to: string;
  assigned_id_no: string;
  vehicle_label: string;
  project_label: string;
  status: "Assigned" | "Inventory";
  notes: string;
  rawCard?: FleetFuelCard;
};

const EMPTY_FORM: FormState = {
  vehicle_name: "",
  model: "",
  plate_number: "",
  fuel_type: "N/A",
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

const EMPTY_CARD_FORM: CardFormState = {
  card_no: "",
  card_limit: "",
  assign_mode: "Inventory",
  driver_name: "",
  assigned_id_no: "",
  notes: "",
};

function toFormState(v?: FleetVehicle): FormState {
  if (!v) return { ...EMPTY_FORM };
  return {
    vehicle_name: v.vehicle_name || "",
    model: v.model || "",
    plate_number: v.plate_number || "",
    fuel_type: v.fuel_type || "N/A",
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

function toCardFormState(c?: FleetFuelCard): CardFormState {
  if (!c) return { ...EMPTY_CARD_FORM };
  const isInventory = c.assigned_to.toLowerCase() === "inventory";
  return {
    card_no: c.card_no || "",
    card_limit:
      c.card_limit !== null && c.card_limit !== undefined
        ? String(c.card_limit)
        : "",
    assign_mode: isInventory ? "Inventory" : "Driver",
    driver_name: isInventory ? "" : c.assigned_to,
    assigned_id_no: isInventory ? "" : c.assigned_id_no || "",
    notes: c.notes || "",
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

function fuelBadgeClass(fuel: string) {
  const f = (fuel || "").toLowerCase();
  if (f === "diesel") return "fleet-badge fleet-badge-diesel";
  if (f === "petrol") return "fleet-badge fleet-badge-petrol";
  return "fleet-badge fleet-badge-na";
}

export default function FleetApp({ profile }: { profile: FleetProfile }) {
  const admin = profile.role === "admin";
  const [tab, setTab] = useState<Tab>("vehicles");
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [standaloneCards, setStandaloneCards] = useState<FleetFuelCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  // Vehicle filters & modals
  const [search, setSearch] = useState("");
  const [fuelFilter, setFuelFilter] = useState("");
  const [rentFilter, setRentFilter] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<FleetVehicle | "new" | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [formError, setFormError] = useState("");
  const [detail, setDetail] = useState<FleetVehicle | null>(null);
  const [deleting, setDeleting] = useState<FleetVehicle | null>(null);

  // Fuel Card filters & modals
  const [cardSearch, setCardSearch] = useState("");
  const [cardStatusFilter, setCardStatusFilter] = useState("");
  const [cardPage, setCardPage] = useState(0);
  const [editingCard, setEditingCard] = useState<FleetFuelCard | "new" | null>(
    null,
  );
  const [cardForm, setCardForm] = useState<CardFormState>({
    ...EMPTY_CARD_FORM,
  });
  const [cardFormError, setCardFormError] = useState("");
  const [deletingCard, setDeletingCard] = useState<FleetFuelCard | null>(null);

  const [busy, setBusy] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const [vRes, cRes] = await Promise.all([
        fetch("/api/fleet", { cache: "no-store", signal }),
        fetch("/api/fleet/cards", { cache: "no-store", signal }),
      ]);
      if (vRes.status === 401 || cRes.status === 401) {
        location.href = "/fleet/login";
        return;
      }
      const [vData, cData] = await Promise.all([vRes.json(), cRes.json()]);
      if (!vRes.ok) throw new Error(vData.error || "Failed to load vehicles.");
      if (!cRes.ok) throw new Error(cData.error || "Failed to load fuel cards.");
      if (!signal?.aborted) {
        setVehicles(vData.vehicles || []);
        setStandaloneCards(cData.cards || []);
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
      if (rentFilter === "rented" && v.monthly_rent_type !== "amount")
        return false;
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

  // Unified fuel cards list (assigned via vehicles + standalone/inventory cards)
  const allFuelCards = useMemo<UnifiedFuelCard[]>(() => {
    const list: UnifiedFuelCard[] = [];
    for (const v of vehicles) {
      const cardNo = (v.fuel_card_no || "").trim();
      if (!cardNo || /^(-|—|n\/?a)$/i.test(cardNo)) continue;
      list.push({
        key: `v-${v.id}`,
        source: "vehicle",
        card_no: cardNo,
        card_limit: v.fuel_card_limit,
        assigned_to: v.driver_name || v.vehicle_name,
        assigned_id_no: v.driver_id_no || "",
        vehicle_label: [v.vehicle_name, v.plate_number]
          .filter((x) => x && x !== "-")
          .join(" · "),
        project_label: [v.project_number, v.project_location]
          .filter(Boolean)
          .join(" · "),
        status: "Assigned",
        notes: v.notes || "",
      });
    }
    for (const c of standaloneCards) {
      const isInv = c.assigned_to.toLowerCase() === "inventory";
      list.push({
        key: `c-${c.id}`,
        source: "standalone",
        card_no: c.card_no,
        card_limit: c.card_limit,
        assigned_to: isInv ? "Inventory" : c.assigned_to,
        assigned_id_no: isInv ? "" : c.assigned_id_no || "",
        vehicle_label: isInv ? "Unused · In Inventory" : "Standalone Card",
        project_label: "",
        status: isInv ? "Inventory" : "Assigned",
        notes: c.notes || "",
        rawCard: c,
      });
    }
    return list;
  }, [vehicles, standaloneCards]);

  const cardStats = useMemo(() => {
    let assigned = 0;
    let inventory = 0;
    let totalLimit = 0;
    for (const c of allFuelCards) {
      if (c.status === "Inventory") inventory += 1;
      else assigned += 1;
      if (c.card_limit !== null && c.card_limit !== undefined) {
        totalLimit += Number(c.card_limit) || 0;
      }
    }
    return { total: allFuelCards.length, assigned, inventory, totalLimit };
  }, [allFuelCards]);

  const filteredCards = useMemo(() => {
    const q = cardSearch.trim().toLowerCase();
    return allFuelCards.filter((c) => {
      if (cardStatusFilter && c.status !== cardStatusFilter) return false;
      if (!q) return true;
      return [
        c.card_no,
        c.assigned_to,
        c.assigned_id_no,
        c.vehicle_label,
        c.project_label,
        c.notes,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [allFuelCards, cardSearch, cardStatusFilter]);

  const pageSize = 15;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const display = filtered.slice(
    currentPage * pageSize,
    currentPage * pageSize + pageSize,
  );

  const cardPageCount = Math.max(1, Math.ceil(filteredCards.length / pageSize));
  const currentCardPage = Math.min(cardPage, cardPageCount - 1);
  const displayCards = filteredCards.slice(
    currentCardPage * pageSize,
    currentCardPage * pageSize + pageSize,
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

  function openNewCard() {
    setCardForm({ ...EMPTY_CARD_FORM });
    setCardFormError("");
    setEditingCard("new");
  }

  function openEditCard(c: FleetFuelCard) {
    setCardForm(toCardFormState(c));
    setCardFormError("");
    setEditingCard(c);
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
          fuel_type: form.fuel_type || "N/A",
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
      if (!response.ok)
        throw new Error(data.error || "Failed to delete vehicle.");
      setDeleting(null);
      setSaved("Vehicle record removed.");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveCard(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setCardFormError("");
    try {
      const isInv = cardForm.assign_mode === "Inventory";
      const assigned_to = isInv ? "Inventory" : cardForm.driver_name.trim();
      if (!assigned_to) {
        throw new Error("Enter the driver name or select Inventory.");
      }
      const payload = {
        action: editingCard === "new" ? "create" : "update",
        id: editingCard && editingCard !== "new" ? editingCard.id : undefined,
        card: {
          card_no: cardForm.card_no,
          card_limit:
            cardForm.card_limit === "" ? null : Number(cardForm.card_limit),
          assigned_to,
          assigned_id_no: isInv ? "" : cardForm.assigned_id_no,
          notes: cardForm.notes,
        },
      };
      const response = await fetch("/api/fleet/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Failed to save fuel card.");
      setEditingCard(null);
      setSaved(
        editingCard === "new" ? "Fuel card added." : "Fuel card updated.",
      );
      await load();
    } catch (err) {
      setCardFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteCard() {
    if (!deletingCard) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/fleet/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: deletingCard.id }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Failed to delete fuel card.");
      setDeletingCard(null);
      setSaved("Fuel card removed.");
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
            alt="ADVACON Operations Management"
          />
        </a>
        <div className="kpi-app-title">
          <span>ADVACON FLEET OPERATIONS</span>
          <h1>Vehicles Management</h1>
          <p>
            Fleet registry, driver assignments, monthly rent &amp; fuel card
            inventory
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

      <nav className="kpi-app-nav" aria-label="Vehicles panel navigation">
        <button
          aria-current={tab === "vehicles" ? "page" : undefined}
          type="button"
          onClick={() => setTab("vehicles")}
        >
          <Car size={18} />
          Fleet Registry
        </button>
        <button
          aria-current={tab === "cards" ? "page" : undefined}
          type="button"
          onClick={() => setTab("cards")}
        >
          <CreditCard size={18} />
          Fuel Cards
        </button>

        <div className="kpi-nav-actions">
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Refresh fleet data"
          >
            <RefreshCw size={17} />
            Refresh
          </button>
          {admin && tab === "vehicles" && <FleetImport onImported={load} />}
          {admin && tab === "vehicles" && (
            <button
              type="button"
              className="kpi-new-report"
              onClick={openNew}
            >
              <Plus size={18} />
              Add Vehicle
            </button>
          )}
          {admin && tab === "cards" && (
            <button
              type="button"
              className="kpi-new-report"
              onClick={openNewCard}
            >
              <Plus size={18} />
              Add Fuel Card
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
          Loading fleet data…
        </div>
      ) : tab === "vehicles" ? (
        <>
          <section className="fleet-kpi-grid" aria-label="Fleet summary">
            <article className="fleet-kpi-card">
              <div className="fleet-kpi-label">
                <Car size={15} /> Total Vehicles
              </div>
              <div className="fleet-kpi-value">{formatNumber(stats.total)}</div>
            </article>
            <article className="fleet-kpi-card">
              <div className="fleet-kpi-label">
                <Wallet size={15} /> Rented Vehicles
              </div>
              <div className="fleet-kpi-value">
                {formatNumber(stats.rentedCount)}
              </div>
            </article>
            <article className="fleet-kpi-card">
              <div className="fleet-kpi-label">
                <Fuel size={15} /> Total Monthly Rent
              </div>
              <div className="fleet-kpi-value">
                {formatNumber(stats.totalRent)}
                <span className="fleet-kpi-unit">SAR</span>
              </div>
            </article>
            <article className="fleet-kpi-card">
              <div className="fleet-kpi-label">
                <CreditCard size={15} /> Total Fuel Card Limit
              </div>
              <div className="fleet-kpi-value">
                {formatNumber(stats.totalFuelLimit)}
                <span className="fleet-kpi-unit">SAR</span>
              </div>
            </article>
          </section>

          <section className="fleet-panel">
            <div className="fleet-toolbar">
              <div className="fleet-toolbar-title">
                <h2>Vehicle Records</h2>
                <p>
                  {filtered.length} vehicle{filtered.length === 1 ? "" : "s"}
                  {filtered.length !== vehicles.length
                    ? ` of ${vehicles.length} total`
                    : ""}
                </p>
              </div>
              <div className="fleet-toolbar-controls">
                <input
                  type="search"
                  aria-label="Search vehicles"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  placeholder="Search plate, name, driver, card…"
                />
                <select
                  aria-label="Filter by fuel type"
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
                <select
                  aria-label="Filter by monthly rent"
                  value={rentFilter}
                  onChange={(e) => {
                    setRentFilter(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="">All rent</option>
                  <option value="rented">Rented</option>
                  <option value="na">N/A</option>
                </select>
                {(search || fuelFilter || rentFilter) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setFuelFilter("");
                      setRentFilter("");
                      setPage(0);
                    }}
                  >
                    Clear
                  </button>
                )}
                <a
                  className="fleet-export-btn"
                  href="/api/fleet/export"
                  download
                >
                  <Download size={15} />
                  Export Excel (.xlsx)
                </a>
              </div>
            </div>

            <div className="kpi-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Vehicle &amp; Model</th>
                    <th>Plate No. (AR)</th>
                    <th>Fuel Type</th>
                    <th>Owner</th>
                    <th>Driver &amp; Phone</th>
                    <th>Project</th>
                    <th>Fuel Card &amp; Limit</th>
                    <th>Rent</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {display.map((v, idx) => (
                    <tr key={v.id}>
                      <td style={{ color: "var(--muted)", fontWeight: 600 }}>
                        {currentPage * pageSize + idx + 1}
                      </td>
                      <td>
                        <strong>{v.vehicle_name}</strong>
                        {v.model && v.model !== "-" && (
                          <small
                            style={{ display: "block", color: "var(--muted)" }}
                          >
                            {v.model}
                          </small>
                        )}
                      </td>
                      <td dir="auto">{v.plate_number}</td>
                      <td>
                        <span className={fuelBadgeClass(v.fuel_type)}>
                          {v.fuel_type || "N/A"}
                        </span>
                      </td>
                      <td>{v.owner || "—"}</td>
                      <td>
                        {v.driver_name || "—"}
                        {v.phone_number && (
                          <small
                            style={{ display: "block", color: "var(--muted)" }}
                          >
                            {v.phone_number}
                          </small>
                        )}
                      </td>
                      <td>
                        {v.project_number || "—"}
                        {v.project_location && (
                          <small
                            style={{ display: "block", color: "var(--muted)" }}
                          >
                            {v.project_location}
                          </small>
                        )}
                      </td>
                      <td>
                        {v.fuel_card_no || "—"}
                        <small
                          style={{ display: "block", color: "var(--muted)" }}
                        >
                          Limit: {formatLimit(v.fuel_card_limit)}
                        </small>
                      </td>
                      <td>{formatRent(v)}</td>
                      <td>
                        <div className="kpi-row-actions">
                          <button
                            aria-label={`View ${v.vehicle_name}`}
                            onClick={() => setDetail(v)}
                          >
                            <Eye size={16} />
                          </button>
                          {admin && (
                            <>
                              <button
                                aria-label={`Edit ${v.vehicle_name}`}
                                onClick={() => openEdit(v)}
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                aria-label={`Delete ${v.vehicle_name}`}
                                onClick={() => setDeleting(v)}
                              >
                                <Trash2 size={16} />
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
                    ? "Click Add Vehicle or Import Excel to register vehicles."
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
      ) : (
        <>
          <section className="fleet-kpi-grid" aria-label="Fuel cards summary">
            <article className="fleet-kpi-card">
              <div className="fleet-kpi-label">
                <CreditCard size={15} /> Total Fuel Cards
              </div>
              <div className="fleet-kpi-value">
                {formatNumber(cardStats.total)}
              </div>
            </article>
            <article className="fleet-kpi-card">
              <div className="fleet-kpi-label">
                <UserCheck size={15} /> Assigned Cards
              </div>
              <div className="fleet-kpi-value">
                {formatNumber(cardStats.assigned)}
              </div>
            </article>
            <article className="fleet-kpi-card">
              <div className="fleet-kpi-label">
                <Package size={15} /> In Inventory (Unused)
              </div>
              <div className="fleet-kpi-value">
                {formatNumber(cardStats.inventory)}
              </div>
            </article>
            <article className="fleet-kpi-card">
              <div className="fleet-kpi-label">
                <Fuel size={15} /> Total Cards Limit
              </div>
              <div className="fleet-kpi-value">
                {formatNumber(cardStats.totalLimit)}
                <span className="fleet-kpi-unit">SAR</span>
              </div>
            </article>
          </section>

          <section className="fleet-panel">
            <div className="fleet-toolbar">
              <div className="fleet-toolbar-title">
                <h2>Fuel Cards Directory</h2>
                <p>
                  {filteredCards.length} card
                  {filteredCards.length === 1 ? "" : "s"} (vehicle-assigned
                  &amp; inventory)
                </p>
              </div>
              <div className="fleet-toolbar-controls">
                <input
                  type="search"
                  aria-label="Search fuel cards"
                  value={cardSearch}
                  onChange={(e) => {
                    setCardSearch(e.target.value);
                    setCardPage(0);
                  }}
                  placeholder="Search card no, driver, ID, vehicle…"
                />
                <select
                  aria-label="Filter by status"
                  value={cardStatusFilter}
                  onChange={(e) => {
                    setCardStatusFilter(e.target.value);
                    setCardPage(0);
                  }}
                >
                  <option value="">All cards</option>
                  <option value="Assigned">Assigned</option>
                  <option value="Inventory">Inventory (Unused)</option>
                </select>
                {(cardSearch || cardStatusFilter) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCardSearch("");
                      setCardStatusFilter("");
                      setCardPage(0);
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="kpi-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Fuel Card No.</th>
                    <th>Card Limit</th>
                    <th>Assigned To</th>
                    <th>ID Number</th>
                    <th>Vehicle / Source</th>
                    <th>Status</th>
                    <th>Notes</th>
                    {admin && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {displayCards.map((c, idx) => (
                    <tr key={c.key}>
                      <td style={{ color: "var(--muted)", fontWeight: 600 }}>
                        {currentCardPage * pageSize + idx + 1}
                      </td>
                      <td>
                        <strong>{c.card_no}</strong>
                      </td>
                      <td>{formatLimit(c.card_limit)}</td>
                      <td>{c.assigned_to}</td>
                      <td>{c.assigned_id_no || "—"}</td>
                      <td>
                        {c.vehicle_label}
                        {c.project_label && (
                          <small
                            style={{ display: "block", color: "var(--muted)" }}
                          >
                            {c.project_label}
                          </small>
                        )}
                      </td>
                      <td>
                        <span
                          className={
                            c.status === "Inventory"
                              ? "fleet-badge fleet-badge-inventory"
                              : "fleet-badge fleet-badge-assigned"
                          }
                        >
                          {c.status}
                        </span>
                      </td>
                      <td>{c.notes || "—"}</td>
                      {admin && (
                        <td>
                          {c.source === "standalone" && c.rawCard ? (
                            <div className="kpi-row-actions">
                              <button
                                aria-label={`Edit card ${c.card_no}`}
                                onClick={() => openEditCard(c.rawCard!)}
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                aria-label={`Delete card ${c.card_no}`}
                                onClick={() => setDeletingCard(c.rawCard!)}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ) : (
                            <small style={{ color: "var(--muted)" }}>
                              Via vehicle
                            </small>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!filteredCards.length && (
              <div className="kpi-empty">
                <CreditCard size={32} />
                <h3>No fuel cards found</h3>
                <p>
                  {admin
                    ? "Click Add Fuel Card to add unused cards in Inventory."
                    : "Fuel cards assigned to vehicles or in inventory will appear here."}
                </p>
              </div>
            )}

            <footer className="kpi-list-footer">
              <button
                disabled={currentCardPage === 0}
                onClick={() => setCardPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </button>
              <span>
                Page {currentCardPage + 1} of {cardPageCount}
              </span>
              <button
                disabled={currentCardPage + 1 >= cardPageCount}
                onClick={() => setCardPage((p) => p + 1)}
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
                Model Year
                <input
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  placeholder="e.g. 2024"
                />
              </label>
              <label>
                Plate No. (AR) *
                <input
                  required
                  dir="auto"
                  value={form.plate_number}
                  onChange={(e) =>
                    setForm({ ...form, plate_number: e.target.value })
                  }
                  placeholder="e.g. أ ب ج 1234"
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
                  placeholder="e.g. S74"
                />
              </label>
              <label>
                Project Location
                <input
                  value={form.project_location}
                  onChange={(e) =>
                    setForm({ ...form, project_location: e.target.value })
                  }
                  placeholder="e.g. AlUla Oasis"
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
                Card Limit (SAR)
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

      {editingCard && (
        <Modal
          title={editingCard === "new" ? "Add Fuel Card" : "Edit Fuel Card"}
          onClose={() => !busy && setEditingCard(null)}
        >
          <form onSubmit={saveCard}>
            <label>
              Fuel Card No. *
              <input
                required
                value={cardForm.card_no}
                onChange={(e) =>
                  setCardForm({ ...cardForm, card_no: e.target.value })
                }
                placeholder="Enter fuel card number"
              />
            </label>
            <label>
              Card Limit (SAR)
              <input
                type="number"
                min="0"
                step="0.01"
                value={cardForm.card_limit}
                onChange={(e) =>
                  setCardForm({ ...cardForm, card_limit: e.target.value })
                }
                placeholder="e.g. 1500"
              />
            </label>
            <label>
              Assigned To
              <select
                value={cardForm.assign_mode}
                onChange={(e) =>
                  setCardForm({
                    ...cardForm,
                    assign_mode: e.target.value as "Inventory" | "Driver",
                  })
                }
              >
                <option value="Inventory">Inventory (Unused)</option>
                <option value="Driver">Assigned to Driver</option>
              </select>
            </label>
            {cardForm.assign_mode === "Driver" && (
              <>
                <label>
                  Driver Name *
                  <input
                    required
                    value={cardForm.driver_name}
                    onChange={(e) =>
                      setCardForm({ ...cardForm, driver_name: e.target.value })
                    }
                    placeholder="Driver full name"
                  />
                </label>
                <label>
                  Driver ID Number
                  <input
                    value={cardForm.assigned_id_no}
                    onChange={(e) =>
                      setCardForm({
                        ...cardForm,
                        assigned_id_no: e.target.value,
                      })
                    }
                    placeholder="Iqama / National ID"
                  />
                </label>
              </>
            )}
            <label>
              Notes
              <textarea
                value={cardForm.notes}
                onChange={(e) =>
                  setCardForm({ ...cardForm, notes: e.target.value })
                }
                placeholder="Optional notes"
              />
            </label>
            {cardFormError && (
              <p className="notice error" role="alert">
                {cardFormError}
              </p>
            )}
            <div className="form-footer">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setEditingCard(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy
                  ? "Saving…"
                  : editingCard === "new"
                    ? "Add Fuel Card"
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
            <strong dir="auto">{detail.plate_number}</strong>
            {detail.model && <span>{detail.model}</span>}
            <span>{detail.fuel_type || "N/A"}</span>
          </div>
          <dl className="kpi-detail-grid">
            <div>
              <dt>Name of Vehicle</dt>
              <dd>{detail.vehicle_name}</dd>
            </div>
            <div>
              <dt>Model Year</dt>
              <dd>{detail.model || "—"}</dd>
            </div>
            <div>
              <dt>Plate No. (AR)</dt>
              <dd dir="auto">{detail.plate_number}</dd>
            </div>
            <div>
              <dt>Fuel Type</dt>
              <dd>{detail.fuel_type || "N/A"}</dd>
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
              <dt>Card Limit (SAR)</dt>
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

      {deletingCard && (
        <Modal
          title="Delete fuel card?"
          onClose={() => !busy && setDeletingCard(null)}
        >
          <p>
            Remove fuel card <strong>{deletingCard.card_no}</strong> (
            {deletingCard.assigned_to})?
          </p>
          <div className="form-footer">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDeletingCard(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void confirmDeleteCard()}
            >
              {busy ? "Deleting…" : "Delete card"}
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
