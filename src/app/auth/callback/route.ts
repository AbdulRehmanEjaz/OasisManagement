import { NextRequest, NextResponse } from "next/server";
// Retired external-auth callback cannot create a session.
export function GET(req: NextRequest) {
  return NextResponse.redirect(new URL("/oasis/login", req.url));
}
