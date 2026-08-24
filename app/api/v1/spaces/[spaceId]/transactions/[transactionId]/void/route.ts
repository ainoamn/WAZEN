import { ensureSchema, getRawDb } from "../../../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../../../lib/db-request-context";
import { errorResponse, ApiError, claimIdempotency, completeIdempotency, enforceWriteRequest, releaseIdempotency } from "../../../../../../../../lib/security";
import { voidApprovedTransaction } from "../../../../../../../../lib/ledger-void";
import { coveringPeriod } from "../../../../../../../../lib/accounting-periods";
import { withRequestTiming } from "../../../../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ spaceId: string; transactionId: string }> },
) {
  return withRequestTiming("v1.transactions.void", async () => {
    const claimRef: { current: { db: D1Database; userId: string; key: string } | null } = { current: null };
    try {
      enforceWriteRequest(request);
      const { spaceId, transactionId } = await context.params;
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
        assertApiScope(user, "wallets:write");
        await authorizeSpace(db, user, spaceId, "transact");
        const txn = await db.prepare("SELECT * FROM transactions WHERE id=? AND space_id=?").bind(transactionId, spaceId).first<{
          id: string; space_id: string; member_id: string | null; kind: string; allocation: string;
          amount_minor: number; status: string; occurred_at: string; description_ar: string;
        }>();
        if (!txn) throw new ApiError(404, "TRANSACTION_NOT_FOUND");

        const periods = await db.prepare("SELECT id,space_id,starts_at,ends_at,closed_at,status FROM accounting_periods WHERE space_id=?")
          .bind(spaceId).all<{ id: string; space_id: string; starts_at: string; ends_at?: string | null; closed_at?: string | null; status: string }>();
        const period = coveringPeriod(periods.results ?? [], txn.occurred_at);
        if (period?.status === "closed") throw new ApiError(409, "PERIOD_CLOSED");

        const replay = await claimIdempotency(db, user.id, "v1.voidTransaction", idempotencyKey);
        if (replay) {
          const body = replay && typeof replay === "object" ? replay : { ok: true };
          return Response.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
        }
        claimRef.current = { db, userId: user.id, key: idempotencyKey };

        if (txn.status !== "voided" && txn.status !== "superseded") {
          await voidApprovedTransaction(db, txn, user.id, { recordStatus: "voided", closeOccurrence: true, via: "api.v1" });
        }
        const response = { api: "wazen.v1", ok: true, transactionId: txn.id, status: "voided" };
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
