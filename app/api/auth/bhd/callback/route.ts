import { getRawDb, ensureSchema } from "../../../../../db/runtime";
import { createSession, sessionHeaders } from "../../../../../lib/auth";
import { upsertBhdUser } from "../../../../../lib/bhd-account";
import {
  clearBhdOauthStateCookie,
  exchangeBhdCode,
  mapBhdCallbackError,
  publicRequestOrigin,
  readBhdOauthStateCookie,
  safeReturnTo,
} from "../../../../../lib/bhd-identity";
import { clientCountry, clientIp, recordSecurityEvent } from "../../../../../lib/ip-security";
import { ApiError, errorResponse, rateLimit } from "../../../../../lib/security";

function loginError(origin: string, code: string) {
  const headers = new Headers({ Location: `${origin}/login?error=${encodeURIComponent(code)}&local=1`, "Cache-Control": "no-store" });
  headers.append("Set-Cookie", clearBhdOauthStateCookie());
  return new Response(null, { status: 302, headers });
}

export async function GET(request: Request) {
  const origin = (() => {
    try { return publicRequestOrigin(request); } catch { return new URL(request.url).origin; }
  })();
  try {
    const db = getRawDb();
    await ensureSchema(db);
    await rateLimit(db, request, "auth-bhd", 10, 60);
    const url = new URL(request.url);
    const oauthError = mapBhdCallbackError(url.searchParams.get("error"));
    const stored = readBhdOauthStateCookie(request);
    if (oauthError) return loginError(origin, oauthError);
    if (!stored) return loginError(origin, "BHD_STATE_MISSING");
    const state = url.searchParams.get("state") ?? "";
    const code = url.searchParams.get("code") ?? "";
    if (!state || state !== stored.state) return loginError(origin, "BHD_STATE_MISMATCH");
    if (!code) return loginError(origin, "BHD_AUTH_FAILED");
    const claims = await exchangeBhdCode(request, code, stored.verifier, stored.nonce);
    const user = await upsertBhdUser(db, claims);
    const session = await createSession(db, user.id, request);
    await recordSecurityEvent(db, {
      ip: clientIp(request),
      userId: user.id,
      eventType: user.created ? "auth.bhd_registered" : "auth.bhd_login_success",
      countryCode: clientCountry(request),
      userAgent: request.headers.get("user-agent"),
    });
    const next = safeReturnTo(stored.returnTo);
    const headers = sessionHeaders(session);
    headers.set("Location", `${origin}${next}`);
    headers.set("Cache-Control", "no-store");
    headers.append("Set-Cookie", clearBhdOauthStateCookie());
    return new Response(null, { status: 302, headers });
  } catch (error) {
    if (error instanceof ApiError) return loginError(origin, error.code);
    return errorResponse(error);
  }
}
