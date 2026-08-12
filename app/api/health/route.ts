import { ensureSchema, getRawDb } from "../../../db/runtime";

export async function GET() {
  try {
    const db = getRawDb(); await ensureSchema(db);
    await db.prepare("SELECT 1 AS ok").first();
    return Response.json({ status: "ok", database: "ready", version: "0.2.0", checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "degraded", database: "unavailable", checkedAt: new Date().toISOString() }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

