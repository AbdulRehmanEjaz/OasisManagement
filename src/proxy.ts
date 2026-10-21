import { NextResponse, type NextRequest } from "next/server";
// Sessions are checked against D1 on every protected page and API request.
export function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  if (!request.nextUrl.pathname.startsWith("/_next/"))
    response.headers.set("Cache-Control", "no-store");
  return response;
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)",
  ],
};
