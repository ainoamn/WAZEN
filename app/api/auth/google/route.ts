import { z } from "zod";
import { getRawDb, ensureSchema } from "../../../../db/runtime";
import { authenticateRequest, createSession, createSessionToken, sessionHeaders } from "../../../../lib/auth";
import { isBhdIdentityConfigured } from "../../../../lib/bhd-identity";
import { platformRoleOf } from "../../../../lib/authorization";
import { browserIdCookie, browserIdFromRequest } from "../../../../lib/browser-session";
import { upsertGoogleUser } from "../../../../lib/google-account";
import { verifyGoogleAccessToken, verifyGoogleIdToken } from "../../../../lib/google-id-token";
import {
  createGoogleOAuthRequest,
  googleStartPage,
  isGoogleOAuthConfigured,
  isGoogleRedirectConfigured,
  oauthStateCookie,
  safeAuthNext,
} from "../../../../lib/google-oauth";
import { appOrigin } from "../../../../lib/app-origin";
import { clientCountry, clientIp, recordSecurityEvent } from "../../../../lib/ip-security";
import { ApiError, enforceWriteRequest, errorResponse, rateLimit } from "../../../../lib/security";

const gisSchema = z.object({
  idToken: z.string().min(32).max(4096).optional(),
  accessToken: z.string().min(16).max(4096).optional(),
}).refine((value) => Boolean(value.idToken || value.accessToken), { message: "GOOGLE_AUTH_FAILED" });

export async function GET(request: Request) {
  try {
    const db = getRawDb();
    await ensureSchema(db);
    await rateLimit(db, request, "auth-google", 12, 900);
    if (isBhdIdentityConfigured()) throw new ApiError(503, "BHD_IDENTITY_ONLY");
    if (!isGoogleRedirectConfigured()) throw new ApiError(503, "GOOGLE_NOT_CONFIGURED");
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

export async function POST(request: Request) {
  try {
    enforceWriteRequest(request, 16_384);
    const db = getRawDb();
    await ensureSchema(db);
    await rateLimit(db, request, "auth-google", 12, 900);
    if (isBhdIdentityConfigured()) throw new ApiError(503, "BHD_IDENTITY_ONLY");
    if (!isGoogleOAuthConfigured()) throw new ApiError(503, "GOOGLE_NOT_CONFIGURED");
    const existing = await authenticateRequest(db, request);
    if (existing?.authType === "session") {
      const role = await platformRoleOf(db, existing.id);
      return Response.json({ ok: true, role, user: existing });
    }
    const parsed = gisSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, "GOOGLE_AUTH_FAILED");
    const profile = parsed.data.idToken
      ? await verifyGoogleIdToken(parsed.data.idToken)
      : await verifyGoogleAccessToken(parsed.data.accessToken ?? "");
    const user = await upsertGoogleUser(db, profile);
    const session = await createSession(db, user.id, request);
    await recordSecurityEvent(db, {
      ip: clientIp(request),
      userId: user.id,
      eventType: user.created ? "auth.google_registered" : "auth.google_login_success",
      countryCode: clientCountry(request),
      userAgent: request.headers.get("user-agent"),
    });
    const role = await platformRoleOf(db, user.id);
    return Response.json(
      { ok: true, role, user: { id: user.id, email: user.email, displayName: user.displayName } },
      { headers: sessionHeaders(session) },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
