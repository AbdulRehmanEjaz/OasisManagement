"use client";
import { useState, useEffect } from "react";
import { Plus, KeyRound, Trash2, Users } from "lucide-react";
import { api, read, type Row, type Profile } from "@/lib/client";
import Modal from "./modal";
import { Button } from "./ui/button";
export default function AccessManagement({
  profile,
  onChange,
}: {
  profile: Profile | null;
  onChange: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [create, setCreate] = useState(false),
    [change, setChange] = useState<Row | null>(null),
    [remove, setRemove] = useState<Row | null>(null),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    setLoading(true);
    read("users")
      .then((d) => setRows(d.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [revision]);
  function refreshed() {
    onChange();
    setRevision((v) => v + 1);
    setCreate(false);
    setChange(null);
    setRemove(null);
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const f = new FormData(e.currentTarget);
      const result = await api(change ? "user.pin" : "user.create", {
        ...Object.fromEntries(f),
        ...(change ? { id: change.id } : {}),
      });
      if (result.reauthenticate) {
        location.href = "/login";
        return;
      }
      refreshed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="records-card access-manager">
      <div className="card-heading">
        <h2>Users & panel PINs</h2>
        <Button
          onClick={() => {
            setCreate(true);
            setError("");
          }}
        >
          <Plus size={18} />
          Add user
        </Button>
      </div>
      <p className="access-note">
        PINs are hidden. Changing a PIN or disabling a user ends their active
        sessions.
      </p>
      {error && !create && !change && !remove && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="access-note">Loading users…</p>
      ) : (
        <div className="users-list">
          {rows.map((u) => (
            <div className="user-row" key={u.id}>
              <span className="avatar">
                <Users size={19} />
              </span>
              <div>
                <strong>
                  {u.full_name}
                  {u.id === profile?.id ? " (you)" : ""}
                </strong>
                <small>{u.role[0].toUpperCase() + u.role.slice(1)} panel</small>
              </div>
              <span className={"status " + (u.is_active ? "good" : "bad")}>
                {u.is_active ? "Active" : "Inactive"}
              </span>
              <div className="account-actions">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setChange(u);
                    setError("");
                  }}
                >
                  <KeyRound size={16} />
                  Change PIN
                </Button>
                {u.id !== profile?.id && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await api("user.toggle", {
                            id: u.id,
                            is_active: !u.is_active,
                          });
                          refreshed();
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {u.is_active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      aria-label={"Remove " + u.full_name}
                      onClick={() => {
                        setRemove(u);
                        setError("");
                      }}
                    >
                      <Trash2 size={17} />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {(create || change) && (
        <Modal
          title={change ? "Change PIN · " + change.full_name : "Add a user"}
          onClose={() => {
            setCreate(false);
            setChange(null);
          }}
        >
          <form onSubmit={save}>
            {!change && (
              <>
                <label>
                  Full name
                  <input
                    name="full_name"
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </label>
                <label>
                  Panel
                  <select name="role">
                    <option value="supervisor">Supervisor · Submit only</option>
                    <option value="viewer">Viewer · Reports and maps</option>
                    <option value="admin">Admin · Full access</option>
                  </select>
                </label>
              </>
            )}
            <label>
              {change ? "New PIN" : "Login PIN"}
              <input
                name="pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{3,12}"
                minLength={3}
                maxLength={12}
                autoComplete="new-password"
                required
                placeholder="3–12 digits"
              />
            </label>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <Button disabled={busy}>
              {busy ? "Saving…" : change ? "Save new PIN" : "Create user"}
            </Button>
          </form>
        </Modal>
      )}
      {remove && (
        <Modal title="Remove this user?" onClose={() => setRemove(null)}>
          <p>
            {remove.full_name} will lose access immediately. Submitted field
            records will be retained.
          </p>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <div className="form-footer">
            <Button variant="secondary" onClick={() => setRemove(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("user.delete", { id: remove.id });
                  refreshed();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Removing…" : "Remove user"}
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
