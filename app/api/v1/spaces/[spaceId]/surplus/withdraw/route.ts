import { z } from "zod";
import { ensureSchema, getRawDb } from "../../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../../lib/db-request-context";
import { errorResponse, ApiError, claimIdempotency, completeIdempotency, enforceWriteRequest, releaseIdempotency } from "../../../../../../../lib/security";
import { formatMoneyMinor } from "../../../../../../../lib/money";
import { withdrawV1Surplus } from "../../../../../../../lib/v1-surplus";
import { withRequestTiming } from "../../../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ spaceId: string }> },
) {
  return withRequestTiming("v1.surplus.withdraw", async () => {
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
        assertApiScope(user, "settlements:write");
        const space = await authorizeSpace(db, user, spaceId, "settlements:write", ["household", "trip", "society", "group"]);
        const parsed = z.object({
          memberId: z.string().min(1).max(120),
          amount: z.union([z.string(), z.number()]),
          description: z.string().trim().min(2).max(300).optional(),
        }).safeParse(payload);
        if (!parsed.success) throw new ApiError(400, "INVALID_SURPLUS_WITHDRAWAL");

        const replay = await claimIdempotency(db, user.id, "v1.withdrawSurplus", idempotencyKey);
        if (replay) {
          const body = replay && typeof replay === "object" ? replay : { ok: true };
          return Response.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
        }
        claimRef.current = { db, userId: user.id, key: idempotencyKey };

        const result = await withdrawV1Surplus(db, user, space, parsed.data);
        const currency = space.currency || "OMR";
        const response = {
          api: "wazen.v1",
          ok: true,
          ...result,
          amountLabel: formatMoneyMinor(result.amountMinor, currency, "en"),
          remainingExtraLabel: formatMoneyMinor(result.remainingExtraMinor, currency, "en"),
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
