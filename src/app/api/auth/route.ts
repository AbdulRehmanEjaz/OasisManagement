import { NextRequest, NextResponse } from "next/server";
import { database, configured, requireUser } from "@/lib/supabase";
import { z } from "zod";
export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("origin") !== req.nextUrl.origin)
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    if (!configured())
      return NextResponse.json(
        { error: "Supabase has not been configured." },
        { status: 503 },
      );
    const v = z
      .object({
        action: z.enum(["login", "logout", "reset", "password"]),
        email: z.email().optional(),
        password: z.string().max(256).optional(),
      })
      .parse(await req.json());
    const db = await database();
    if (v.action === "logout") {
      await db.auth.signOut();
      return NextResponse.json({ ok: true });
    }
    if (v.action === "reset") {
      if (!v.email) throw new Error("Email required.");
      await db.auth.resetPasswordForEmail(v.email, {
        redirectTo: `${process.env.APP_URL || req.nextUrl.origin}/auth/callback`,
      });
      return NextResponse.json({ ok: true });
    }
    if (v.action === "password") {
      await requireUser();
      z.string().min(12).parse(v.password);
      const { error } = await db.auth.updateUser({ password: v.password });
      if (error) throw error;
    } else {
      if (!v.email || !v.password)
        throw new Error("Email and password required.");
      const { error } = await db.auth.signInWithPassword({
        email: v.email,
        password: v.password,
      });
      if (error) throw new Error("Email or password is incorrect.");
      try {
        await requireUser();
      } catch {
        await db.auth.signOut();
        throw new Error("Account is inactive or not provisioned.");
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Check your email and password."
            : (e as Error).message,
      },
      { status: 400 },
    );
  }
}
