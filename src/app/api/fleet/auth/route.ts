import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { isSameOrigin } from "@/lib/request-security";
import { json, failure } from "@/lib/http";
import { HttpError, pinSchema } from "@/lib/d1-store";
import {
  fleetCookieName,
  fleetLogin,
  fleetLogout,
  getFleetDb,
} from "@/lib/fleet/store";

export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req)) throw new HttpError("FORBIDDEN", 403);
    const input = await req.json();
    const db = await getFleetDb();
    const jar = await cookies();
    const cookieName = fleetCookieName();

    if (input.action === "logout") {
      await fleetLogout(db, jar.get(cookieName)?.value || "");
      jar.delete(cookieName);
      return json({ ok: true });
    }

    const v = z
      .object({ action: z.literal("login"), pin: pinSchema })
      .parse(input);
    const { token, role } = await fleetLogin(db, v.pin);
    jar.set(cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 28800,
    });
    return json({ ok: true, role });
  } catch (e) {
    return failure(e);
  }
}
