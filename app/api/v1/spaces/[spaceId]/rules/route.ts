import { z } from "zod";
import { ensureSchema, getRawDb } from "../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../lib/db-request-context";
import { errorResponse, ApiError, claimIdempotency, completeIdempotency, enforceWriteRequest, releaseIdempotency } from "../../../../../../lib/security";
import { createV1PersonalRule, listV1PersonalRules } from "../../../../../../lib/v1-rules";
import { enqueueIntegrationEvent } from "../../../../../../lib/integration-webhooks";
import { enforceV1RateLimit } from "../../../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ spaceId: string }> },
) {
  return withRequestTiming("v1.rules.get", async () => {
    try {
      const { spaceId } = await context.params;
      const db = getRawDb();
      await ensureSchema(db);
      const user = await authenticateRequest(db, request);
      if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
      return await runWithDbUser(user.id, async () => {
        await enforceV1RateLimit(db, request, user, "read");
        assertApiScope(user, "wallets:read");
        await authorizeSpace(db, user, spaceId, "read", ["personal"]);
        const result = await listV1PersonalRules(db, spaceId);
        return Response.json({
          api: "wazen.v1",
          spaceId,
          ...result,
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
  return withRequestTiming("v1.rules.post", async () => {
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
        const space = await authorizeSpace(db, user, spaceId, "transact", ["personal"]);
        const parsed = z.object({
          accountId: z.string().min(1).max(120).optional().nullable(),
          kind: z.enum(["income", "expense"]),
          name: z.string().trim().min(2).max(80),
          amountMode: z.enum(["fixed", "variable"]).optional(),
          schedule: z.enum(["monthly", "once", "unscheduled"]).optional(),
          amount: z.union([z.string(), z.number()]).optional(),
          dueDay: z.coerce.number().int().min(1).max(28).optional(),
          startsAt: z.string().min(8).max(40),
          endsAt: z.string().min(8).max(40).optional(),
          total: z.union([z.string(), z.number()]).optional(),
          durationMonths: z.coerce.number().int().min(0).max(360).optional(),
        }).safeParse(payload);
        if (!parsed.success) throw new ApiError(400, "INVALID_RULE");

        const replay = await claimIdempotency(db, user.id, "v1.createRule", idempotencyKey);
        if (replay) {
          const body = replay && typeof replay === "object" ? replay : { ok: true };
          return Response.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
        }
        claimRef.current = { db, userId: user.id, key: idempotencyKey };

        const rule = await createV1PersonalRule(db, user, space, {
          accountId: parsed.data.accountId,
          kind: parsed.data.kind,
          name: parsed.data.name,
          amountMode: parsed.data.amountMode,
          schedule: parsed.data.schedule,
          amount: parsed.data.amount,
          dueDay: parsed.data.dueDay,
          startsAt: parsed.data.startsAt,
          endsAt: parsed.data.endsAt,
          total: parsed.data.total,
          durationMonths: parsed.data.durationMonths,
        });
        const response = { api: "wazen.v1", ok: true, rule };
        await enqueueIntegrationEvent(db, space.owner_user_id, "rule.created", {
          spaceId: space.id,
          ruleId: rule.id,
          kind: rule.kind,
          schedule: rule.schedule,
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
