"use client";
import { useState, useEffect } from "react";
import {
  Leaf,
  ShieldCheck,
  Eye,
  HardHat,
  ArrowRight,
  LockKeyhole,
} from "lucide-react";
import { Button } from "./ui/button";
import { type Role } from "@/lib/access-policy";
export default function Login() {
  const [role, setRole] = useState<Role>("admin"),
    [pin, setPin] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const panels = [
    {
      role: "admin" as const,
      title: "Admin",
      icon: ShieldCheck,
      description: "Manage records, users, and PINs.",
    },
    {
      role: "viewer" as const,
      title: "Viewer",
      icon: Eye,
      description: "Read reports and explore maps.",
    },
    {
      role: "supervisor" as const,
      title: "Supervisor",
      icon: HardHat,
      description: "Submit information from the field.",
    },
  ];
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", role, pin }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      location.href = "/";
    } catch (e) {
      setError((e as Error).message);
      setPin("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="pin-login">
      <div className="pin-brand">
        <Leaf size={30} />
        <strong>
          oasis<span>↗</span>
        </strong>
      </div>
      <section className="pin-card">
        <span className="pin-lock">
          <LockKeyhole size={26} />
        </span>
        <h1>Choose your panel</h1>
        <p>Enter your PIN to access your workspace.</p>
        <div className="panel-picker" role="group" aria-label="Login panel">
          {panels.map((p) => (
            <button
              key={p.role}
              className={role === p.role ? "selected" : ""}
              aria-pressed={role === p.role}
              disabled={!ready || busy}
              onClick={() => {
                setRole(p.role);
                setPin("");
                setError("");
              }}
            >
              <p.icon size={24} />
              <strong>{p.title}</strong>
              <span>{p.description}</span>
            </button>
          ))}
        </div>
        <form onSubmit={submit}>
          <label htmlFor="panel-pin">
            {panels.find((p) => p.role === role)?.title} PIN
          </label>
          <input
            id="panel-pin"
            className="pin-input"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{3,12}"
            minLength={3}
            maxLength={12}
            autoComplete="off"
            required
            disabled={!ready || busy}
            value={pin}
            placeholder="Enter PIN"
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <Button disabled={!ready || busy || pin.length < 3}>
            {busy
              ? "Signing in…"
              : "Open " + panels.find((p) => p.role === role)?.title + " panel"}
            <ArrowRight size={18} />
          </Button>
        </form>
      </section>
    </main>
  );
}
