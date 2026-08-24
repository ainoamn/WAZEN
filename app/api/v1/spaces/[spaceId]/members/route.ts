import { z } from "zod";
import { ensureSchema, getRawDb } from "../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../lib/db-request-context";
import { errorResponse, ApiError, claimIdempotency, completeIdempotency, enforceWriteRequest, releaseIdempotency } from "../../../../../../lib/security";
import { formatMoneyMinor } from "../../../../../../lib/money";
import { createV1Member } from "../../../../../../lib/v1-members";
import { withRequestTiming } from "../../../../../../lib/request-timing";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ spaceId: string }> },
) {
  return withRequestTiming("v1.members.get", async () => {
    try {
      const { spaceId } = await context.params;
      const db = getRawDb();
      await ensureSchema(db);
      const user = await authenticateRequest(db, request);
      if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
      return await runWithDbUser(user.id, async () => {
        assertApiScope(user, "wallets:read");
        const space = await authorizeSpace(db, user, spaceId, "read");
        const rows = await db.prepare(`
          SELECT id, display_name, email, phone, role, status, due_minor, paid_minor, extra_minor, joined_at
          FROM members WHERE space_id=? ORDER BY display_name
        `).bind(spaceId).all<{
          id: string; display_name: string; email: string | null; phone: string | null;
          role: string; status: string | null; due_minor: number; paid_minor: number;
          extra_minor: number; joined_at: string | null;
        }>();
        const currency = space.currency || "OMR";
        return Response.json({
          api: "wazen.v1",
          spaceId,
          members: (rows.results ?? []).map((member) => ({
            id: member.id,
            displayName: member.display_name,
            email: member.email,
            phone: member.phone,
            role: member.role,
            status: member.status ?? "active",
            dueMinor: Number(member.due_minor) || 0,
            paidMinor: Number(member.paid_minor) || 0,
            extraMinor: Number(member.extra_minor) || 0,
            dueLabel: formatMoneyMinor(Number(member.due_minor) || 0, currency, "en"),
            paidLabel: formatMoneyMinor(Number(member.paid_minor) || 0, currency, "en"),
            joinedAt: member.joined_at,
          })),
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
  return withRequestTiming("v1.members.post", async () => {
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
        assertApiScope(user, "members:write");
        const space = await authorizeSpace(db, user, spaceId, "members:write", ["household", "trip", "society", "group"]);
        const parsed = z.object({
          displayName: z.string().trim().min(2).max(80),
          email: z.union([z.string().email().max(254), z.literal("")]).optional().nullable(),
          phone: z.string().trim().max(20).optional().nullable(),
          role: z.enum(["member", "treasurer", "manager", "auditor", "viewer"]).optional(),
          monthlyContribution: z.union([z.string(), z.number()]).optional(),
          durationMonths: z.number().int().min(1).max(120).optional(),
        }).safeParse(payload);
        if (!parsed.success) throw new ApiError(400, "INVALID_MEMBER");

        const replay = await claimIdempotency(db, user.id, "v1.createMember", idempotencyKey);
        if (replay) {
          const body = replay && typeof replay === "object" ? replay : { ok: true };
          return Response.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
        }
        claimRef.current = { db, userId: user.id, key: idempotencyKey };

        const member = await createV1Member(db, user, space, {
          displayName: parsed.data.displayName,
          email: parsed.data.email,
          phone: parsed.data.phone,
          role: parsed.data.role,
          monthlyContribution: parsed.data.monthlyContribution,
          durationMonths: parsed.data.durationMonths,
        });
        const response = {
          api: "wazen.v1",
          ok: true,
          member: {
            ...member,
            dueLabel: formatMoneyMinor(member.dueMinor, space.currency || "OMR", "en"),
            paidLabel: formatMoneyMinor(0, space.currency || "OMR", "en"),
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
        } catch { /* stale */ }
      }
      return errorResponse(error);
    }
  });
}
