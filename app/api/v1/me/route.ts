import { ensureSchema, getRawDb } from "../../../../db/runtime";
import { authenticateRequest } from "../../../../lib/auth";
import { runWithDbUser } from "../../../../lib/db-request-context";
import { errorResponse, ApiError } from "../../../../lib/security";
import { enforceV1RateLimit } from "../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../lib/request-timing";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withRequestTiming("v1.me.get", async () => {
    try {
      const db = getRawDb();
      await ensureSchema(db);
      const user = await authenticateRequest(db, request);
      if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
      return await runWithDbUser(user.id, async () => {
        await enforceV1RateLimit(db, request, user, "read");
        const spaces = await db.prepare(`
          SELECT COUNT(*) AS count FROM spaces s
          WHERE s.owner_user_id=? OR EXISTS (
            SELECT 1 FROM members m WHERE m.space_id=s.id AND m.status='active' AND m.user_id=?
          )
        `).bind(user.id, user.id).first<{ count: number }>();
        return Response.json({
          api: "wazen.v1",
          me: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            authType: user.authType ?? "session",
            scopes: user.scopes ?? [],
            spaceCount: Number(spaces?.count ?? 0),
          },
        }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
      });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
