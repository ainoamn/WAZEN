import { ensureSchema, getRawDb } from "../../../../db/runtime";
import { errorResponse } from "../../../../lib/security";
import { assertJobAuthorized } from "../../../../lib/job-auth";
import { runMaintenanceJob } from "../../../../lib/jobs-maintenance";

export async function POST(request: Request) {
  try {
    assertJobAuthorized(request);
    const db = getRawDb();
    await ensureSchema(db);
    return Response.json(await runMaintenanceJob(db));
  } catch (error) {
    return errorResponse(error);
  }
}
