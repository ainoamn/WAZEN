import { ensureSchema, getRawDb } from "../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../lib/auth";
import { assertApiScope } from "../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../lib/db-request-context";
import { enqueueWebhookTest } from "../../../../../../lib/integration-webhooks";
import { errorResponse, ApiError, claimIdempotency, completeIdempotency, enforceWriteRequest, releaseIdempotency } from "../../../../../../lib/security";
import { enforceV1RateLimit } from "../../../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ webhookId: string }> },
) {
  return withRequestTiming("v1.webhooks.test", async () => {
    const claimRef: { current: { db: D1Database; userId: string; key: string } | null } = { current: null };
    try {
      enforceWriteRequest(request);
      const { webhookId } = await context.params;
      if (!webhookId?.trim()) throw new ApiError(400, "INVALID_WEBHOOK");
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
      const idempotencyKey = String(payload.idempotencyKey ?? request.headers.get("idempotency-key") ?? "");
      return await runWithDbUser(user.id, async () => {
        await enforceV1RateLimit(db, request, user, "write");
        assertApiScope(user, "webhooks:write");

        const replay = await claimIdempotency(db, user.id, "v1.testWebhook", idempotencyKey);
        if (replay) {
          const body = replay && typeof replay === "object" ? replay : { ok: true };
          return Response.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
        }
        claimRef.current = { db, userId: user.id, key: idempotencyKey };

        const result = await enqueueWebhookTest(db, user.id, webhookId.trim());
        const response = {
          api: "wazen.v1",
          ok: true,
          deliveryId: result.deliveryId,
          event: result.event,
        };
        await completeIdempotency(db, user.id, idempotencyKey, response);
        claimRef.current = null;
        return Response.json(response, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
      });
    } catch (error) {
      if (claimRef.current) {
        try { await releaseIdempotency(claimRef.current.db, claimRef.current.userId, claimRef.current.key); } catch { /* ignore */ }
      }
      return errorResponse(error);
    }
  });
}
