"use client";
import { useState, useEffect } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Button } from "./ui/button";
export default function Login() {
  const [pin, setPin] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", pin }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      location.href = "/oasis";
    } catch (e) {
      setError((e as Error).message);
      setPin("");
      setBusy(false);
    }
  }
  return (
    <main className="pin-login">
      <a className="pin-brand" href="/" aria-label="Back to Operations Hub">
        <img src="/branding/advacon-alula-oasis-transparent.png" width="330" height="110" alt="ADVACON and AlUla Oasis Management" />
      </a>
      <section className="pin-card">
        <span className="pin-lock">
          <LockKeyhole size={26} />
        </span>
        <h1>Welcome to Site Survey</h1>
        <p>Enter your PIN to continue.</p>
        <form onSubmit={submit}>
          <label htmlFor="panel-pin">PIN</label>
          <input
            id="panel-pin"
            className="pin-input"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{3}"
            minLength={3}
            maxLength={3}
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
            {busy ? "Signing in…" : "Sign in"}
            <ArrowRight size={18} />
          </Button>
        </form>
      </section>
    </main>
  );
}
