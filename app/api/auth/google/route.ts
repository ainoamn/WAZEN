import { getRawDb, ensureSchema } from "../../../../db/runtime";
import { authenticateRequest } from "../../../../lib/auth";
import { createGoogleOAuthRequest, isGoogleOAuthConfigured, oauthStateCookie, safeAuthNext } from "../../../../lib/google-oauth";
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
    const started = await createGoogleOAuthRequest(request, next);
    const headers = new Headers({ Location: started.url, "Cache-Control": "no-store" });
    headers.append("Set-Cookie", oauthStateCookie(started.signedState));
    return new Response(null, { status: 302, headers });
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
