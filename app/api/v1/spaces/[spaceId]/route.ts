import { ensureSchema, getRawDb } from "../../../../../db/runtime";
import { authenticateRequest } from "../../../../../lib/auth";
import { assertApiScope, authorizeSpace } from "../../../../../lib/authorization";
import { runWithDbUser } from "../../../../../lib/db-request-context";
import { errorResponse, ApiError } from "../../../../../lib/security";
import { formatMoneyMinor } from "../../../../../lib/money";

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
      const memberCount = await db.prepare("SELECT COUNT(*) AS count FROM members WHERE space_id=? AND status='active'")
        .bind(spaceId).first<{ count: number }>();
      const txnCount = await db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE space_id=? AND COALESCE(status,'approved') NOT IN ('superseded')")
        .bind(spaceId).first<{ count: number }>();
      return Response.json({
        api: "wazen.v1",
        space: {
          id: space.id,
          type: space.type,
          currency: space.currency || "OMR",
          balanceMinor: Number(space.balance_minor) || 0,
          balanceLabel: formatMoneyMinor(Number(space.balance_minor) || 0, space.currency || "OMR", "en"),
          role: space.effective_role,
          memberCount: Number(memberCount?.count ?? 0),
          transactionCount: Number(txnCount?.count ?? 0),
        },
      }, { headers: { "Cache-Control": "no-store", "X-Wazen-Api": "v1" } });
    });
  } catch (error) {
    return errorResponse(error);
  }
}
