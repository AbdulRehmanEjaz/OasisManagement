import { isSameOrigin } from "@/lib/request-security";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePanel, localPins } from "@/lib/panels";
import { configured, privileged } from "@/lib/supabase";
import { hashPin } from "@/lib/pin-crypto";
import { pinFingerprint } from "@/lib/pin-auth";
import { roles } from "@/lib/access-policy";
const pin = z.string().regex(/^\d{3,12}$/, "Use 3–12 digits for the PIN.");
function fail(e: unknown) {
  const message =
    e instanceof z.ZodError
      ? e.issues.map((i) => i.message).join(" ")
      : e instanceof Error
        ? e.message
        : "Account change failed.";
  return NextResponse.json(
    { error: message },
    {
      status:
        message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 400,
    },
  );
}
export async function GET() {
  try {
    await requirePanel(true);
    if (!configured()) {
      const store = localPins();
      try {
        const data = store.list();
        return NextResponse.json({ data, count: data.length });
      } finally {
        store.close();
      }
    }
    const { data, error } = await privileged()
      .from("profiles")
      .select("id,full_name,role,is_active,created_at")
      .is("deleted_at", null)
      .order("created_at");
    if (error) throw error;
    return NextResponse.json({ data, count: data.length });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req)) throw new Error("FORBIDDEN");
    const actor = await requirePanel(true);
    const input = await req.json();
    const action = z
      .enum(["user.create", "user.pin", "user.toggle", "user.delete"])
      .parse(input.action);
    if (action === "user.create") {
      const p = z
        .object({
          full_name: z.string().trim().min(2).max(100),
          role: z.enum(roles),
          pin,
        })
        .parse(input);
      if (!configured()) {
        const store = localPins();
        try {
          store.create(p.full_name, p.role, p.pin);
        } finally {
          store.close();
        }
      } else {
        const service = privileged();
        const fingerprint = pinFingerprint(p.pin);
        const { data: existing } = await service
          .from("pin_credentials")
          .select("user_id")
          .eq("fingerprint", fingerprint)
          .maybeSingle();
        if (existing) throw new Error("This PIN is already in use.");
        const email = `${crypto.randomUUID()}@pin.oasis.invalid`;
        const { data, error } = await service.auth.admin.createUser({
          email,
          email_confirm: true,
          password: crypto.randomUUID() + crypto.randomUUID(),
        });
        if (error) throw error;
        try {
          const { error: profileError } = await service
            .from("profiles")
            .insert({
              id: data.user.id,
              full_name: p.full_name,
              email,
              role: p.role,
            });
          if (profileError) throw profileError;
          const { error: pinError } = await service.rpc("set_pin_credential", {
            p_user: data.user.id,
            p_hash: hashPin(p.pin),
            p_fingerprint: fingerprint,
            p_actor: actor.id,
          });
          if (pinError) throw pinError;
        } catch (e) {
          await service.from("profiles").delete().eq("id", data.user.id);
          await service.auth.admin.deleteUser(data.user.id);
          throw e;
        }
      }
      return NextResponse.json({ ok: true });
    }
    const id = z.uuid().parse(input.id);
    const change: { pin?: string; is_active?: boolean; remove?: boolean } =
      action === "user.pin"
        ? { pin: pin.parse(input.pin) }
        : action === "user.toggle"
          ? { is_active: z.boolean().parse(input.is_active) }
          : { remove: true };
    if (!configured()) {
      const store = localPins();
      try {
        store.change(id, actor.id, change);
      } finally {
        store.close();
      }
    } else {
      if (
        (action === "user.delete" ||
          (action === "user.toggle" && !change.is_active)) &&
        id === actor.id
      )
        throw new Error("You cannot deactivate or remove your own account.");
      const service = privileged();
      const { data: account, error: readError } = await service
        .from("profiles")
        .select("id")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (readError || !account) throw new Error("Account unavailable.");
      if (change.pin) {
        const { error } = await service.rpc("set_pin_credential", {
          p_user: id,
          p_hash: hashPin(change.pin),
          p_fingerprint: pinFingerprint(change.pin),
          p_actor: actor.id,
        });
        if (error) throw error;
      } else {
        const { error } = await service
          .from("profiles")
          .update(
            action === "user.delete"
              ? { deleted_at: new Date().toISOString(), is_active: false }
              : { is_active: change.is_active },
          )
          .eq("id", id);
        if (error) throw error;
        await service.from("pin_sessions").delete().eq("user_id", id);
        await service.from("audit_logs").insert({
          record_type: "profiles",
          record_id: id,
          actor_id: actor.id,
          action: action === "user.delete" ? "USER_REMOVED" : "ACCESS_CHANGED",
          change_summary: { is_active: change.is_active ?? false },
        });
      }
    }
    return NextResponse.json({ ok: true, reauthenticate: id === actor.id });
  } catch (e) {
    return fail(e);
  }
}
