import { ensureSchema, getRawDb } from "../../../../../../db/runtime";
import { authenticateRequest } from "../../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../../lib/db-request-context";
import { errorResponse, ApiError } from "../../../../../../lib/security";
import { formatMoneyMinor } from "../../../../../../lib/money";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ spaceId: string }> },
) {
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
}
