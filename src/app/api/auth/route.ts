import { isSameOrigin } from "@/lib/request-security";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { configured, database, privileged } from "@/lib/supabase";
import { localPins, sessionCookie } from "@/lib/panels";
import { productionPinLogin, supabaseSessionId } from "@/lib/pin-auth";
import { z } from "zod";
export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req))
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    const input = await req.json();
    const jar = await cookies();
    if (input.action === "logout") {
      if (configured()) {
        const db = await database();
        const {
          data: { session },
        } = await db.auth.getSession();
        if (session)
          await privileged()
            .from("pin_sessions")
            .delete()
            .eq("session_id", supabaseSessionId(session.access_token));
        await db.auth.signOut();
      } else {
        const store = localPins();
        try {
          store.logout(jar.get(sessionCookie)?.value || "");
        } finally {
          store.close();
        }
      }
      jar.delete(sessionCookie);
      return NextResponse.json({ ok: true });
    }
    const v = z
      .object({
        action: z.literal("login"),
        pin: z.string().regex(/^\d{3,12}$/),
      })
      .parse(input);
    if (configured()) await productionPinLogin(v.pin);
    else {
      const store = localPins();
      try {
        const token = store.login(v.pin);
        jar.set(sessionCookie, token, {
          httpOnly: true,
          sameSite: "strict",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 28800,
        });
      } finally {
        store.close();
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const error =
      e instanceof z.ZodError ? "Enter a valid PIN." : (e as Error).message;
    return NextResponse.json(
      { error },
      { status: error.includes("Too many") ? 429 : 400 },
    );
  }
}
