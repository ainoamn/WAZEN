import { ensureSchema, getRawDb } from "../../../../db/runtime";
import { authenticateRequest } from "../../../../lib/auth";
import { assertApiScope } from "../../../../lib/authorization";
import { runWithDbUser } from "../../../../lib/db-request-context";
import { errorResponse, ApiError } from "../../../../lib/security";
import { listV1Documents } from "../../../../lib/v1-documents";
import { enforceV1RateLimit } from "../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../lib/request-timing";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withRequestTiming("v1.documents.get", async () => {
    try {
      const db = getRawDb();
      await ensureSchema(db);
      const user = await authenticateRequest(db, request);
      if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
      return await runWithDbUser(user.id, async () => {
        await enforceV1RateLimit(db, request, user, "read");
        assertApiScope(user, "documents:read");
        const result = await listV1Documents(db, user.id);
        return Response.json({
          api: "wazen.v1",
          ...result,
        }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
      });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
