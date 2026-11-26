"use client";
import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import type { FleetImportRow } from "@/lib/fleet/import-xlsx";
import Modal from "../modal";
import { Button } from "../ui/button";

export default function FleetImport({
  onImported,
}: {
  onImported: () => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<FleetImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Please upload an .xlsx Excel file.");
      return;
    }
    setBusy(true);
    setError("");
    setSummary("");
    setFileName(file.name);
    try {
      const response = await fetch("/api/fleet/import", {
        method: "POST",
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        body: await file.arrayBuffer(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not read file.");
      setRows(data.rows || []);
    } catch (err) {
      setRows([]);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!rows.length) return;
    setBusy(true);
    setError("");
    setSummary("");
    let imported = 0;
    const failed: string[] = [];
    try {
      const batchSize = 25;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        setProgress(
          `Importing ${Math.min(i + batch.length, rows.length)} of ${rows.length}…`,
        );
        const response = await fetch("/api/fleet/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: batch }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Import failed.");
        for (const r of data.results || []) {
          if (r.ok) imported += 1;
          else failed.push(`Row ${r.row}: ${r.error}`);
        }
      }
      setSummary(
        `Imported ${imported} vehicle${imported === 1 ? "" : "s"} successfully.` +
          (failed.length ? ` ${failed.length} failed.` : ""),
      );
      if (failed.length) setError(failed.slice(0, 10).join("\n"));
      setRows([]);
      await onImported();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProgress("");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError("");
          setSummary("");
          setRows([]);
          setFileName("");
          setOpen(true);
        }}
      >
        <FileSpreadsheet size={17} />
        Import Excel
      </button>

      {open && (
        <Modal
          title="Bulk Import Vehicles (.xlsx)"
          wide
          onClose={() => !busy && setOpen(false)}
        >
          <p className="muted" style={{ marginBottom: "14px" }}>
            Download the Excel template, fill in your vehicles (Fuel type
            dropdown supports Diesel / Petrol, Arabic Plate No. supported), then
            upload the completed <code>.xlsx</code> file.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
              marginBottom: "16px",
            }}
          >
            <a
              href="/api/fleet/import"
              download="fleet-vehicles-template.xlsx"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 16px",
                borderRadius: "12px",
                border: "1px solid var(--line)",
                background: "var(--surface)",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              <Download size={17} />
              Download Template (.xlsx)
            </a>

            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              style={{ display: "none" }}
              onChange={(e) => void onFile(e)}
            />
            <Button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={17} />
              {busy && !progress ? "Reading file…" : "Upload Filled .xlsx"}
            </Button>
          </div>

          {error && (
            <p
              className="notice error"
              role="alert"
              style={{ whiteSpace: "pre-line" }}
            >
              {error}
            </p>
          )}
          {summary && (
            <p className="notice" role="status">
              {summary}
            </p>
          )}

          {rows.length > 0 && (
            <div>
              <p style={{ fontWeight: 600, marginBottom: "8px" }}>
                Ready to import {rows.length} vehicle
                {rows.length === 1 ? "" : "s"} from {fileName}
              </p>
              <div
                className="kpi-table-scroll"
                style={{ maxHeight: "280px", marginBottom: "14px" }}
              >
                <table>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Car Name</th>
                      <th>Model Year</th>
                      <th>Plate No. (AR)</th>
                      <th>Fuel type</th>
                      <th>Owner</th>
                      <th>Driver Name</th>
                      <th>Monthly Rent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 20).map((r) => (
                      <tr key={r.row}>
                        <td>{r.row}</td>
                        <td>{r.vehicle.vehicle_name}</td>
                        <td>{r.vehicle.model || "—"}</td>
                        <td>{r.vehicle.plate_number}</td>
                        <td>{r.vehicle.fuel_type || "—"}</td>
                        <td>{r.vehicle.owner || "—"}</td>
                        <td>{r.vehicle.driver_name || "—"}</td>
                        <td>
                          {r.vehicle.monthly_rent_type === "N/A"
                            ? "N/A"
                            : `${r.vehicle.monthly_rent} SAR`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 20 && (
                <p className="muted" style={{ marginBottom: "10px" }}>
                  Showing first 20 of {rows.length} vehicles.
                </p>
              )}
              <div className="form-footer">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setRows([])}
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void runImport()}
                >
                  {progress || `Import ${rows.length} Vehicle${rows.length === 1 ? "" : "s"}`}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
