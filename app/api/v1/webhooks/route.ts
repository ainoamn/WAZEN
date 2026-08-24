import { z } from "zod";
import { ensureSchema, getRawDb } from "../../../../db/runtime";
import { authenticateRequest } from "../../../../lib/auth";
import { assertApiScope } from "../../../../lib/authorization";
import { runWithDbUser } from "../../../../lib/db-request-context";
import {
  INTEGRATION_WEBHOOK_EVENTS,
  createIntegrationWebhook,
  listIntegrationWebhooks,
  listWebhookDeliveries,
} from "../../../../lib/integration-webhooks";
import { errorResponse, ApiError, claimIdempotency, completeIdempotency, enforceWriteRequest, releaseIdempotency } from "../../../../lib/security";
import { enforceV1RateLimit } from "../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../lib/request-timing";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withRequestTiming("v1.webhooks.get", async () => {
    try {
      const db = getRawDb();
      await ensureSchema(db);
      const user = await authenticateRequest(db, request);
      if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
      return await runWithDbUser(user.id, async () => {
        await enforceV1RateLimit(db, request, user, "read");
        assertApiScope(user, "webhooks:read");
        const url = new URL(request.url);
        const includeDeliveries = url.searchParams.get("deliveries") === "1";
        const [webhooks, deliveries] = await Promise.all([
          listIntegrationWebhooks(db, user.id),
          includeDeliveries
            ? listWebhookDeliveries(db, user.id, { limit: Number(url.searchParams.get("limit") ?? 20) || 20 })
            : Promise.resolve(undefined),
        ]);
        return Response.json({
          api: "wazen.v1",
          webhooks,
          ...(deliveries ? { deliveries } : {}),
          events: INTEGRATION_WEBHOOK_EVENTS,
        }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
      });
    } catch (error) {
      return errorResponse(error);
    }
  });
}

export async function POST(request: Request) {
  return withRequestTiming("v1.webhooks.post", async () => {
    const claimRef: { current: { db: D1Database; userId: string; key: string } | null } = { current: null };
    try {
      enforceWriteRequest(request);
      const db = getRawDb();
      await ensureSchema(db);
      const user = await authenticateRequest(db, request);
      if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
      const payload = (await request.json()) as Record<string, unknown>;
      const idempotencyKey = String(payload.idempotencyKey ?? request.headers.get("idempotency-key") ?? "");
      return await runWithDbUser(user.id, async () => {
        await enforceV1RateLimit(db, request, user, "write");
        assertApiScope(user, "webhooks:write");
        const parsed = z.object({
          url: z.string().url().max(500),
          events: z.array(z.string()).min(1).max(INTEGRATION_WEBHOOK_EVENTS.length),
        }).safeParse(payload);
        if (!parsed.success) throw new ApiError(400, "INVALID_WEBHOOK");

        const replay = await claimIdempotency(db, user.id, "v1.createWebhook", idempotencyKey);
        if (replay) {
          const body = replay && typeof replay === "object" ? replay : { ok: true };
          return Response.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
        }
        claimRef.current = { db, userId: user.id, key: idempotencyKey };

        const webhook = await createIntegrationWebhook(db, user.id, parsed.data);
        const response = { api: "wazen.v1", ok: true, webhook };
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
