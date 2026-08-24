import { ensureSchema, getRawDb } from "../../../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../../../lib/db-request-context";
import { errorResponse, ApiError, claimIdempotency, completeIdempotency, enforceWriteRequest, releaseIdempotency } from "../../../../../../../../lib/security";
import { voidV1Expense } from "../../../../../../../../lib/v1-expenses";
import { enqueueIntegrationEvent } from "../../../../../../../../lib/integration-webhooks";
import { enforceV1RateLimit } from "../../../../../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ spaceId: string; expenseId: string }> },
) {
  return withRequestTiming("v1.expenses.void", async () => {
    const claimRef: { current: { db: D1Database; userId: string; key: string } | null } = { current: null };
    try {
      enforceWriteRequest(request);
      const { spaceId, expenseId } = await context.params;
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
        assertApiScope(user, "wallets:write");
        const space = await authorizeSpace(db, user, spaceId, "transact", ["household", "trip", "society", "group"]);

        const replay = await claimIdempotency(db, user.id, "v1.voidExpense", idempotencyKey);
        if (replay) {
          const body = replay && typeof replay === "object" ? replay : { ok: true };
          return Response.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
        }
        claimRef.current = { db, userId: user.id, key: idempotencyKey };

        const expense = await voidV1Expense(db, user, space, expenseId);
        const response = { api: "wazen.v1", ok: true, expense };
        await enqueueIntegrationEvent(db, space.owner_user_id, "expense.voided", {
          spaceId,
          expenseId: expense.id,
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
