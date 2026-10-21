import "server-only";
import { cookies } from "next/headers";
import { configured, requireUser } from "./supabase";
import { localPins } from "@/lib/local-pins";
export { localPins } from "@/lib/local-pins";
export const sessionCookie = "oasis-panel-session";
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
