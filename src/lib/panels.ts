import "server-only";
import { cookies } from "next/headers";
import { join } from "node:path";
import { configured, requireUser } from "./supabase";
import { PinStore } from "./pin-store";
export const sessionCookie = "oasis-panel-session";
export function localPins() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Configure Supabase for production PIN login.");
  const store = new PinStore(join(process.cwd(), ".data", "access.sqlite"));
  try {
    store.seed({
      admin: process.env.INITIAL_ADMIN_PIN!,
      viewer: process.env.INITIAL_VIEWER_PIN!,
      supervisor: process.env.INITIAL_SUPERVISOR_PIN!,
    });
    return store;
  } catch (e) {
    store.close();
    throw e;
  }
}
export async function requirePanel(admin = false) {
  if (configured()) return (await requireUser(admin)).profile;
  const jar = await cookies();
  const store = localPins();
  try {
    const account = store.session(jar.get(sessionCookie)?.value || "");
    if (!account) throw new Error("UNAUTHORIZED");
    if (admin && account.role !== "admin") throw new Error("FORBIDDEN");
    return { ...account, email: "" };
  } finally {
    store.close();
  }
}
