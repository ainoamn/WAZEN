import { ensureSchema, getRawDb } from "../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../lib/db-request-context";
import { errorResponse, ApiError } from "../../../../../../lib/security";
import { listV1Settlements } from "../../../../../../lib/v1-settlements";
import { enforceV1RateLimit } from "../../../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ spaceId: string }> },
) {
  return withRequestTiming("v1.settlements.get", async () => {
    try {
      const { spaceId } = await context.params;
      const db = getRawDb();
      await ensureSchema(db);
      const user = await authenticateRequest(db, request);
      if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
      const url = new URL(request.url);
      const status = url.searchParams.get("status") ?? undefined;
      const limit = Number(url.searchParams.get("limit") ?? 50) || 50;
      return await runWithDbUser(user.id, async () => {
        await enforceV1RateLimit(db, request, user, "read");
        assertApiScope(user, "wallets:read");
        const space = await authorizeSpace(db, user, spaceId, "read", ["household", "trip", "society", "group"]);
        const settlements = await listV1Settlements(db, space, { status, limit });
        return Response.json({
          api: "wazen.v1",
          spaceId,
          settlements,
        }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
      });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
