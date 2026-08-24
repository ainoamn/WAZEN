import { z } from "zod";
import { ensureSchema, getRawDb } from "../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../lib/db-request-context";
import { errorResponse, ApiError, claimIdempotency, completeIdempotency, enforceWriteRequest, releaseIdempotency } from "../../../../../../lib/security";
import { listV1Periods, closeV1Period } from "../../../../../../lib/v1-periods";
import { enqueueIntegrationEvent } from "../../../../../../lib/integration-webhooks";
import { enforceV1RateLimit } from "../../../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ spaceId: string }> },
) {
  return withRequestTiming("v1.periods.get", async () => {
    try {
      const { spaceId } = await context.params;
      const db = getRawDb();
      await ensureSchema(db);
      const user = await authenticateRequest(db, request);
      if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
      const limit = Number(new URL(request.url).searchParams.get("limit") ?? 20) || 20;
      return await runWithDbUser(user.id, async () => {
        await enforceV1RateLimit(db, request, user, "read");
        assertApiScope(user, "wallets:read");
        await authorizeSpace(db, user, spaceId, "read", ["household", "trip", "society", "group"]);
        const periods = await listV1Periods(db, spaceId, { limit });
        return Response.json({
          api: "wazen.v1",
          spaceId,
          periods,
        }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
      });
    } catch (error) {
      return errorResponse(error);
    }
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ spaceId: string }> },
) {
  return withRequestTiming("v1.periods.close", async () => {
    const claimRef: { current: { db: D1Database; userId: string; key: string } | null } = { current: null };
    try {
      enforceWriteRequest(request);
      const { spaceId } = await context.params;
      const db = getRawDb();
      await ensureSchema(db);
      const user = await authenticateRequest(db, request);
      if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
      const payload = (await request.json()) as Record<string, unknown>;
      const idempotencyKey = String(payload.idempotencyKey ?? request.headers.get("idempotency-key") ?? "");
      return await runWithDbUser(user.id, async () => {
        await enforceV1RateLimit(db, request, user, "write");
        assertApiScope(user, "wallets:write");
        const space = await authorizeSpace(db, user, spaceId, "transact", ["household", "trip", "society", "group"]);
        const parsed = z.object({
          action: z.literal("close").optional(),
          label: z.string().trim().min(2).max(80).optional(),
        }).safeParse(payload);
        if (!parsed.success) throw new ApiError(400, "INVALID_PERIOD");

        const replay = await claimIdempotency(db, user.id, "v1.closePeriod", idempotencyKey);
        if (replay) {
          const body = replay && typeof replay === "object" ? replay : { ok: true };
          return Response.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
        }
        claimRef.current = { db, userId: user.id, key: idempotencyKey };

        const period = await closeV1Period(db, user, space, { label: parsed.data.label });
        const response = { api: "wazen.v1", ok: true, period };
        await enqueueIntegrationEvent(db, space.owner_user_id, "period.closed", {
          spaceId,
          periodId: period.id,
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
