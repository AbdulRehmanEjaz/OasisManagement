import {z} from "zod";
import { NextRequest } from "next/server";
import { requireUser } from "@/lib/backend";
import { isSameOrigin } from "@/lib/request-security";
import { json, failure } from "@/lib/http";
import { HttpError } from "@/lib/d1-store";
export async function GET(req:NextRequest) {
  try {
    const { db, profile } = await requireUser(true,z.enum(["survey","kpi","hr"]).parse(req.nextUrl.searchParams.get("dashboard")||"survey"));
    const data = await db.accounts(profile);
    return json({ data, count: data.length });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req)) throw new HttpError("FORBIDDEN", 403);
    const input=await req.json();
    const { db, profile } = await requireUser(true,z.enum(["survey","kpi","hr"]).parse(input.dashboard||"survey"));
    await db.limit("account:" + profile.id, 20);
    return json(await db.changeAccount(profile, input));
  } catch (e) {
    return failure(e);
  }
}
