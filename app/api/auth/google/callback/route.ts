import { getRawDb, ensureSchema } from "../../../../../db/runtime";
import { authenticateRequest, createSession, sessionHeaders } from "../../../../../lib/auth";
import { upsertGoogleUser } from "../../../../../lib/google-account";
import { clearOAuthStateCookie, exchangeGoogleCode, isGoogleOAuthConfigured, readGoogleOAuthState, safeAuthNext } from "../../../../../lib/google-oauth";
import { appOrigin } from "../../../../../lib/app-origin";
import { clientCountry, clientIp, recordSecurityEvent } from "../../../../../lib/ip-security";
import { ApiError, errorResponse, rateLimit } from "../../../../../lib/security";

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function failRedirect(request: Request, code: string) {
  const origin = (() => {
    try { return appOrigin(request); } catch { return new URL(request.url).origin; }
  })();
  const headers = new Headers({ Location: `${origin}/login?error=${encodeURIComponent(code)}`, "Cache-Control": "no-store" });
  headers.append("Set-Cookie", clearOAuthStateCookie());
  return new Response(null, { status: 302, headers });
}

export async function GET(request: Request) {
  try {
    const db = getRawDb();
    await ensureSchema(db);
    await rateLimit(db, request, "auth-google", 12, 900);
    if (!isGoogleOAuthConfigured()) return failRedirect(request, "GOOGLE_NOT_CONFIGURED");
    const url = new URL(request.url);
    if (url.searchParams.get("error")) return failRedirect(request, "GOOGLE_AUTH_FAILED");
    const code = url.searchParams.get("code") ?? "";
    const state = url.searchParams.get("state") ?? "";
    const cookieState = cookieValue(request, "wazen_oauth");
    if (!code || !state || !cookieState || cookieState !== state) return failRedirect(request, "GOOGLE_AUTH_FAILED");
    const parsed = await readGoogleOAuthState(state);
    const existing = await authenticateRequest(db, request);
    if (existing?.authType === "session") {
      const headers = new Headers({ Location: `${appOrigin(request)}${safeAuthNext(parsed.next)}`, "Cache-Control": "no-store" });
      headers.append("Set-Cookie", clearOAuthStateCookie());
      return new Response(null, { status: 302, headers });
    }
    const profile = await exchangeGoogleCode(request, code, parsed.v);
    const user = await upsertGoogleUser(db, profile);
    const session = await createSession(db, user.id, request);
    await recordSecurityEvent(db, {
      ip: clientIp(request),
      userId: user.id,
      eventType: user.created ? "auth.google_registered" : "auth.google_login_success",
      countryCode: clientCountry(request),
      userAgent: request.headers.get("user-agent"),
    });
    const headers = sessionHeaders(session);
    headers.set("Location", `${appOrigin(request)}${parsed.next.startsWith("/admin") ? "/home" : parsed.next}`);
    headers.append("Set-Cookie", clearOAuthStateCookie());
    return new Response(null, { status: 302, headers });
  } catch (error) {
    if (error instanceof ApiError) return failRedirect(request, error.code);
    return errorResponse(error);
  }
}
