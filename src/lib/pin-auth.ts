import "server-only";
import { createHmac } from "node:crypto";
import { privileged, database } from "./supabase";
import { checkPin } from "./pin-crypto";
export function pinFingerprint(pin: string) {
  if (
    !process.env.PIN_LOOKUP_SECRET ||
    process.env.PIN_LOOKUP_SECRET.length < 32
  )
    throw new Error(
      "Set PIN_LOOKUP_SECRET to a random server secret of at least 32 characters.",
    );
  return createHmac("sha256", process.env.PIN_LOOKUP_SECRET)
    .update(pin)
    .digest("hex");
}
export function supabaseSessionId(token: string) {
  const payload = JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString(),
  );
  return String(payload.session_id || "");
}
export async function productionPinLogin(pin: string) {
  const service = privileged();
  const { data: allowed, error: limitError } = await service.rpc(
    "pin_login_gate",
    { p_role: "login" },
  );
  if (limitError) throw limitError;
  if (!allowed) throw new Error("Too many attempts. Try again in 5 minutes.");
  const { data: credential, error } = await service
    .from("pin_credentials")
    .select(
      "user_id,pin_hash,version,profiles!inner(email,role,is_active,deleted_at)",
    )
    .eq("fingerprint", pinFingerprint(pin))
    .single();
  const profile = credential?.profiles as unknown as
    | {
        email: string;
        role: string;
        is_active: boolean;
        deleted_at: string | null;
      }
    | undefined;
  if (
    error ||
    !credential ||
    !profile ||
    !profile.is_active ||
    profile.deleted_at ||
    !checkPin(pin, credential.pin_hash)
  )
    throw new Error("Incorrect PIN. Please try again.");
  const { data: link, error: linkError } =
    await service.auth.admin.generateLink({
      type: "magiclink",
      email: profile.email,
    });
  if (linkError) throw linkError;
  const db = await database();
  const { data, error: verifyError } = await db.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError || !data.session || data.user?.id !== credential.user_id)
    throw new Error("Could not start a secure session.");
  const { error: sessionError } = await service.from("pin_sessions").insert({
    session_id: supabaseSessionId(data.session.access_token),
    user_id: credential.user_id,
    credential_version: credential.version,
  });
  if (sessionError) {
    await db.auth.signOut();
    throw sessionError;
  }
  await service.rpc("pin_login_succeeded");
}
