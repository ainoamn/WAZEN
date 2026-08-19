import { getRawDb, ensureSchema } from "../../../../../db/runtime";
import { authenticateRequest } from "../../../../../lib/auth";
import { bhdOauthStateCookie, createBhdAuthRequest, identityAcceptsAuthorizeUrl, isBhdIdentityConfigured, isBhdSsoReadyForRequest, publicRequestOrigin, safeReturnTo } from "../../../../../lib/bhd-identity";
import { ApiError, errorResponse, rateLimit } from "../../../../../lib/security";

export async function GET(request: Request) {
  try {
    const db = getRawDb();
    await ensureSchema(db);
    await rateLimit(db, request, "auth-bhd", 10, 60);
    const origin = publicRequestOrigin(request);
    const next = safeReturnTo(new URL(request.url).searchParams.get("next"));
    if (!isBhdIdentityConfigured()) {
      return Response.redirect(`${origin}/login?error=BHD_NOT_CONFIGURED&local=1&next=${encodeURIComponent(next)}`, 302);
    }
    if (!isBhdSsoReadyForRequest(request)) {
      return Response.redirect(`${origin}/login?error=BHD_REDIRECT_DENIED&local=1&next=${encodeURIComponent(next)}`, 302);
    }
    const user = await authenticateRequest(db, request);
    if (user) return Response.redirect(`${origin}${next}`, 302);
    const started = await createBhdAuthRequest(request, next);
    const accepted = await identityAcceptsAuthorizeUrl(started.url);
    if (!accepted) {
      return Response.redirect(`${origin}/login?error=BHD_REDIRECT_DENIED&local=1&next=${encodeURIComponent(next)}`, 302);
    }
    const headers = new Headers({ Location: started.url, "Cache-Control": "no-store" });
    headers.append("Set-Cookie", bhdOauthStateCookie(started.cookie));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const origin = (() => {
      try { return publicRequestOrigin(request); } catch { return new URL(request.url).origin; }
    })();
    if (error instanceof ApiError) {
      return Response.redirect(`${origin}/login?error=${encodeURIComponent(error.code)}&local=1`, 302);
    }
    return errorResponse(error);
  }
}
