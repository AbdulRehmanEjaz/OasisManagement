import "server-only";
import { cookies } from "next/headers";
import { getBindings } from "@/lib/runtime";
import { D1Store, HttpError } from "./d1-store";
export const sessionCookie =
  process.env.NODE_ENV === "production"
    ? "__Host-oasis-session"
    : "oasis-panel-session";
export async function store() {
  const env = await getBindings();
  if (!env.DB)
    throw new HttpError(
      "D1 is not bound. Complete the Cloudflare database setup.",
      503,
    );
  return new D1Store(
    env.DB,
    env.PIN_LOOKUP_SECRET || process.env.PIN_LOOKUP_SECRET || "",
  );
}
export async function requireUser(admin = false) {
  const db = await store();
  const profile = await db.session(
    (await cookies()).get(sessionCookie)?.value || "",
  );
  if (admin && profile.role !== "admin") throw new HttpError("FORBIDDEN", 403);
  return { db, profile, user: { id: profile.id } };
}
