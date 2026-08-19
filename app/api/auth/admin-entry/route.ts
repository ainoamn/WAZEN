import { clearCsrfCookie, clearSessionCookie, revokeSession } from "../../../../lib/auth";
import { getRawDb } from "../../../../db/runtime";
import { bhdEndSessionUrl, isBhdIdentityConfigured } from "../../../../lib/bhd-identity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = getRawDb();
  try {
    await revokeSession(db, request);
  } catch {
    /* best effort local sign-out */
  }

  const target = new URL("/login?local=1&next=/admin&fresh=1", request.url);
  const headers = new Headers();
  headers.append("Set-Cookie", clearSessionCookie());
  headers.append("Set-Cookie", clearCsrfCookie());

  if (isBhdIdentityConfigured()) {
    const endSession = new URL(bhdEndSessionUrl(request));
    endSession.searchParams.set("post_logout_redirect_uri", target.toString());
    headers.set("Location", endSession.toString());
    return new Response(null, { status: 303, headers });
  }

  headers.set("Location", target.toString());
  return new Response(null, { status: 303, headers });
}
