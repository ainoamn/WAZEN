import { ensureSchema, getRawDb } from "../../../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../../../lib/db-request-context";
import { errorResponse, ApiError, claimIdempotency, completeIdempotency, enforceWriteRequest, releaseIdempotency } from "../../../../../../../../lib/security";
import { settleV1Settlement } from "../../../../../../../../lib/v1-settlements";
import { enqueueIntegrationEvent } from "../../../../../../../../lib/integration-webhooks";
import { enforceV1RateLimit } from "../../../../../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ spaceId: string; settlementId: string }> },
) {
  return withRequestTiming("v1.settlements.settle", async () => {
    const claimRef: { current: { db: D1Database; userId: string; key: string } | null } = { current: null };
    try {
      enforceWriteRequest(request);
      const { spaceId, settlementId } = await context.params;
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
        assertApiScope(user, "settlements:write");
        await authorizeSpace(db, user, spaceId, "settlements:write", ["household", "trip", "society", "group"]);
        const owned = await db.prepare("SELECT id FROM settlements WHERE id=? AND space_id=?")
          .bind(settlementId, spaceId).first();
        if (!owned) throw new ApiError(404, "SETTLEMENT_NOT_FOUND");

        const replay = await claimIdempotency(db, user.id, "v1.settleSettlement", idempotencyKey);
        if (replay) {
          const body = replay && typeof replay === "object" ? replay : { ok: true };
          return Response.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
        }
        claimRef.current = { db, userId: user.id, key: idempotencyKey };

        const settlement = await settleV1Settlement(db, user, settlementId, { idempotencyKey });
        const { ownerUserId, ...publicSettlement } = settlement;
        const response = { api: "wazen.v1", ok: true, settlement: publicSettlement };
        await enqueueIntegrationEvent(db, ownerUserId, "settlement.settled", {
          spaceId,
          settlementId: settlement.id,
          amountMinor: settlement.amountMinor,
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
