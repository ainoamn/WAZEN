import { z } from "zod";
import { ensureSchema, getRawDb } from "../../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../../lib/db-request-context";
import { errorResponse, ApiError, claimIdempotency, completeIdempotency, enforceWriteRequest, releaseIdempotency } from "../../../../../../../lib/security";
import { patchV1Member } from "../../../../../../../lib/v1-member-patch";
import { enqueueIntegrationEvent } from "../../../../../../../lib/integration-webhooks";
import { enforceV1RateLimit } from "../../../../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ spaceId: string; memberId: string }> },
) {
  return withRequestTiming("v1.members.patch", async () => {
    const claimRef: { current: { db: D1Database; userId: string; key: string } | null } = { current: null };
    try {
      enforceWriteRequest(request);
      const { spaceId, memberId } = await context.params;
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
          role: z.enum(["member", "treasurer", "manager", "auditor", "viewer"]).optional(),
          status: z.enum(["active", "inactive"]).optional(),
          displayName: z.string().trim().min(2).max(80).optional(),
        }).safeParse(payload);
        if (!parsed.success) throw new ApiError(400, "INVALID_MEMBER_PATCH");

        const replay = await claimIdempotency(db, user.id, "v1.patchMember", idempotencyKey);
        if (replay) {
          const body = replay && typeof replay === "object" ? replay : { ok: true };
          return Response.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
        }
        claimRef.current = { db, userId: user.id, key: idempotencyKey };

        const member = await patchV1Member(db, user, space, memberId, parsed.data);
        const response = { api: "wazen.v1", ok: true, member };
        await enqueueIntegrationEvent(db, space.owner_user_id, "member.updated", {
          spaceId: member.spaceId,
          memberId: member.id,
          displayName: member.displayName,
          role: member.role,
          status: member.status,
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
