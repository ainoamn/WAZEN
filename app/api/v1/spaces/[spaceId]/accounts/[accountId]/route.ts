import { z } from "zod";
import { ensureSchema, getRawDb } from "../../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../../lib/db-request-context";
import { errorResponse, ApiError, claimIdempotency, completeIdempotency, enforceWriteRequest, releaseIdempotency } from "../../../../../../../lib/security";
import { deleteV1PersonalAccount, updateV1PersonalAccount } from "../../../../../../../lib/v1-accounts";
import { enqueueIntegrationEvent } from "../../../../../../../lib/integration-webhooks";
import { enforceV1RateLimit } from "../../../../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ spaceId: string; accountId: string }> },
) {
  return withRequestTiming("v1.accounts.patch", async () => {
    const claimRef: { current: { db: D1Database; userId: string; key: string } | null } = { current: null };
    try {
      enforceWriteRequest(request);
      const { spaceId, accountId } = await context.params;
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
          name: z.string().trim().min(2).max(80).optional(),
          kind: z.enum(["bank", "cash", "wallet"]).optional(),
          opening: z.union([z.string(), z.number()]).optional(),
          status: z.enum(["active", "paused", "archived"]).optional(),
        }).safeParse(payload);
        if (!parsed.success) throw new ApiError(400, "INVALID_ACCOUNT");
        if (
          parsed.data.name === undefined
          && parsed.data.kind === undefined
          && parsed.data.opening === undefined
          && parsed.data.status === undefined
        ) {
          throw new ApiError(400, "INVALID_ACCOUNT");
        }

        const replay = await claimIdempotency(db, user.id, "v1.updateAccount", idempotencyKey);
        if (replay) {
          const body = replay && typeof replay === "object" ? replay : { ok: true };
          return Response.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
        }
        claimRef.current = { db, userId: user.id, key: idempotencyKey };

        const account = await updateV1PersonalAccount(db, user, space, accountId, parsed.data);
        const response = { api: "wazen.v1", ok: true, account };
        await enqueueIntegrationEvent(db, space.owner_user_id, "account.updated", {
          spaceId: space.id,
          accountId: account.id,
          status: account.status,
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

export async function DELETE(
  request: Request,
  context: { params: Promise<{ spaceId: string; accountId: string }> },
) {
  return withRequestTiming("v1.accounts.delete", async () => {
    const claimRef: { current: { db: D1Database; userId: string; key: string } | null } = { current: null };
    try {
      enforceWriteRequest(request);
      const { spaceId, accountId } = await context.params;
      const db = getRawDb();
      await ensureSchema(db);
      const user = await authenticateRequest(db, request);
      if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
      const idempotencyKey = String(request.headers.get("idempotency-key") ?? "");
      return await runWithDbUser(user.id, async () => {
        await enforceV1RateLimit(db, request, user, "write");
        assertApiScope(user, "wallets:write");
        const space = await authorizeSpace(db, user, spaceId, "transact", ["personal"]);

        const replay = await claimIdempotency(db, user.id, "v1.deleteAccount", idempotencyKey);
        if (replay) {
          const body = replay && typeof replay === "object" ? replay : { ok: true };
          return Response.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
        }
        claimRef.current = { db, userId: user.id, key: idempotencyKey };

        const result = await deleteV1PersonalAccount(db, user, space.id, accountId);
        const response = { api: "wazen.v1", ok: true, ...result };
        await enqueueIntegrationEvent(db, space.owner_user_id, "account.deleted", {
          spaceId: space.id,
          accountId: result.id,
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
