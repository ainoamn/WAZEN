import { z } from "zod";
import { ensureSchema, getRawDb } from "../../../../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../../../../lib/db-request-context";
import { errorResponse, ApiError, enforceWriteRequest } from "../../../../../../../../../lib/security";
import { previewV1MemberPay } from "../../../../../../../../../lib/v1-smart-pay";
import { enforceV1RateLimit } from "../../../../../../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ spaceId: string; memberId: string }> },
) {
  return withRequestTiming("v1.members.payPreview", async () => {
    try {
      enforceWriteRequest(request);
      const { spaceId, memberId } = await context.params;
      const db = getRawDb();
      await ensureSchema(db);
      const user = await authenticateRequest(db, request);
      if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
      const payload = (await request.json()) as Record<string, unknown>;
      return await runWithDbUser(user.id, async () => {
        await enforceV1RateLimit(db, request, user, "write");
        assertApiScope(user, "wallets:write");
        const space = await authorizeSpace(db, user, spaceId, "transact", ["household", "trip", "society", "group"]);
        const parsed = z.object({
          amount: z.union([z.string(), z.number()]),
          selectedIds: z.array(z.string().min(1).max(160)).max(120).optional(),
        }).safeParse(payload);
        if (!parsed.success) throw new ApiError(400, "INVALID_SMART_PAY");
        const preview = await previewV1MemberPay(db, space, memberId, parsed.data);
        return Response.json({
          api: "wazen.v1",
          spaceId,
          preview,
        }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
      });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
