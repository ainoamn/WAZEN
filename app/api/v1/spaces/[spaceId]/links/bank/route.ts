import { z } from "zod";
import { ensureSchema, getRawDb } from "../../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../../lib/db-request-context";
import { errorResponse, ApiError, claimIdempotency, completeIdempotency, enforceWriteRequest, releaseIdempotency } from "../../../../../../../lib/security";
import { setV1WalletBankLink } from "../../../../../../../lib/v1-links";
import { enqueueIntegrationEvent } from "../../../../../../../lib/integration-webhooks";
import { enforceV1RateLimit } from "../../../../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  context: { params: Promise<{ spaceId: string }> },
) {
  return withRequestTiming("v1.links.bank.put", async () => {
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
        const hub = await authorizeSpace(db, user, spaceId, "members:write", ["personal"]);
        const parsed = z.object({
          linkedSpaceId: z.string().min(1).max(120),
          accountId: z.string().max(120).nullable(),
        }).safeParse(payload);
        if (!parsed.success) throw new ApiError(400, "INVALID_BANK_LINK");
        await authorizeSpace(db, user, parsed.data.linkedSpaceId, "read");

        const replay = await claimIdempotency(db, user.id, "v1.setWalletBankLink", idempotencyKey);
        if (replay) {
          const body = replay && typeof replay === "object" ? replay : { ok: true };
          return Response.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
        }
        claimRef.current = { db, userId: user.id, key: idempotencyKey };

        const result = await setV1WalletBankLink(db, user, {
          hubSpaceId: hub.id,
          linkedSpaceId: parsed.data.linkedSpaceId,
          accountId: parsed.data.accountId,
        });
        const event = result.accountId ? "space.bank_linked" as const : "space.bank_unlinked" as const;
        const response = { api: "wazen.v1", ok: true, link: result };
        await enqueueIntegrationEvent(db, hub.owner_user_id, event, {
          hubSpaceId: hub.id,
          linkedSpaceId: parsed.data.linkedSpaceId,
          accountId: result.accountId,
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
