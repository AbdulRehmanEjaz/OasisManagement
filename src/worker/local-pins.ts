import type { PinStore } from "../lib/pin-store";

// Workers use the existing Supabase authentication path, never ephemeral SQLite.
export function localPins(): PinStore {
  throw new Error("Configure Supabase for production PIN login.");
}
