"use client";
import { useState, useEffect } from "react";
import { Leaf, ArrowUpRight, ShieldCheck, MapPin, Camera } from "lucide-react";
import { Button } from "./ui/button";
export default function Login() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(false);
  const [requestReset, setRequestReset] = useState(false);
  useEffect(() => {
    setReset(new URLSearchParams(location.search).has("reset"));
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: reset ? "password" : requestReset ? "reset" : "login",
          email: f.get("email"),
          password: f.get("password"),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (requestReset) {
        setError("If the account exists, a reset link has been requested.");
      } else location.href = "/";
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-wrap">
      <section className="login-story">
        <div className="brand">
          <Leaf />
          <strong>
            oasis<span>↗</span>
          </strong>
          <small>FIELD OPERATIONS</small>
        </div>
        <div>
          <span className="eyebrow">CONNECTED IN THE FIELD</span>
          <h1>
            Good work.
            <br />
            Grounded in{" "}
            <br />
            <em>real data.</em>
          </h1>
          <p>
            Your sites, your teams, and every detail.
            <br />
            One place to keep operations moving.
          </p>
        </div>
        <div className="login-pills">
          <span>
            <MapPin size={17} />
            Verified locations
          </span>
          <span>
            <Camera size={17} />
            Photo records
          </span>
        </div>
      </section>
      <section className="login-card">
        <ShieldCheck className="login-icon" />
        <span className="eyebrow">YOUR OPERATIONS WORKSPACE</span>
        <h2>
          {reset
            ? "Set your password"
            : requestReset
              ? "Reset your password"
              : "Welcome back."}
        </h2>
        <p>
          {reset
            ? "Choose a secure password to continue."
            : requestReset
              ? "We will send a secure link to your account email."
              : "Sign in to manage what matters on site."}
        </p>
        <form onSubmit={submit}>
          {!reset && (
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@company.com"
              />
            </label>
          )}
          {!requestReset && (
            <label>
              Password
              <input
                name="password"
                type="password"
                minLength={12}
                autoComplete={reset ? "new-password" : "current-password"}
                required
                placeholder="Enter your password"
              />
            </label>
          )}
          {error && (
            <p className="notice" role="status">
              {error}
            </p>
          )}
          <Button disabled={busy}>
            {busy
              ? "Please wait…"
              : reset
                ? "Save password"
                : requestReset
                  ? "Send reset link"
                  : "Sign in"}
            <ArrowUpRight size={18} />
          </Button>
        </form>
        {!reset && (
          <Button
            variant="ghost"
            onClick={() => {
              setRequestReset(!requestReset);
              setError("");
            }}
          >
            {requestReset ? "Back to sign in" : "Forgot your password?"}
          </Button>
        )}
        <div className="login-note">
          <ShieldCheck size={16} />
          Administrator-created accounts only.
          <br />
          Contact your administrator for access.
        </div>
      </section>
    </main>
  );
}
