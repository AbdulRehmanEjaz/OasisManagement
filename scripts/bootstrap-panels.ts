import { createClient } from "@supabase/supabase-js";
import { createHmac, randomUUID } from "node:crypto";
import { hashPin } from "../src/lib/pin-store";
import { roles } from "../src/lib/access-policy";
try {
  process.loadEnvFile(".env.local");
} catch {}
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY,
    secret = process.env.PIN_LOOKUP_SECRET;
  if (!url || !key || !secret || secret.length < 32)
    throw new Error(
      "Set Supabase server credentials and PIN_LOOKUP_SECRET (32+ random characters).",
    );
  const db = createClient(url, key, { auth: { persistSession: false } });
  const pins = {
    admin: process.env.INITIAL_ADMIN_PIN,
    viewer: process.env.INITIAL_VIEWER_PIN,
    supervisor: process.env.INITIAL_SUPERVISOR_PIN,
  };
  for (const role of roles)
    if (!/^\d{3,12}$/.test(pins[role] || ""))
      throw new Error(
        "Set all INITIAL_*_PIN variables to distinct 3–12 digit PINs.",
      );
  if (new Set(Object.values(pins)).size !== 3)
    throw new Error("Initial panel PINs must be distinct.");
  for (const role of roles) {
    const { data: existing, error: lookupError } = await db
      .from("profiles")
      .select("id")
      .eq("role", role)
      .is("deleted_at", null)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (lookupError) throw lookupError;
    let id = existing?.id;
    let created = false;
    if (!id) {
      const email = `${randomUUID()}@pin.oasis.invalid`;
      const { data, error } = await db.auth.admin.createUser({
        email,
        password: randomUUID() + randomUUID(),
        email_confirm: true,
      });
      if (error) throw error;
      id = data.user.id;
      created = true;
      const { error: pError } = await db
        .from("profiles")
        .insert({
          id,
          email,
          full_name: role[0].toUpperCase() + role.slice(1),
          role,
          is_active: true,
        });
      if (pError) {
        await db.auth.admin.deleteUser(id);
        throw pError;
      }
    }
    const { data: credential } = await db
      .from("pin_credentials")
      .select("user_id")
      .eq("user_id", id)
      .maybeSingle();
    if (credential) {
      console.log(`${role} panel already provisioned; PIN unchanged.`);
      continue;
    }
    const { data: admin, error: adminError } = await db
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .eq("is_active", true)
      .is("deleted_at", null)
      .limit(1)
      .single();
    if (adminError) throw adminError;
    const { error } = await db.rpc("set_pin_credential", {
      p_user: id,
      p_hash: hashPin(pins[role]!),
      p_fingerprint: createHmac("sha256", secret)
        .update(pins[role]!)
        .digest("hex"),
      p_actor: admin.id,
    });
    if (error) {
      if (created) {
        await db.from("profiles").delete().eq("id", id);
        await db.auth.admin.deleteUser(id);
      }
      throw error;
    }
    console.log(`${role} panel provisioned.`);
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
