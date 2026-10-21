import { join } from "node:path";
import { PinStore } from "./pin-store";

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
