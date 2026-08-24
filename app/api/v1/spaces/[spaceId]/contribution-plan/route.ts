import { z } from "zod";
import { ensureSchema, getRawDb } from "../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../lib/db-request-context";
import { errorResponse, ApiError, claimIdempotency, completeIdempotency, enforceWriteRequest, releaseIdempotency } from "../../../../../../lib/security";
import { getV1ContributionPlan, updateV1ContributionPlan } from "../../../../../../lib/v1-contribution-plan";
import { enqueueIntegrationEvent } from "../../../../../../lib/integration-webhooks";
import { enforceV1RateLimit } from "../../../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ spaceId: string }> },
) {
  return withRequestTiming("v1.contributionPlan.get", async () => {
    try {
      const { spaceId } = await context.params;
      const db = getRawDb();
      await ensureSchema(db);
      const user = await authenticateRequest(db, request);
      if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
      return await runWithDbUser(user.id, async () => {
        await enforceV1RateLimit(db, request, user, "read");
        assertApiScope(user, "wallets:read");
        const space = await authorizeSpace(db, user, spaceId, "read", ["household", "trip", "society", "group"]);
        const plan = await getV1ContributionPlan(db, space);
        return Response.json({
          api: "wazen.v1",
          spaceId,
          plan,
        }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
      });
    } catch (error) {
      return errorResponse(error);
    }
  });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ spaceId: string }> },
) {
  return withRequestTiming("v1.contributionPlan.put", async () => {
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
        const space = await authorizeSpace(db, user, spaceId, "members:write", ["household", "trip", "society", "group"]);
        const parsed = z.object({
          monthlyContribution: z.union([z.string(), z.number()]).optional(),
          durationMonths: z.number().int().min(1).max(120).optional(),
          dueDay: z.number().int().min(1).max(28).optional(),
          extraPolicy: z.enum(["personal_reserve", "voluntary_to_fund", "advance_credit"]).optional(),
          startsAt: z.string().min(8).max(40).optional(),
        }).safeParse(payload);
        if (!parsed.success) throw new ApiError(400, "INVALID_CONTRIBUTION_PLAN");

        const replay = await claimIdempotency(db, user.id, "v1.updateContributionPlan", idempotencyKey);
        if (replay) {
          const body = replay && typeof replay === "object" ? replay : { ok: true };
          return Response.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
        }
        claimRef.current = { db, userId: user.id, key: idempotencyKey };

        const plan = await updateV1ContributionPlan(db, user, space, parsed.data);
        const response = { api: "wazen.v1", ok: true, plan };
        await enqueueIntegrationEvent(db, space.owner_user_id, "contribution_plan.updated", {
          spaceId,
          planId: plan?.id ?? null,
          amountMinor: plan?.amountMinor ?? null,
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
