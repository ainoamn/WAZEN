import { getRawDb, ensureSchema } from "../../../../../db/runtime";
import { bhdAuthFailurePath, bhdOauthStateCookie, createBhdAuthRequest, isBhdIdentityConfigured, isBhdSsoReadyForRequest, publicRequestOrigin, safeReturnTo } from "../../../../../lib/bhd-identity";
import { ApiError, errorResponse, rateLimit } from "../../../../../lib/security";

export async function GET(request: Request) {
  try {
    const db = getRawDb();
    await ensureSchema(db);
    // BHD verifies the user and PKCE protects the code. Keep a local traffic
    // limit, but do not let repeated SSO bounces create or inherit a 2-hour IP
    // block that prevents an otherwise valid unified-identity session.
    await rateLimit(db, request, "auth-bhd-start", 20, 300, {
      enforceIpBlock: false,
      autoBlock: false,
    });
    const origin = publicRequestOrigin(request);
    const params = new URL(request.url).searchParams;
    const next = safeReturnTo(params.get("next") ?? params.get("returnTo"));
    if (!isBhdIdentityConfigured()) {
      return Response.redirect(`${origin}${bhdAuthFailurePath(origin, "BHD_NOT_CONFIGURED", next)}`, 302);
    }
    if (!isBhdSsoReadyForRequest(request)) {
      return Response.redirect(`${origin}${bhdAuthFailurePath(origin, "BHD_REDIRECT_DENIED", next)}`, 302);
    }
    const started = await createBhdAuthRequest(request, next);
    const headers = new Headers({ Location: started.url, "Cache-Control": "no-store" });
    headers.append("Set-Cookie", bhdOauthStateCookie(started.cookie));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const origin = (() => {
      try { return publicRequestOrigin(request); } catch { return new URL(request.url).origin; }
    })();
    if (error instanceof ApiError) {
      return Response.redirect(`${origin}${bhdAuthFailurePath(origin, error.code)}`, 302);
    }
    return errorResponse(error);
  }
}
