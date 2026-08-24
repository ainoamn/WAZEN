import { ensureSchema, getRawDb } from "../../../../db/runtime";
import { authenticateRequest } from "../../../../lib/auth";
import { assertApiScope } from "../../../../lib/authorization";
import { runWithDbUser } from "../../../../lib/db-request-context";
import { errorResponse, ApiError } from "../../../../lib/security";
import { formatMoneyMinor } from "../../../../lib/money";

export const runtime = "nodejs";

async function requireApiUser(request: Request) {
  const db = getRawDb();
  await ensureSchema(db);
  const user = await authenticateRequest(db, request);
  if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
  if (user.authType !== "api_key") {
    // Session users may call v1 for testing; API keys are the product path.
  }
  return { db, user };
}

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Wazen-Api": "v1",
    },
  });
}

export async function GET(request: Request) {
  try {
    const { db, user } = await requireApiUser(request);
    return await runWithDbUser(user.id, async () => {
      assertApiScope(user, "wallets:read");
      const spaces = await db.prepare(`
        SELECT id, name_ar, name_en, type, currency, balance_minor, goal_minor, status, created_at
        FROM spaces WHERE owner_user_id=? OR id IN (SELECT space_id FROM members WHERE user_id=? AND status='active')
        ORDER BY created_at DESC
      `).bind(user.id, user.id).all<{
        id: string; name_ar: string; name_en: string; type: string; currency: string;
        balance_minor: number; goal_minor: number; status: string | null; created_at: string;
      }>();
      return json({
        api: "wazen.v1",
        spaces: (spaces.results ?? []).map((space) => ({
          id: space.id,
          nameAr: space.name_ar,
          nameEn: space.name_en,
          type: space.type,
          currency: space.currency || "OMR",
          balanceMinor: Number(space.balance_minor) || 0,
          balanceLabel: formatMoneyMinor(Number(space.balance_minor) || 0, space.currency || "OMR", "en"),
          goalMinor: Number(space.goal_minor) || 0,
          status: space.status ?? "active",
          createdAt: space.created_at,
        })),
      });
    });
  } catch (error) {
    return errorResponse(error);
  }
}
