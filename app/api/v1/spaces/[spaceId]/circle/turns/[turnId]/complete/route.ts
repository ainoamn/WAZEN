import { ensureSchema, getRawDb } from "../../../../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../../../../lib/db-request-context";
import { errorResponse, ApiError, claimIdempotency, completeIdempotency, enforceWriteRequest, releaseIdempotency } from "../../../../../../../../../lib/security";
import { completeV1CircleTurn } from "../../../../../../../../../lib/v1-circle";
import { enqueueIntegrationEvent } from "../../../../../../../../../lib/integration-webhooks";
import { enforceV1RateLimit } from "../../../../../../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ spaceId: string; turnId: string }> },
) {
  return withRequestTiming("v1.circle.turn.complete", async () => {
    const claimRef: { current: { db: D1Database; userId: string; key: string } | null } = { current: null };
    try {
      enforceWriteRequest(request);
      const { spaceId, turnId } = await context.params;
      const db = getRawDb();
      await ensureSchema(db);
      const user = await authenticateRequest(db, request);
      if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
      let idempotencyKey = "";
      try {
        const payload = (await request.json()) as Record<string, unknown>;
        idempotencyKey = String(payload.idempotencyKey ?? request.headers.get("idempotency-key") ?? "");
      } catch {
        idempotencyKey = String(request.headers.get("idempotency-key") ?? "");
      }
      return await runWithDbUser(user.id, async () => {
        await enforceV1RateLimit(db, request, user, "write");
        assertApiScope(user, "circles:write");
        const space = await authorizeSpace(db, user, spaceId, "circle:write", ["society", "group"]);

        const replay = await claimIdempotency(db, user.id, "v1.completeCircleTurn", idempotencyKey);
        if (replay) {
          const body = replay && typeof replay === "object" ? replay : { ok: true };
          return Response.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
        }
        claimRef.current = { db, userId: user.id, key: idempotencyKey };

        const turn = await completeV1CircleTurn(db, user, space, turnId, { idempotencyKey });
        const response = { api: "wazen.v1", ok: true, turn };
        await enqueueIntegrationEvent(db, space.owner_user_id, "circle.turn_paid", {
          spaceId,
          turnId: turn.id,
          memberId: turn.memberId,
          amountMinor: turn.amountMinor,
        }).catch(() => {});
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
