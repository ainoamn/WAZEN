import { z } from "zod";
import { ensureSchema, getRawDb } from "../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../lib/db-request-context";
import { errorResponse, ApiError, claimIdempotency, completeIdempotency, enforceWriteRequest, releaseIdempotency } from "../../../../../../lib/security";
import { formatMoneyMinor } from "../../../../../../lib/money";
import { recordV1Contribution } from "../../../../../../lib/v1-contributions";
import { enqueueIntegrationEvent } from "../../../../../../lib/integration-webhooks";
import { enforceV1RateLimit } from "../../../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ spaceId: string }> },
) {
  return withRequestTiming("v1.contributions.post", async () => {
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
          memberId: z.string().min(1).max(120),
          amount: z.union([z.string(), z.number()]),
          description: z.string().trim().min(2).max(300).optional(),
          extraPolicy: z.enum(["personal_reserve", "voluntary_to_fund", "advance_credit"]).optional(),
          occurredAt: z.iso.datetime().optional(),
        }).safeParse(payload);
        if (!parsed.success) throw new ApiError(400, "INVALID_CONTRIBUTION_PAYMENT");

        const replay = await claimIdempotency(db, user.id, "v1.recordContribution", idempotencyKey);
        if (replay) {
          const body = replay && typeof replay === "object" ? replay : { ok: true };
          return Response.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
        }
        claimRef.current = { db, userId: user.id, key: idempotencyKey };

        const result = await recordV1Contribution(db, user, space, parsed.data);
        const currency = space.currency || "OMR";
        const response = {
          api: "wazen.v1",
          ok: true,
          ...result,
          amountLabel: formatMoneyMinor(result.amountMinor, currency, "en"),
          mandatoryLabel: formatMoneyMinor(result.mandatoryMinor, currency, "en"),
          surplusLabel: formatMoneyMinor(result.surplusMinor, currency, "en"),
        };
        await enqueueIntegrationEvent(db, space.owner_user_id, "contribution.recorded", {
          spaceId,
          ...result,
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
