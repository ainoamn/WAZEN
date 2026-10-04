import { getRawDb, ensureSchema } from "../../../../db/runtime";
import { authenticateRequest } from "../../../../lib/auth";
import { platformRoleOf } from "../../../../lib/authorization";
import { isBhdIdentityConfigured } from "../../../../lib/bhd-identity";
import { errorResponse } from "../../../../lib/security";

export const dynamic = "force-dynamic";

/** Read-only session probe: JSON only, never writes cookies (docs/BHD-SESSION-POLICY.md). */
export async function GET(request: Request) {
  try {
    const db = getRawDb();
    await ensureSchema(db);
    const user = await authenticateRequest(db, request);
    const headers = { "Cache-Control": "no-store" };
    if (!user) return Response.json({ user: null }, { status: 401, headers });
    const role = user.authType === "session" ? await platformRoleOf(db, user.id) : null;
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
