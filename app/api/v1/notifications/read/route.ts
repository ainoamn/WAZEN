import { z } from "zod";
import { ensureSchema, getRawDb } from "../../../../../db/runtime";
import { authenticateRequest } from "../../../../../lib/auth";
import { runWithDbUser } from "../../../../../lib/db-request-context";
import { errorResponse, ApiError, enforceWriteRequest } from "../../../../../lib/security";
import { markNotificationsRead } from "../../../../../lib/user-notifications";
import { enforceV1RateLimit } from "../../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withRequestTiming("v1.notifications.read", async () => {
    try {
      enforceWriteRequest(request);
      const db = getRawDb();
      await ensureSchema(db);
      const user = await authenticateRequest(db, request);
      if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
      let payload: Record<string, unknown> = {};
      try {
        payload = (await request.json()) as Record<string, unknown>;
      } catch {
        payload = {};
      }
      return await runWithDbUser(user.id, async () => {
        await enforceV1RateLimit(db, request, user, "write");
        const parsed = z.object({
          ids: z.array(z.string().min(1).max(120)).max(100).optional(),
        }).safeParse(payload);
        if (!parsed.success) throw new ApiError(400, "INVALID_NOTIFICATIONS");
        await markNotificationsRead(db, user.id, parsed.data.ids);
        return Response.json({
          api: "wazen.v1",
          ok: true,
        }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
      });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
