import { NextRequest } from "next/server";
import { store } from "@/lib/backend";
import { getBindings } from "@/lib/runtime";
import { isSameOrigin } from "@/lib/request-security";
import { HttpError } from "@/lib/d1-store";
import { json, failure } from "@/lib/http";
export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req)) throw new HttpError("FORBIDDEN", 403);
    const db = await store(),
      env = await getBindings();
    await db.limit(
      "setup:" + db.fingerprint(req.headers.get("cf-connecting-ip") || "local"),
      5,
      3600000,
    );
    const input = await req.json();
    await db.bootstrap(
      { ...input, role: "admin" },
      req.headers.get("x-setup-token") || "",
      env.ADMIN_SETUP_TOKEN || "",
    );
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
