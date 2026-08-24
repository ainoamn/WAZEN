import { z } from "zod";
import { ensureSchema, getRawDb } from "../../../../db/runtime";
import { authenticateRequest } from "../../../../lib/auth";
import { assertApiScope } from "../../../../lib/authorization";
import { runWithDbUser } from "../../../../lib/db-request-context";
import { errorResponse, ApiError, claimIdempotency, completeIdempotency, enforceWriteRequest, releaseIdempotency } from "../../../../lib/security";
import { formatMoneyMinor } from "../../../../lib/money";
import { createV1Space } from "../../../../lib/v1-spaces";
import { enqueueIntegrationEvent } from "../../../../lib/integration-webhooks";
import { enforceV1RateLimit } from "../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../lib/request-timing";

export const runtime = "nodejs";

async function requireApiUser(request: Request) {
  const db = getRawDb();
  await ensureSchema(db);
  const user = await authenticateRequest(db, request);
  if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
  if (user.authType !== "api_key") {
    // Session users may call v1 for testing; API keys are the product path.
  }
  return { db, user };
}

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Wazen-Api": "v1",
    },
  });
}

export async function GET(request: Request) {
  return withRequestTiming("v1.spaces.list", async () => {
  try {
    const { db, user } = await requireApiUser(request);
    return await runWithDbUser(user.id, async () => {
      await enforceV1RateLimit(db, request, user, "read");
      assertApiScope(user, "wallets:read");
      const spaces = await db.prepare(`
        SELECT id, name_ar, name_en, type, currency, balance_minor, goal_minor, status, created_at
        FROM spaces WHERE owner_user_id=? OR id IN (SELECT space_id FROM members WHERE user_id=? AND status='active')
        ORDER BY created_at DESC
      `).bind(user.id, user.id).all<{
        id: string; name_ar: string; name_en: string; type: string; currency: string;
        balance_minor: number; goal_minor: number; status: string | null; created_at: string;
      }>();
      return json({
        api: "wazen.v1",
        spaces: (spaces.results ?? []).map((space) => ({
          id: space.id,
          nameAr: space.name_ar,
          nameEn: space.name_en,
          type: space.type,
          currency: space.currency || "OMR",
          balanceMinor: Number(space.balance_minor) || 0,
          balanceLabel: formatMoneyMinor(Number(space.balance_minor) || 0, space.currency || "OMR", "en"),
          goalMinor: Number(space.goal_minor) || 0,
          status: space.status ?? "active",
          createdAt: space.created_at,
        })),
      });
    });
  } catch (error) {
    return errorResponse(error);
  }
  });
}

export async function POST(request: Request) {
  return withRequestTiming("v1.spaces.post", async () => {
    const claimRef: { current: { db: D1Database; userId: string; key: string } | null } = { current: null };
    try {
      enforceWriteRequest(request);
      const { db, user } = await requireApiUser(request);
      const payload = (await request.json()) as Record<string, unknown>;
      const idempotencyKey = String(payload.idempotencyKey ?? request.headers.get("idempotency-key") ?? "");
      return await runWithDbUser(user.id, async () => {
        await enforceV1RateLimit(db, request, user, "write");
        assertApiScope(user, "wallets:write");
        const parsed = z.object({
          name: z.string().trim().min(2).max(80),
          type: z.enum(["personal", "household", "trip", "society", "group"]),
          goal: z.union([z.string(), z.number()]).optional(),
          monthlyContribution: z.union([z.string(), z.number()]).optional(),
          durationMonths: z.number().int().min(1).max(120).optional(),
          dueDay: z.number().int().min(1).max(28).optional(),
          startsAt: z.string().min(8).max(40).optional(),
        }).safeParse(payload);
        if (!parsed.success) throw new ApiError(400, "INVALID_WALLET");

        const replay = await claimIdempotency(db, user.id, "v1.createSpace", idempotencyKey);
        if (replay) {
          const body = replay && typeof replay === "object" ? replay : { ok: true };
          return json({ ok: true, ...body });
        }
        claimRef.current = { db, userId: user.id, key: idempotencyKey };

        const space = await createV1Space(db, user, parsed.data);
        const response = { api: "wazen.v1", ok: true, space };
        await enqueueIntegrationEvent(db, user.id, "space.created", {
          spaceId: space.id,
          type: space.type,
        }).catch(() => {});
        await completeIdempotency(db, user.id, idempotencyKey, response);
        claimRef.current = null;
        return json(response);
      });
    } catch (error) {
      if (claimRef.current) {
        try { await releaseIdempotency(claimRef.current.db, claimRef.current.userId, claimRef.current.key); } catch { /* ignore */ }
      }
      return errorResponse(error);
    }
  });
}
