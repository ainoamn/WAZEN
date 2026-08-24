import { z } from "zod";
import { ensureSchema, getRawDb } from "../../../../../db/runtime";
import { authenticateRequest } from "../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../lib/db-request-context";
import { errorResponse, ApiError, claimIdempotency, completeIdempotency, enforceWriteRequest, releaseIdempotency } from "../../../../../lib/security";
import { formatMoneyMinor } from "../../../../../lib/money";
import { updateV1Space } from "../../../../../lib/v1-spaces";
import { enqueueIntegrationEvent } from "../../../../../lib/integration-webhooks";
import { enforceV1RateLimit } from "../../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ spaceId: string }> },
) {
  return withRequestTiming("v1.spaces.get", async () => {
  try {
    const { spaceId } = await context.params;
    const db = getRawDb();
    await ensureSchema(db);
    const user = await authenticateRequest(db, request);
    if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
    return await runWithDbUser(user.id, async () => {
      await enforceV1RateLimit(db, request, user, "read");
      assertApiScope(user, "wallets:read");
      const space = await authorizeSpace(db, user, spaceId, "read");
      const memberCount = await db.prepare("SELECT COUNT(*) AS count FROM members WHERE space_id=? AND status='active'")
        .bind(spaceId).first<{ count: number }>();
      const txnCount = await db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE space_id=? AND COALESCE(status,'approved') NOT IN ('superseded')")
        .bind(spaceId).first<{ count: number }>();
      return Response.json({
        api: "wazen.v1",
        space: {
          id: space.id,
          type: space.type,
          currency: space.currency || "OMR",
          balanceMinor: Number(space.balance_minor) || 0,
          balanceLabel: formatMoneyMinor(Number(space.balance_minor) || 0, space.currency || "OMR", "en"),
          role: space.effective_role,
          memberCount: Number(memberCount?.count ?? 0),
          transactionCount: Number(txnCount?.count ?? 0),
        },
      }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
    });
  } catch (error) {
    return errorResponse(error);
  }
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ spaceId: string }> },
) {
  return withRequestTiming("v1.spaces.patch", async () => {
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
        assertApiScope(user, "members:write");
        const space = await authorizeSpace(db, user, spaceId, "members:write");
        const parsed = z.object({
          name: z.string().trim().min(2).max(80).optional(),
          goal: z.union([z.string(), z.number()]).optional(),
          monthlyContribution: z.union([z.string(), z.number()]).optional(),
          durationMonths: z.number().int().min(1).max(120).optional(),
          startsAt: z.string().min(8).max(40).optional(),
        }).safeParse(payload);
        if (!parsed.success) throw new ApiError(400, "INVALID_WALLET");

        const replay = await claimIdempotency(db, user.id, "v1.updateSpace", idempotencyKey);
        if (replay) {
          const body = replay && typeof replay === "object" ? replay : { ok: true };
          return Response.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
        }
        claimRef.current = { db, userId: user.id, key: idempotencyKey };

        const updated = await updateV1Space(db, user, space, parsed.data);
        const response = { api: "wazen.v1", ok: true, space: updated };
        await enqueueIntegrationEvent(db, space.owner_user_id, "space.updated", {
          spaceId,
          name: updated.nameAr,
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
