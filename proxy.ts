import { NextRequest, NextResponse } from "next/server";
import { browserSessionCookie, sessionCookieName } from "./lib/session-policy";

function sessionToken(request: NextRequest) {
  return request.cookies.get(sessionCookieName())?.value
    || request.cookies.get("wazen_session")?.value
    || request.cookies.get("__Host-wazen_session")?.value
    || "";
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const token = sessionToken(request);
  if ((pathname === "/home" || pathname === "/dashboard") && !token) {
    const start = request.nextUrl.clone();
    start.pathname = "/api/auth/bhd/start";
    start.search = "";
    start.searchParams.set("next", pathname);
    return NextResponse.redirect(start);
  }
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/setup") && !token) {
    const start = request.nextUrl.clone();
    start.pathname = "/api/auth/bhd/start";
    start.search = "";
    start.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(start);
  }

  const development = process.env.NODE_ENV !== "production";
  const policy = [
    "default-src 'self'",
    // Prerendered Next chunks have no CSP nonce. A nonce-only script policy
    // blocks the login client, and the form GETs /login? instead of signing in.
    `script-src 'self' https://accounts.google.com${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://accounts.google.com",
    "img-src 'self' data: blob: https://*.googleusercontent.com https://accounts.google.com",
    "font-src 'self' data:",
    "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com",
    "frame-src https://accounts.google.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    development ? "" : "upgrade-insecure-requests",
  ].filter(Boolean).join("; ");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  if (token) response.headers.append("Set-Cookie", browserSessionCookie(token));
  return response;
}

export const config = {
  matcher: [{ source: "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] }],
};
