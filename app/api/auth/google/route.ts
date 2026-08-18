import { getRawDb, ensureSchema } from "../../../../db/runtime";
import { authenticateRequest, createSessionToken } from "../../../../lib/auth";
import { browserIdCookie, browserIdFromRequest } from "../../../../lib/browser-session";
import { createGoogleOAuthRequest, googleStartPage, isGoogleOAuthConfigured, oauthStateCookie, safeAuthNext } from "../../../../lib/google-oauth";
import { appOrigin } from "../../../../lib/app-origin";
import { ApiError, errorResponse, rateLimit } from "../../../../lib/security";

export async function GET(request: Request) {
  try {
    const db = getRawDb();
    await ensureSchema(db);
    await rateLimit(db, request, "auth-google", 12, 900);
    if (!isGoogleOAuthConfigured()) throw new ApiError(503, "GOOGLE_NOT_CONFIGURED");
    const user = await authenticateRequest(db, request);
    const next = safeAuthNext(new URL(request.url).searchParams.get("next"));
    if (user) return Response.redirect(`${appOrigin(request)}${next}`, 302);
    const browserId = browserIdFromRequest(request) || createSessionToken();
    const started = await createGoogleOAuthRequest(request, next, browserId);
    const headers = new Headers({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'none'; base-uri 'none'",
    });
    headers.append("Set-Cookie", oauthStateCookie(started.nonce));
    headers.append("Set-Cookie", browserIdCookie(browserId));
    return new Response(googleStartPage(started.url), { status: 200, headers });
  } catch (error) {
    const origin = (() => {
      try { return appOrigin(request); } catch { return new URL(request.url).origin; }
    })();
    if (error instanceof ApiError) {
      return Response.redirect(`${origin}/login?error=${encodeURIComponent(error.code)}`, 302);
    }
    return errorResponse(error);
  }
}
