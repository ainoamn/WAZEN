import { ensureSchema, getRawDb } from "../../../../db/runtime";
import { authenticateRequest } from "../../../../lib/auth";
import { runWithDbUser } from "../../../../lib/db-request-context";
import { errorResponse, ApiError } from "../../../../lib/security";
import { listUserNotifications } from "../../../../lib/user-notifications";
import { enforceV1RateLimit } from "../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../lib/request-timing";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withRequestTiming("v1.notifications.get", async () => {
    try {
      const db = getRawDb();
      await ensureSchema(db);
      const user = await authenticateRequest(db, request);
      if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
      const limit = Number(new URL(request.url).searchParams.get("limit") ?? 30) || 30;
      return await runWithDbUser(user.id, async () => {
        await enforceV1RateLimit(db, request, user, "read");
        const rows = await listUserNotifications(db, user.id, Math.min(100, Math.max(1, limit)));
        return Response.json({
          api: "wazen.v1",
          notifications: rows.map((row) => ({
            id: row.id,
            severity: row.severity,
            titleAr: row.title_ar,
            titleEn: row.title_en,
            bodyAr: row.body_ar,
            bodyEn: row.body_en,
            href: row.href,
            readAt: row.read_at,
            createdAt: row.created_at,
          })),
        }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
      });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
