import { z } from "zod";
import { ensureSchema, getRawDb } from "../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../lib/db-request-context";
import { errorResponse, ApiError, claimIdempotency, completeIdempotency, enforceWriteRequest, releaseIdempotency } from "../../../../../../lib/security";
import { linkV1Spaces, listV1SpaceLinks, unlinkV1Spaces } from "../../../../../../lib/v1-links";
import { enqueueIntegrationEvent } from "../../../../../../lib/integration-webhooks";
import { enforceV1RateLimit } from "../../../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ spaceId: string }> },
) {
  return withRequestTiming("v1.links.get", async () => {
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
        const links = await listV1SpaceLinks(db, spaceId);
        return Response.json({
          api: "wazen.v1",
          spaceId,
          links,
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
  return withRequestTiming("v1.links.post", async () => {
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
        }).safeParse(payload);
        if (!parsed.success) throw new ApiError(400, "INVALID_LINK");
        const linked = await authorizeSpace(db, user, parsed.data.linkedSpaceId, "read");

        const replay = await claimIdempotency(db, user.id, "v1.linkSpace", idempotencyKey);
        if (replay) {
          const body = replay && typeof replay === "object" ? replay : { ok: true };
          return Response.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
        }
        claimRef.current = { db, userId: user.id, key: idempotencyKey };

        const link = await linkV1Spaces(db, user, hub, linked);
        const response = { api: "wazen.v1", ok: true, link };
        await enqueueIntegrationEvent(db, hub.owner_user_id, "space.linked", {
          hubSpaceId: hub.id,
          linkedSpaceId: linked.id,
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
  context: { params: Promise<{ spaceId: string }> },
) {
  return withRequestTiming("v1.links.delete", async () => {
    const claimRef: { current: { db: D1Database; userId: string; key: string } | null } = { current: null };
    try {
      enforceWriteRequest(request);
      const { spaceId } = await context.params;
      const db = getRawDb();
      await ensureSchema(db);
      const user = await authenticateRequest(db, request);
      if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
      const url = new URL(request.url);
      let linkedSpaceId = url.searchParams.get("linkedSpaceId") ?? "";
      let idempotencyKey = String(request.headers.get("idempotency-key") ?? "");
      try {
        const payload = (await request.json()) as Record<string, unknown>;
        if (!linkedSpaceId) linkedSpaceId = String(payload.linkedSpaceId ?? "");
        idempotencyKey = String(payload.idempotencyKey ?? idempotencyKey);
      } catch { /* optional body */ }
      return await runWithDbUser(user.id, async () => {
        await enforceV1RateLimit(db, request, user, "write");
        assertApiScope(user, "members:write");
        const hub = await authorizeSpace(db, user, spaceId, "members:write", ["personal"]);
        await authorizeSpace(db, user, linkedSpaceId, "read");
        const parsed = z.object({ linkedSpaceId: z.string().min(1).max(120) }).safeParse({ linkedSpaceId });
        if (!parsed.success) throw new ApiError(400, "INVALID_LINK");

        const replay = await claimIdempotency(db, user.id, "v1.unlinkSpace", idempotencyKey);
        if (replay) {
          const body = replay && typeof replay === "object" ? replay : { ok: true };
          return Response.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
        }
        claimRef.current = { db, userId: user.id, key: idempotencyKey };

        const result = await unlinkV1Spaces(db, user, hub.id, parsed.data.linkedSpaceId);
        const response = { api: "wazen.v1", ok: true, ...result };
        await enqueueIntegrationEvent(db, hub.owner_user_id, "space.unlinked", {
          hubSpaceId: hub.id,
          linkedSpaceId: parsed.data.linkedSpaceId,
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
