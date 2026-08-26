import { ensureSchema, getRawDb } from "../../../../db/runtime";
import { ApiError, errorResponse } from "../../../../lib/security";
import { assertJobAuthorized } from "../../../../lib/job-auth";
import { drainEmailOutbox, isEmailProviderConfigured } from "../../../../lib/email-provider";

function authorized(request: Request) {
  assertJobAuthorized(request);
}

export async function POST(request: Request) {
  try {
    authorized(request);
    if (!isEmailProviderConfigured()) throw new ApiError(503, "EMAIL_PROVIDER_NOT_CONFIGURED");
    const db = getRawDb();
    await ensureSchema(db);
    const result = await drainEmailOutbox(db, 20);
    return Response.json({ ok: true, processed: result.processed, sent: result.sent });
  } catch (error) {
    return errorResponse(error);
  }
}
