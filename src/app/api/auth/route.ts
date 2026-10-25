import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { store, cookieFor } from "@/lib/backend";
import { isSameOrigin } from "@/lib/request-security";
import { json, failure } from "@/lib/http";
import { HttpError, pinSchema } from "@/lib/d1-store";
export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req)) throw new HttpError("FORBIDDEN", 403);
    const input = await req.json(),
      dashboard=z.enum(["survey","kpi","hr"]).parse(input.dashboard||"survey"),
      sessionCookie=cookieFor(dashboard),
      db = await store(dashboard),
      jar = await cookies();
    if (input.action === "logout") {
      await db.logout(jar.get(sessionCookie)?.value || "");
      jar.delete(sessionCookie);
      return json({ ok: true });
    }
    const v = z
      .object({ action: z.literal("login"), pin: pinSchema })
      .parse(input);
    const token = await db.login(
      v.pin,
      req.headers.get("cf-connecting-ip") || "local",
    );
    jar.set(sessionCookie, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 28800,
    });
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
