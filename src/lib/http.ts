import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError } from "./d1-store";
export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export function failure(e: unknown) {
  if (e instanceof z.ZodError)
    return json({ error: e.issues.map((i) => i.message).join(" ") }, 400);
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  // Never return raw D1 errors: they can include query parameters/credential hashes.
  const text = e instanceof Error ? e.message : "";
  const messages = [
    "UNAUTHORIZED",
    "FORBIDDEN",
    "Keep at least one active administrator.",
    "Capture and confirm a recent accurate GPS location.",
    "Two or three distinct unused photographs belonging to you are required.",
    "Choose active categories, units and statuses.",
    "Facility unavailable or not assigned to you.",
    "Choose an active supervisor.",
    "Photographs must belong to you and be unused.",
  ];
  const known = messages.find((m) => text.includes(m));
  if (known)
    return json(
      { error: known },
      known === "UNAUTHORIZED" ? 401 : known === "FORBIDDEN" ? 403 : 400,
    );
  if (text.includes("users.pin_fingerprint"))
    return json({ error: "This PIN is already in use." }, 409);
  if (text.includes("setup_lock"))
    return json({ error: "Administrator setup is already complete." }, 409);
  return json(
    { error: "Operation failed. Check database setup and try again." },
    500,
  );
}
