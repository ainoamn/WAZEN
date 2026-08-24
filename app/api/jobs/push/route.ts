import { ensureSchema, getRawDb } from "../../../../db/runtime";
import { ApiError, errorResponse } from "../../../../lib/security";
import { processPushOutbox, isWebPushConfigured } from "../../../../lib/web-push";

function authorized(request: Request) {
  const secret = process.env.WAZEN_JOB_SECRET ?? "";
  const supplied = request.headers.get("authorization") ?? "";
  if (secret.length < 32 || supplied !== `Bearer ${secret}`) throw new ApiError(401, "UNAUTHORIZED");
}

export async function POST(request: Request) {
  try {
    authorized(request);
    const db = getRawDb();
    await ensureSchema(db);
    const result = await processPushOutbox(db, { limit: 25 });
    return Response.json({
      ok: true,
      ...result,
      vapidConfigured: isWebPushConfigured(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
