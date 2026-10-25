import type {
  D1Database,
  D1PreparedStatement,
} from "@cloudflare/workers-types";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { hashPin, checkPin } from "./pin-crypto";
import type { Role } from "./access-policy";
import { z } from "zod";
export type Data = Record<string, any>;
export type Actor = {
  id: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  email: string;
  tokenHash: string;
};
export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const pinSchema = z
  .string()
  .regex(/^\d{3}$/, "Use exactly 3 digits for the PIN.");
export const accountSchema = z.object({
  full_name: z.string().trim().min(2).max(100),
  role: z.enum(["admin", "viewer", "supervisor"]),
  pin: pinSchema,
});
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export class D1Store {
  constructor(
    public db: D1Database,
    private lookupSecret: string,
  ) {}
  stmt(sql: string, ...values: unknown[]) {
    return this.db
      .prepare(sql)
      .bind(
        ...values.map((v) =>
          v === undefined ? null : typeof v === "boolean" ? Number(v) : v,
        ),
      );
  }
  async one(sql: string, ...values: unknown[]): Promise<Data | null> {
    return this.stmt(sql, ...values).first<Data>();
  }
  async all(sql: string, ...values: unknown[]): Promise<Data[]> {
    return (await this.stmt(sql, ...values).all<Data>()).results;
  }
  fingerprint(pin: string) {
    if (this.lookupSecret.length < 32)
      throw new HttpError("Set PIN_LOOKUP_SECRET before using PIN login.", 503);
    return createHmac("sha256", this.lookupSecret).update(pin).digest("hex");
  }
  async limit(key: string, maximum = 40, windowMs = 60000, now = Date.now()) {
    const row = await this.one(
      `INSERT INTO rate_limits(key,hits,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN expires_at<=? THEN 1 ELSE hits+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING hits`,
      key,
      now + windowMs,
      now,
      now,
    );
    if (Number(row?.hits) > maximum)
      throw new HttpError("Too many attempts. Please try again later.", 429);
  }
  async login(pin: string, ip: string, now = Date.now()) {
    pinSchema.parse(pin);
    const fingerprint = this.fingerprint(pin);
    // HMAC keys do not retain raw PINs or IP addresses. Success never clears failures.
    await this.limit("login-global", 60, 300000, now);
    await this.limit("login-ip:" + this.fingerprint(ip), 5, 300000, now);
    await this.limit("login-account:" + fingerprint, 5, 300000, now);
    const account = await this.one(
      "SELECT id,pin_hash,version FROM users WHERE pin_fingerprint=? AND is_active=1 AND deleted_at IS NULL",
      fingerprint,
    );
    if (!account || !checkPin(pin, account.pin_hash))
      throw new HttpError("Incorrect PIN. Please try again.", 401);
    const token = randomBytes(32).toString("hex");
    const result = await this.stmt(
      `INSERT INTO sessions(token_hash,user_id,version,expires_at) SELECT ?,id,version,? FROM users WHERE id=? AND version=? AND is_active=1 AND deleted_at IS NULL`,
      tokenHash(token),
      now + 8 * 3600000,
      account.id,
      account.version,
    ).run();
    if (!result.meta.changes)
      throw new HttpError("Account access changed. Sign in again.", 401);
    await this.db.batch([
      this.stmt("DELETE FROM sessions WHERE expires_at<?", now),
      this.stmt("DELETE FROM rate_limits WHERE expires_at<?", now - 86400000),
    ]);
    return token;
  }
  async session(token: string, now = Date.now()): Promise<Actor> {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new HttpError("UNAUTHORIZED", 401);
    const hash = tokenHash(token);
    const user = await this.one(
      `SELECT u.id,u.full_name,u.role,u.is_active FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.version=u.version AND s.expires_at>? AND u.is_active=1 AND u.deleted_at IS NULL`,
      hash,
      now,
    );
    if (!user) throw new HttpError("UNAUTHORIZED", 401);
    return { ...user, is_active: true, email: "", tokenHash: hash } as Actor;
  }
  async logout(token: string) {
    await this.stmt(
      "DELETE FROM sessions WHERE token_hash=?",
      tokenHash(token),
    ).run();
  }
  audit(
    actor: string,
    table: string,
    id: string,
    action: string,
    summary: Data = {},
  ) {
    return this.stmt(
      "INSERT INTO audit_logs(id,actor_id,record_type,record_id,action,change_summary) VALUES(?,?,?,?,?,?)",
      crypto.randomUUID(),
      actor,
      table,
      id,
      action,
      JSON.stringify(summary),
    );
  }
  async write(
    actor: Actor,
    role: "admin" | "submit" | "any",
    statements: D1PreparedStatement[],
  ) {
    if (
      (role === "admin" && actor.role !== "admin") ||
      (role === "submit" && !["admin", "supervisor"].includes(actor.role))
    )
      throw new HttpError("FORBIDDEN", 403);
    const id = crypto.randomUUID();
    return this.db.batch([
      this.stmt(
        "INSERT INTO write_guards(id,token_hash,role) VALUES(?,?,?)",
        id,
        actor.tokenHash,
        role,
      ),
      ...statements,
      this.stmt("DELETE FROM write_guards WHERE id=?", id),
    ]);
  }
  async bootstrap(input: unknown, provided: string, expected: string) {
    if (expected.length < 32)
      throw new HttpError("Administrator setup is disabled.", 403);
    if (
      !timingSafeEqual(
        Buffer.from(tokenHash(provided)),
        Buffer.from(tokenHash(expected)),
      )
    )
      throw new HttpError("Invalid setup token.", 403);
    const p = accountSchema
      .extend({
        role: z.literal("admin"),
        pin: z
          .string()
          .regex(/^\d{3}$/, "Use a private PIN of exactly 3 digits."),
        viewer_pin: z.string().regex(/^\d{3}$/, "Use exactly 3 digits for the Viewer PIN.").optional(),
        supervisor_pin: z.string().regex(/^\d{3}$/, "Use exactly 3 digits for the Supervisor PIN.").optional(),
      })
      .refine(p => !!p.viewer_pin === !!p.supervisor_pin, "Provide both Viewer and Supervisor PINs.")
      .refine(p => new Set([p.pin,p.viewer_pin,p.supervisor_pin].filter(Boolean)).size === (p.viewer_pin ? 3 : 1), "Each panel must have a different PIN.")
      .parse(input);
    if (await this.one("SELECT id FROM users LIMIT 1"))
      throw new HttpError("Administrator setup is already complete.", 409);
    const id = crypto.randomUUID();
    await this.db.batch([
      this.stmt("INSERT INTO setup_lock(id) VALUES(1)"),
      this.stmt(
        "INSERT INTO users(id,full_name,role,pin_hash,pin_fingerprint) VALUES(?,?,?,?,?)",
        id,
        p.full_name,
        "admin",
        hashPin(p.pin),
        this.fingerprint(p.pin),
      ),
      this.audit(id, "users", id, "ADMIN_SETUP"),
      ...([ ["viewer",p.viewer_pin], ["supervisor",p.supervisor_pin] ] as const).filter(([,pin])=>!!pin).flatMap(([role,pin])=>{
        const accountId=crypto.randomUUID();
        return [this.stmt("INSERT INTO users(id,full_name,role,pin_hash,pin_fingerprint) VALUES(?,?,?,?,?)",accountId,role==="viewer"?"Viewer":"Supervisor",role,hashPin(pin!),this.fingerprint(pin!)),this.audit(id,"users",accountId,"USER_CREATED",{role})];
      }),
    ]);
  }
  async accounts(actor: Actor): Promise<Data[]> {
    if (actor.role !== "admin") throw new HttpError("FORBIDDEN", 403);
    return (
      await this.all(
        "SELECT id,full_name,role,is_active,created_at,'' AS email FROM users WHERE deleted_at IS NULL ORDER BY created_at",
      )
    ).map((u) => ({ ...u, is_active: !!u.is_active }));
  }
  async changeAccount(actor: Actor, input: Data) {
    if (actor.role !== "admin") throw new HttpError("FORBIDDEN", 403);
    const action = z
      .enum(["user.create", "user.pin", "user.name", "user.toggle", "user.delete"])
      .parse(input.action);
    if (action === "user.create") {
      const p = accountSchema.parse(input),
        id = crypto.randomUUID();
      await this.write(actor, "admin", [
        this.stmt(
          "INSERT INTO users(id,full_name,role,pin_hash,pin_fingerprint) VALUES(?,?,?,?,?)",
          id,
          p.full_name,
          p.role,
          hashPin(p.pin),
          this.fingerprint(p.pin),
        ),
        this.audit(actor.id, "users", id, "USER_CREATED", { role: p.role }),
      ]);
      return { ok: true };
    }
    const id = z.uuid().parse(input.id);
    if (
      id === actor.id &&
      (action === "user.delete" ||
        (action === "user.toggle" && !input.is_active))
    )
      throw new HttpError("You cannot deactivate or remove your own account.");
    if (
      !(await this.one(
        "SELECT id FROM users WHERE id=? AND deleted_at IS NULL",
        id,
      ))
    )
      throw new HttpError("Account unavailable.", 404);
    if(action === "user.name"){const full_name=z.string().trim().min(2).max(100).parse(input.full_name);await this.write(actor,"admin",[this.stmt("UPDATE users SET full_name=? WHERE id=? AND deleted_at IS NULL",full_name,id),this.audit(actor.id,"users",id,"USER_RENAMED",{full_name})]);return {ok:true};}
    const statement =
      action === "user.pin"
        ? this.stmt(
            "UPDATE users SET pin_hash=?,pin_fingerprint=?,version=version+1 WHERE id=? AND deleted_at IS NULL",
            hashPin(pinSchema.parse(input.pin)),
            this.fingerprint(input.pin),
            id,
          )
        : action === "user.toggle"
          ? this.stmt(
              "UPDATE users SET is_active=?,version=version+1 WHERE id=? AND deleted_at IS NULL",
              z.boolean().parse(input.is_active),
              id,
            )
          : this.stmt(
              "UPDATE users SET is_active=0,deleted_at=?,version=version+1 WHERE id=? AND deleted_at IS NULL",
              new Date().toISOString(),
              id,
            );
    await this.write(actor, "admin", [
      statement,
      this.audit(actor.id, "users", id, action),
    ]);
    return { ok: true, reauthenticate: id === actor.id };
  }
}
