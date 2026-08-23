import { getRawDb, ensureSchema } from "../../../../db/runtime";
import { authenticateRequest, clearCsrfCookie, clearSessionCookie, issueCsrfToken, csrfCookie } from "../../../../lib/auth";
import { platformRoleOf } from "../../../../lib/authorization";
import { isBhdIdentityConfigured } from "../../../../lib/bhd-identity";
import { errorResponse } from "../../../../lib/security";

export const dynamic = "force-dynamic";

/** Sliding idle renew for product session (BHD §0.2). */
export async function GET(request: Request) {
  try {
    const db = getRawDb();
    await ensureSchema(db);
    const user = await authenticateRequest(db, request);
    if (!user) {
      const headers = new Headers({ "Cache-Control": "no-store" });
      headers.append("Set-Cookie", clearSessionCookie());
      headers.append("Set-Cookie", clearCsrfCookie());
      return Response.json({ user: null }, { status: 401, headers });
    }
    const role = user.authType === "session" ? await platformRoleOf(db, user.id) : null;
    const issued = user.authType === "session" ? await issueCsrfToken(db, request) : null;
    const headers = new Headers({ "Cache-Control": "no-store" });
    if (issued) headers.append("Set-Cookie", csrfCookie(issued.csrfToken, issued.expiresAt));
    return Response.json(
      {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        },
        role,
        identityEnabled: isBhdIdentityConfigured(),
      },
      { headers },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
