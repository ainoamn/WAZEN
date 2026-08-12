import { ensureSchema, getRawDb, isProductionLikeRuntime, productionAuthRisks } from "../../../db/runtime";

export async function GET() {
  const risks = productionAuthRisks();
  const productionLike = isProductionLikeRuntime();
  const unsafeInProduction = productionLike && risks.length > 0;

  try {
    const db = getRawDb();
    await ensureSchema(db);
    await db.prepare("SELECT 1 AS ok").first();
    const migrations = await db.prepare("SELECT COUNT(*) AS count FROM _wazen_migrations").first<{ count: number }>().catch(() => ({ count: -1 }));

    if (unsafeInProduction) {
      return Response.json({
        status: "unsafe",
        database: "ready",
        version: "0.2.0",
        schemaMigrations: Number(migrations?.count ?? -1),
        risks,
        checkedAt: new Date().toISOString(),
      }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }

    return Response.json({
      status: "ok",
      database: "ready",
      version: "0.2.0",
      schemaMigrations: Number(migrations?.count ?? -1),
      productionLike,
      risks,
      checkedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({
      status: "degraded",
      database: "unavailable",
      version: "0.2.0",
      productionLike,
      risks,
      checkedAt: new Date().toISOString(),
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
