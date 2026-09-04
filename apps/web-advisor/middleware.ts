import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@coadvisor/types";

/**
 * Garde périphérique : présence du cookie de session.
 * La VALIDATION réelle de la session est faite côté serveur dans les pages
 * (getSessionUserFromCookies) — le middleware reste volontairement léger
 * (pas de logique métier en périphérie).
 */
export function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/clients/:path*", "/leads/:path*"],
};
