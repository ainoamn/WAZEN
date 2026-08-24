import { ensureSchema, getRawDb } from "../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../lib/db-request-context";
import { errorResponse, ApiError } from "../../../../../../lib/security";
import { listV1SpaceAudit } from "../../../../../../lib/v1-audit";
import { withRequestTiming } from "../../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ spaceId: string }> },
) {
  return withRequestTiming("v1.audit.get", async () => {
    try {
      const { spaceId } = await context.params;
      const db = getRawDb();
      await ensureSchema(db);
      const user = await authenticateRequest(db, request);
      if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
      const url = new URL(request.url);
      const limit = Number(url.searchParams.get("limit") ?? 40) || 40;
      const q = url.searchParams.get("q") ?? undefined;
      return await runWithDbUser(user.id, async () => {
        assertApiScope(user, "wallets:read");
        await authorizeSpace(db, user, spaceId, "read");
        const audit = await listV1SpaceAudit(db, spaceId, { limit, q: q ?? undefined });
        return Response.json({
          api: "wazen.v1",
          spaceId,
          audit,
        }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
      });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
