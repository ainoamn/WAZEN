import { clearCsrfCookie, clearSessionCookie, revokeSession } from "../../../../lib/auth";
import { getRawDb } from "../../../../db/runtime";
import { ADMIN_LOCAL_LOGIN_PATH, adminEntryCookie } from "../../../../lib/admin-entry";
import { bhdEndSessionUrl, isBhdIdentityConfigured, publicRequestOrigin } from "../../../../lib/bhd-identity";

export const dynamic = "force-dynamic";

/**
 * Clears the local Wazen session, then RP-logout on BHD Identity using only the
 * registered post_logout_redirect_uri (`{origin}/`). An intent cookie tells
 * proxy.ts to send the browser to the local admin login form after return.
 *
 * Do NOT pass `/login?...` as post_logout_redirect_uri — Identity rejects it and
 * drops the user on https://id.bhd-om.com/.
 */
export async function GET(request: Request) {
  const db = getRawDb();
  try {
    await revokeSession(db, request);
  } catch {
    /* best effort local sign-out */
  }

  const origin = (() => {
    try {
      return publicRequestOrigin(request);
    } catch {
      return new URL(request.url).origin;
    }
  })();
  const localLogin = new URL(ADMIN_LOCAL_LOGIN_PATH, `${origin}/`);
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("Set-Cookie", clearSessionCookie());
  headers.append("Set-Cookie", clearCsrfCookie());
  headers.append("Set-Cookie", adminEntryCookie());

  if (isBhdIdentityConfigured()) {
    // bhdEndSessionUrl already sets post_logout_redirect_uri to `${origin}/`
    headers.set("Location", bhdEndSessionUrl(request));
    return new Response(null, { status: 303, headers });
  }

  headers.set("Location", localLogin.toString());
  return new Response(null, { status: 303, headers });
}
