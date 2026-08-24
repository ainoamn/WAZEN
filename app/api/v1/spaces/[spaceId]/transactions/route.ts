import { z } from "zod";
import { ensureSchema, getRawDb } from "../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../lib/db-request-context";
import { errorResponse, ApiError, claimIdempotency, completeIdempotency, enforceWriteRequest, releaseIdempotency } from "../../../../../../lib/security";
import { formatMoneyMinor } from "../../../../../../lib/money";
import { createV1Transaction } from "../../../../../../lib/v1-transactions";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ spaceId: string }> },
) {
  try {
    const { spaceId } = await context.params;
    const db = getRawDb();
    await ensureSchema(db);
    const user = await authenticateRequest(db, request);
    if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
    const url = new URL(request.url);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
    return await runWithDbUser(user.id, async () => {
      assertApiScope(user, "wallets:read");
      const space = await authorizeSpace(db, user, spaceId, "read");
      const rows = await db.prepare(`
        SELECT id, kind, allocation, amount_minor, description_ar, description_en, member_id, status, occurred_at
        FROM transactions WHERE space_id=? AND COALESCE(status,'approved')<>'superseded'
        ORDER BY occurred_at DESC LIMIT ?
      `).bind(spaceId, limit).all<{
        id: string; kind: string; allocation: string; amount_minor: number;
        description_ar: string; description_en: string; member_id: string | null;
        status: string | null; occurred_at: string;
      }>();
      const currency = space.currency || "OMR";
      return Response.json({
        api: "wazen.v1",
        spaceId,
        transactions: (rows.results ?? []).map((txn) => ({
          id: txn.id,
          kind: txn.kind,
          allocation: txn.allocation,
          amountMinor: Number(txn.amount_minor) || 0,
          amountLabel: formatMoneyMinor(Number(txn.amount_minor) || 0, currency, "en"),
          descriptionAr: txn.description_ar,
          descriptionEn: txn.description_en,
          memberId: txn.member_id,
          status: txn.status ?? "approved",
          occurredAt: txn.occurred_at,
        })),
      }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ spaceId: string }> },
) {
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
      assertApiScope(user, "wallets:write");
      const space = await authorizeSpace(db, user, spaceId, "transact");
      const parsed = z.object({
        kind: z.enum(["income", "expense", "contribution"]),
        description: z.string().trim().min(2).max(300),
        amount: z.union([z.string(), z.number()]),
        memberId: z.string().min(1).max(120).optional().nullable(),
        occurredAt: z.iso.datetime().optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_TRANSACTION");

      const replay = await claimIdempotency(db, user.id, "v1.createTransaction", idempotencyKey);
      if (replay) {
        const body = replay && typeof replay === "object" ? replay : { ok: true };
        return Response.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
      }
      claimRef.current = { db, userId: user.id, key: idempotencyKey };

      const transaction = await createV1Transaction(db, user, space, {
        kind: parsed.data.kind,
        description: parsed.data.description,
        amount: parsed.data.amount,
        memberId: parsed.data.memberId,
        occurredAt: parsed.data.occurredAt,
      });
      const response = {
        api: "wazen.v1",
        ok: true,
        transaction: {
          ...transaction,
          amountLabel: formatMoneyMinor(transaction.amountMinor, space.currency || "OMR", "en"),
        },
      };
      await completeIdempotency(db, user.id, idempotencyKey, response);
      claimRef.current = null;
      return Response.json(response, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
    });
  } catch (error) {
    if (claimRef.current) {
      try {
        await releaseIdempotency(claimRef.current.db, claimRef.current.userId, claimRef.current.key);
      } catch { /* stale claims cleaned by maintenance */ }
    }
    return errorResponse(error);
  }
}
