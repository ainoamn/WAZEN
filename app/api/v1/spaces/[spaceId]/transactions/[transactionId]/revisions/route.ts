import { ensureSchema, getRawDb } from "../../../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../../../lib/db-request-context";
import { errorResponse, ApiError } from "../../../../../../../../lib/security";
import { listV1TransactionRevisions } from "../../../../../../../../lib/v1-transactions";
import { enforceV1RateLimit } from "../../../../../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ spaceId: string; transactionId: string }> },
) {
  return withRequestTiming("v1.transactions.revisions", async () => {
    try {
      const { spaceId, transactionId } = await context.params;
      const db = getRawDb();
      await ensureSchema(db);
      const user = await authenticateRequest(db, request);
      if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
      return await runWithDbUser(user.id, async () => {
        await enforceV1RateLimit(db, request, user, "read");
        assertApiScope(user, "wallets:read");
        await authorizeSpace(db, user, spaceId, "read");
        const revisions = await listV1TransactionRevisions(db, spaceId, transactionId);
        return Response.json({
          api: "wazen.v1",
          spaceId,
          transactionId,
          revisions,
        }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
      });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
