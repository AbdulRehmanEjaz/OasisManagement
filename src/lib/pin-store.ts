import { DatabaseSync } from "node:sqlite";
import {
  scryptSync,
  randomBytes,
  timingSafeEqual,
  createHash,
  randomUUID,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Role } from "./access-policy";
export type Account = {
  id: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  version: number;
  deleted_at: string | null;
};
export function hashPin(pin: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(pin, salt, 32).toString("hex");
}
export function checkPin(pin: string, hash: string) {
  const [salt, digest] = hash.split(":");
  if (!salt || !digest) return false;
  const actual = scryptSync(pin, salt, 32);
  const expected = Buffer.from(digest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export class PinStore {
  db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      `PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,full_name TEXT NOT NULL,role TEXT NOT NULL,pin_hash TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,deleted_at TEXT);CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,version INTEGER NOT NULL,expires_at INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS attempts(role TEXT PRIMARY KEY,hits INTEGER NOT NULL,expires_at INTEGER NOT NULL);`,
    );
  }
  seed(pins: Record<Role, string>) {
    if (this.db.prepare("SELECT id FROM accounts LIMIT 1").get()) return;
    for (const role of ["admin", "viewer", "supervisor"] as Role[]) {
      if (!/^\d{3,12}$/.test(pins[role] || ""))
        throw new Error("Set initial panel PINs in the server environment.");
    }
    if (new Set(Object.values(pins)).size !== 3)
      throw new Error("Initial panel PINs must be distinct.");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (!this.db.prepare("SELECT id FROM accounts LIMIT 1").get()) {
        for (const role of ["admin", "viewer", "supervisor"] as Role[])
          this.create(role[0].toUpperCase() + role.slice(1), role, pins[role]);
      }
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  list() {
    return (
      this.db
        .prepare(
          "SELECT id,full_name,role,is_active,created_at,version,deleted_at FROM accounts WHERE deleted_at IS NULL ORDER BY created_at",
        )
        .all() as unknown as Account[]
    ).map((a) => ({ ...a, is_active: !!a.is_active }));
  }
  create(name: string, role: Role, pin: string) {
    if (
      this.db
        .prepare("SELECT pin_hash FROM accounts WHERE deleted_at IS NULL")
        .all()
        .some((a) => checkPin(pin, String(a.pin_hash)))
    )
      throw new Error("This PIN is already in use. Choose a different PIN.");
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO accounts(id,full_name,role,pin_hash,created_at) VALUES(?,?,?,?,?)",
      )
      .run(id, name, role, hashPin(pin), new Date().toISOString());
    return id;
  }
  login(role: Role, pin: string, now = Date.now()) {
    const row = this.db
      .prepare("SELECT hits,expires_at FROM attempts WHERE role=?")
      .get(role);
    if (row && Number(row.expires_at) > now && Number(row.hits) >= 5)
      throw new Error("Too many attempts. Try again in 5 minutes.");
    const hits = row && Number(row.expires_at) > now ? Number(row.hits) + 1 : 1;
    this.db
      .prepare("INSERT OR REPLACE INTO attempts VALUES(?,?,?)")
      .run(
        role,
        hits,
        row && Number(row.expires_at) > now
          ? Number(row.expires_at)
          : now + 300000,
      );
    const match = this.db
      .prepare(
        "SELECT * FROM accounts WHERE role=? AND is_active=1 AND deleted_at IS NULL",
      )
      .all(role)
      .find((a) => checkPin(pin, String(a.pin_hash)));
    if (!match) throw new Error("Incorrect PIN for this panel.");
    this.db.prepare("DELETE FROM attempts WHERE role=?").run(role);
    const token = randomBytes(32).toString("hex");
    this.db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(now);
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?,?,?)")
      .run(
        createHash("sha256").update(token).digest("hex"),
        String(match.id),
        Number(match.version),
        now + 28800000,
      );
    return token;
  }
  session(token: string, now = Date.now()) {
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const row = this.db
      .prepare(
        "SELECT a.id,a.full_name,a.role,a.is_active,a.created_at,a.version,a.deleted_at FROM sessions s JOIN accounts a ON a.id=s.user_id AND a.version=s.version WHERE s.token_hash=? AND s.expires_at>? AND a.is_active=1 AND a.deleted_at IS NULL",
      )
      .get(createHash("sha256").update(token).digest("hex"), now) as unknown as
      Account | undefined;
    return row ? { ...row, is_active: true } : null;
  }
  logout(token: string) {
    this.db
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .run(createHash("sha256").update(token).digest("hex"));
  }
  change(
    id: string,
    actor: string,
    change: { pin?: string; is_active?: boolean; remove?: boolean },
  ) {
    const account = this.list().find((a) => a.id === id);
    if (!account) throw new Error("Account unavailable.");
    if ((change.remove || change.is_active === false) && id === actor)
      throw new Error("You cannot deactivate or remove your own account.");
    if (change.pin) {
      if (
        this.db
          .prepare(
            "SELECT id,pin_hash FROM accounts WHERE id<>? AND deleted_at IS NULL",
          )
          .all(id)
          .some((a) => checkPin(change.pin!, String(a.pin_hash)))
      )
        throw new Error("This PIN is already in use.");
      this.db
        .prepare("UPDATE accounts SET pin_hash=?,version=version+1 WHERE id=?")
        .run(hashPin(change.pin), id);
    }
    if (change.is_active !== undefined)
      this.db
        .prepare("UPDATE accounts SET is_active=?,version=version+1 WHERE id=?")
        .run(change.is_active ? 1 : 0, id);
    if (change.remove)
      this.db
        .prepare(
          "UPDATE accounts SET deleted_at=?,is_active=0,version=version+1 WHERE id=?",
        )
        .run(new Date().toISOString(), id);
    this.db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
    this.db.prepare("DELETE FROM attempts WHERE role=?").run(account.role);
  }
  close() {
    this.db.close();
  }
}
