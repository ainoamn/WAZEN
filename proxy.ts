import { NextRequest, NextResponse } from "next/server";
import { browserSessionCookie, sessionCookieName } from "./lib/session-policy";

function sessionToken(request: NextRequest) {
  return request.cookies.get(sessionCookieName())?.value
    || request.cookies.get("wazen_session")?.value
    || request.cookies.get("__Host-wazen_session")?.value
    || "";
}

function loginRedirectTarget(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next");
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/home";
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const token = sessionToken(request);
  if ((pathname === "/login" || pathname === "/register") && token) {
    return NextResponse.redirect(new URL(loginRedirectTarget(request), request.url));
  }
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/setup") && !token) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const development = process.env.NODE_ENV !== "production";
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    development ? "" : "upgrade-insecure-requests",
  ].filter(Boolean).join("; ");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  if (token) response.headers.append("Set-Cookie", browserSessionCookie(token));
  return response;
}

export const config = {
  matcher: [{ source: "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] }],
};
