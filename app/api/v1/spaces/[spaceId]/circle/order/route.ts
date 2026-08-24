import { z } from "zod";
import { ensureSchema, getRawDb } from "../../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../../lib/db-request-context";
import { errorResponse, ApiError, claimIdempotency, completeIdempotency, enforceWriteRequest, releaseIdempotency } from "../../../../../../../lib/security";
import { setV1CircleOrder } from "../../../../../../../lib/v1-circle";
import { enqueueIntegrationEvent } from "../../../../../../../lib/integration-webhooks";
import { enforceV1RateLimit } from "../../../../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ spaceId: string }> },
) {
  return withRequestTiming("v1.circle.order", async () => {
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
        assertApiScope(user, "circles:write");
        const space = await authorizeSpace(db, user, spaceId, "circle:write", ["society", "group"]);
        const parsed = z.object({
          mode: z.enum(["manual", "round_robin", "draw", "alphabetical", "hierarchical"]),
          amount: z.union([z.string(), z.number()]),
          monthlyContribution: z.union([z.string(), z.number()]),
          durationMonths: z.number().int().min(1).max(120),
          dueDay: z.number().int().min(1).max(28),
          memberIds: z.array(z.string().min(1).max(120)).optional(),
          previousRecipientId: z.string().min(1).max(120).optional(),
          seed: z.string().min(16).max(200).optional(),
        }).safeParse(payload);
        if (!parsed.success) throw new ApiError(400, "INVALID_CIRCLE_ORDER");

        const replay = await claimIdempotency(db, user.id, "v1.setCircleOrder", idempotencyKey);
        if (replay) {
          const body = replay && typeof replay === "object" ? replay : { ok: true };
          return Response.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
        }
        claimRef.current = { db, userId: user.id, key: idempotencyKey };

        const circle = await setV1CircleOrder(db, user, space, parsed.data);
        const response = { api: "wazen.v1", ok: true, circle };
        await enqueueIntegrationEvent(db, space.owner_user_id, "circle.order_set", {
          spaceId,
          mode: parsed.data.mode,
          turnCount: circle.turns.length,
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
