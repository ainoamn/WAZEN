import { z } from "zod";
import { ensureSchema, getRawDb } from "../../../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../../../lib/db-request-context";
import { errorResponse, ApiError } from "../../../../../../../../lib/security";
import { getV1MemberLedger } from "../../../../../../../../lib/v1-member-ledger";
import { enforceV1RateLimit } from "../../../../../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ spaceId: string; memberId: string }> },
) {
  return withRequestTiming("v1.members.ledger", async () => {
    try {
      const { spaceId, memberId } = await context.params;
      const db = getRawDb();
      await ensureSchema(db);
      const user = await authenticateRequest(db, request);
      if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
      return await runWithDbUser(user.id, async () => {
        await enforceV1RateLimit(db, request, user, "read");
        assertApiScope(user, "wallets:read");
        await authorizeSpace(db, user, spaceId, "read", ["household", "trip", "society", "group"]);
        const url = new URL(request.url);
        const focusParsed = z.enum(["all", "paid", "spent", "owes", "credit"]).safeParse(url.searchParams.get("focus") ?? "all");
        if (!focusParsed.success) throw new ApiError(400, "INVALID_FOCUS");
        const ledger = await getV1MemberLedger(db, spaceId, memberId, focusParsed.data);
        return Response.json({
          api: "wazen.v1",
          spaceId,
          ...ledger,
        }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
      });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
