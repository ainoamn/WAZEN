import { ensureSchema, getRawDb } from "../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../lib/db-request-context";
import { errorResponse, ApiError } from "../../../../../../lib/security";
import { exportV1SpaceCsv } from "../../../../../../lib/v1-export";
import { enforceV1RateLimit } from "../../../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ spaceId: string }> },
) {
  return withRequestTiming("v1.export.get", async () => {
    try {
      const { spaceId } = await context.params;
      const db = getRawDb();
      await ensureSchema(db);
      const user = await authenticateRequest(db, request);
      if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
      const url = new URL(request.url);
      const kind = (url.searchParams.get("kind") ?? "transactions") as "transactions" | "members";
      if (kind !== "transactions" && kind !== "members") throw new ApiError(400, "INVALID_EXPORT");
      const locale = url.searchParams.get("locale") === "en" ? "en" : "ar";
      const limit = Number(url.searchParams.get("limit") ?? 1000) || 1000;
      return await runWithDbUser(user.id, async () => {
        await enforceV1RateLimit(db, request, user, "read");
        assertApiScope(user, "wallets:read");
        const space = await authorizeSpace(db, user, spaceId, "read");
        const file = await exportV1SpaceCsv(db, space, { kind, locale, limit });
        return new Response(file.body, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${file.filename}"`,
            "Cache-Control": "no-store",
            "X-Wazen-Api": "v1",
          },
        });
      });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
