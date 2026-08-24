import { z } from "zod";
import { ensureSchema, getRawDb } from "../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../lib/db-request-context";
import { errorResponse, ApiError, claimIdempotency, completeIdempotency, enforceWriteRequest, releaseIdempotency } from "../../../../../../lib/security";
import { appOrigin } from "../../../../../../lib/app-origin";
import { createV1Invite } from "../../../../../../lib/v1-invites";
import { enqueueIntegrationEvent } from "../../../../../../lib/integration-webhooks";
import { enforceV1RateLimit } from "../../../../../../lib/v1-rate-limit";
import { withRequestTiming } from "../../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ spaceId: string }> },
) {
  return withRequestTiming("v1.invites.post", async () => {
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
          email: z.string().email().max(254),
          role: z.enum(["member", "treasurer", "manager", "auditor", "viewer"]).optional(),
        }).safeParse(payload);
        if (!parsed.success) throw new ApiError(400, "INVALID_INVITATION");

        const replay = await claimIdempotency(db, user.id, "v1.createInvite", idempotencyKey);
        if (replay) {
          const body = replay && typeof replay === "object" ? replay : { ok: true };
          return Response.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
        }
        claimRef.current = { db, userId: user.id, key: idempotencyKey };

        const invitation = await createV1Invite(db, user, space, {
          email: parsed.data.email,
          role: parsed.data.role,
          origin: appOrigin(request),
        });
        const response = {
          api: "wazen.v1",
          ok: true,
          invitation,
        };
        await enqueueIntegrationEvent(db, space.owner_user_id, "member.invited", {
          spaceId,
          invitationId: invitation.id,
          email: invitation.email,
          role: invitation.role,
        }).catch(() => {});
        await completeIdempotency(db, user.id, idempotencyKey, response);
        claimRef.current = null;
        return Response.json(response, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
      });
    } catch (error) {
      if (claimRef.current) {
        try {
          await releaseIdempotency(claimRef.current.db, claimRef.current.userId, claimRef.current.key);
        } catch { /* ignore */ }
      }
      return errorResponse(error);
    }
  });
}
