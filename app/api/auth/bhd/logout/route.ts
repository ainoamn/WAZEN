import { getRawDb, ensureSchema } from "../../../../../db/runtime";
import { authenticateRequest, clearCsrfCookie, clearSessionCookie, revokeSession } from "../../../../../lib/auth";
import { bhdEndSessionUrl, isBhdIdentityConfigured } from "../../../../../lib/bhd-identity";
import { enforceCsrf, errorResponse } from "../../../../../lib/security";

export const dynamic = "force-dynamic";

/**
 * Product logout then identity end-session (BHD-PRODUCT-SSO-ADMIN §3.1).
 * Clears Wazen session cookies, then 302 to identity `/oauth/end-session`.
 */
export async function GET(request: Request) {
  try {
    const db = getRawDb();
    await ensureSchema(db);
    const user = await authenticateRequest(db, request);
    if (user?.authType === "session") {
      try {
        await enforceCsrf(db, request);
      } catch {
        /* browser navigation may omit CSRF header; still revoke */
      }
    }
    await revokeSession(db, request);
    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append("Set-Cookie", clearSessionCookie());
    headers.append("Set-Cookie", clearCsrfCookie());
    const origin = new URL(request.url).origin;
    const target = isBhdIdentityConfigured()
      ? bhdEndSessionUrl(request)
      : `${origin}/login?local=1`;
    headers.set("Location", target);
    return new Response(null, { status: 302, headers });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST alias for clients that prefer JSON then follow Location manually. */
export async function POST(request: Request) {
  return GET(request);
}
