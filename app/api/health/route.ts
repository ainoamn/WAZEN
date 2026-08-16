import {
  ensureSchema,
  getRawDb,
  isProductionLikeRuntime,
  productionAuthRisks,
  productionSetupChecklist,
} from "../../../db/runtime";

const VERSION = "0.2.0";

function isOpsRequest(request: Request) {
  const secret = process.env.WAZEN_JOB_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  const ops = isOpsRequest(request);
  const risks = productionAuthRisks();
  const productionLike = isProductionLikeRuntime();
  const setup = productionSetupChecklist();
  const setupPending = setup.filter((item) => !item.ok);
  const unsafeInProduction = productionLike && risks.length > 0;
  const publicHeaders = { "Cache-Control": "no-store" };

  try {
    const db = getRawDb();
    await ensureSchema(db);
    await db.prepare("SELECT 1 AS ok").first();
    const migrations = await db.prepare("SELECT COUNT(*) AS count FROM _wazen_migrations").first<{ count: number }>().catch(() => ({ count: -1 }));

    if (!ops) {
      const status = unsafeInProduction ? "unsafe" : setupPending.length ? "degraded" : "ok";
      return Response.json({
        status,
        version: VERSION,
        database: "ready",
      }, { status: unsafeInProduction || setupPending.length ? 503 : 200, headers: publicHeaders });
    }

    if (unsafeInProduction) {
      return Response.json({
        status: "unsafe",
        database: "ready",
        version: VERSION,
        schemaMigrations: Number(migrations?.count ?? -1),
        risks,
        setup,
        setupPending: setupPending.map((item) => item.id),
        checkedAt: new Date().toISOString(),
      }, { status: 503, headers: publicHeaders });
    }

    return Response.json({
      status: setupPending.length ? "degraded" : "ok",
      database: "ready",
      version: VERSION,
      schemaMigrations: Number(migrations?.count ?? -1),
      productionLike,
      risks,
      setup,
      setupPending: setupPending.map((item) => item.id),
      checkedAt: new Date().toISOString(),
    }, { status: setupPending.length ? 503 : 200, headers: publicHeaders });
  } catch {
    if (!ops) {
      return Response.json({ status: "degraded", version: VERSION, database: "unavailable" }, { status: 503, headers: publicHeaders });
    }
    return Response.json({
      status: "degraded",
      database: "unavailable",
      version: VERSION,
      productionLike,
      risks,
      setup,
      setupPending: setupPending.map((item) => item.id),
      nextStep: setup.find((item) => item.id === "database")?.hint ?? "Configure database credentials",
      checkedAt: new Date().toISOString(),
    }, { status: 503, headers: publicHeaders });
  }
}
