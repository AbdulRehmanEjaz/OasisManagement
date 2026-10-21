import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/supabase";
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (code) {
    const db = await database();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(new URL("/login?reset=1", req.url));
  }
  return NextResponse.redirect(
    new URL("/login?error=Invalid+or+expired+link", req.url),
  );
}
