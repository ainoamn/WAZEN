import { ensureSchema, getRawDb } from "../../../../db/runtime";
import { errorResponse } from "../../../../lib/security";
import { processPushOutbox, isWebPushConfigured } from "../../../../lib/web-push";
import { assertJobAuthorized } from "../../../../lib/job-auth";

export async function POST(request: Request) {
  try {
    assertJobAuthorized(request);
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
