import { z } from "zod";
import { ensureSchema, getRawDb } from "../../../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../../../lib/db-request-context";
import { errorResponse, ApiError, claimIdempotency, completeIdempotency, enforceWriteRequest, releaseIdempotency } from "../../../../../../../../lib/security";
import { confirmV1PersonalOccurrence } from "../../../../../../../../lib/v1-occurrences";
import { enqueueIntegrationEvent } from "../../../../../../../../lib/integration-webhooks";
import { enforceV1RateLimit } from "../../../../../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ spaceId: string; occurrenceId: string }> },
) {
  return withRequestTiming("v1.occurrences.confirm", async () => {
    const claimRef: { current: { db: D1Database; userId: string; key: string } | null } = { current: null };
    try {
      enforceWriteRequest(request);
      const { spaceId, occurrenceId } = await context.params;
      const db = getRawDb();
      await ensureSchema(db);
      const user = await authenticateRequest(db, request);
      if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
      const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const idempotencyKey = String(payload.idempotencyKey ?? request.headers.get("idempotency-key") ?? "");
      return await runWithDbUser(user.id, async () => {
        await enforceV1RateLimit(db, request, user, "write");
        assertApiScope(user, "wallets:write");
        const space = await authorizeSpace(db, user, spaceId, "transact", ["personal"]);
        const parsed = z.object({
          amount: z.union([z.string(), z.number()]).optional(),
          accountId: z.string().min(1).max(120).optional().nullable(),
        }).safeParse(payload);
        if (!parsed.success) throw new ApiError(400, "INVALID_OCCURRENCE");

        const replay = await claimIdempotency(db, user.id, "v1.confirmOccurrence", idempotencyKey);
        if (replay) {
          const body = replay && typeof replay === "object" ? replay : { ok: true };
          return Response.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
        }
        claimRef.current = { db, userId: user.id, key: idempotencyKey };

        const occurrence = await confirmV1PersonalOccurrence(db, user, space, occurrenceId, parsed.data);
        const response = { api: "wazen.v1", ok: true, occurrence };
        await enqueueIntegrationEvent(db, space.owner_user_id, "occurrence.posted", {
          spaceId: space.id,
          occurrenceId: occurrence.id,
          ruleId: occurrence.ruleId,
          transactionId: occurrence.transactionId,
          amountMinor: occurrence.amountMinor,
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
