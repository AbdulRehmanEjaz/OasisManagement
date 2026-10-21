"use client";
import { useState } from "react";
import { Leaf, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function Setup() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = event.currentTarget,
      fields = new FormData(form);
    if (fields.get("pin") !== fields.get("confirm")) {
      setError("PINs do not match.");
      setBusy(false);
      return;
    }
    try {
      const response = await fetch("/api/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-setup-token": String(fields.get("token")),
        },
        body: JSON.stringify({
          full_name: fields.get("name"),
          pin: fields.get("pin"),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      form.reset();
      location.href = "/login";
    } catch (e) {
      setError((e as Error).message);
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
        <h1>Set up your administrator</h1>
        <p>One-time setup. Enter your private PIN here, never in chat.</p>
        <form onSubmit={submit} autoComplete="off">
          <label>
            Setup token
            <input
              name="token"
              type="password"
              minLength={32}
              required
              autoComplete="off"
            />
          </label>
          <label>
            Your name
            <input name="name" minLength={2} maxLength={100} required />
          </label>
          <label>
            Private PIN
            <input
              name="pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6,12}"
              minLength={6}
              maxLength={12}
              required
              autoComplete="new-password"
            />
          </label>
          <label>
            Confirm PIN
            <input
              name="confirm"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6,12}"
              required
              autoComplete="new-password"
            />
          </label>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <Button disabled={busy}>
            {busy ? "Creating…" : "Create administrator"}
          </Button>
        </form>
      </section>
    </main>
  );
}
