import { ensureSchema, getRawDb } from "../../../../db/runtime";
import { errorResponse } from "../../../../lib/security";
import { assertJobAuthorized, recordJobRun } from "../../../../lib/job-auth";
import { processPushOutbox, isWebPushConfigured } from "../../../../lib/web-push";
import { configuredAllowedHosts, validateOutboundHttpsUrl } from "../../../../lib/outbound";
import { runMaintenanceJob } from "../../../../lib/jobs-maintenance";
import { runDuesDigest } from "../../../../lib/dues-digest";

export const runtime = "nodejs";
export const maxDuration = 60;

async function drainEmail(db: D1Database) {
  const configuredEndpoint = process.env.WAZEN_EMAIL_WEBHOOK_URL;
  const token = process.env.WAZEN_EMAIL_WEBHOOK_TOKEN;
  if (!configuredEndpoint || !token) {
    return { skipped: true as const, reason: "EMAIL_PROVIDER_NOT_CONFIGURED", processed: 0, sent: 0 };
  }
  const endpoint = validateOutboundHttpsUrl(configuredEndpoint, configuredAllowedHosts("email"));
  const pending = await db.prepare(
    "SELECT id,recipient,template,payload_json,attempts FROM email_outbox WHERE status='pending' AND attempts<5 ORDER BY created_at LIMIT 20",
  ).all<{ id: string; recipient: string; template: string; payload_json: string; attempts: number }>();
  let sent = 0;
  for (const message of pending.results ?? []) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: message.recipient, template: message.template, data: JSON.parse(message.payload_json) }),
      });
      if (!response.ok) throw new Error("PROVIDER_REJECTED");
      await db.prepare("UPDATE email_outbox SET status='sent',attempts=attempts+1,sent_at=? WHERE id=? AND status='pending'")
        .bind(new Date().toISOString(), message.id).run();
      sent += 1;
    } catch {
      await db.prepare("UPDATE email_outbox SET attempts=attempts+1,status=CASE WHEN attempts+1>=5 THEN 'failed' ELSE 'pending' END WHERE id=?")
        .bind(message.id).run();
    }
  }
  return { skipped: false as const, processed: pending.results?.length ?? 0, sent };
}

/**
 * Unified cron tick for Vercel Cron / external schedulers.
 * GET or POST /api/jobs/tick?tasks=email,push,maintenance
 * Default: email + push every run; dues digest at 06:00 UTC; maintenance at 02:00 UTC when tasks omitted.
 */
export async function GET(request: Request) {
  return runTick(request);
}

export async function POST(request: Request) {
  return runTick(request);
}

async function runTick(request: Request) {
  try {
    assertJobAuthorized(request);
    const db = getRawDb();
    await ensureSchema(db);
    const url = new URL(request.url);
    const requested = String(url.searchParams.get("tasks") ?? "")
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
    const hour = new Date().getUTCHours();
    const runEmail = !requested.length || requested.includes("email");
    const runPush = !requested.length || requested.includes("push");
    const runDues = requested.includes("dues") || (!requested.length && hour === 6);
    const runMaintenance = requested.includes("maintenance") || (!requested.length && hour === 2);

    const result: Record<string, unknown> = { ok: true, at: new Date().toISOString() };

    if (runEmail) {
      const email = await drainEmail(db);
      result.email = email;
      await recordJobRun(db, "email", email.skipped ? "skipped" : "ok", email);
    }
    if (runPush) {
      const push = await processPushOutbox(db, { limit: 25 });
      result.push = { ...push, vapidConfigured: isWebPushConfigured() };
      await recordJobRun(db, "push", push.configured ? "ok" : "skipped", push as unknown as Record<string, unknown>);
    }
    if (runDues) {
      const dues = await runDuesDigest(db);
      result.dues = dues;
      await recordJobRun(db, "dues", "ok", dues);
    }
    if (runMaintenance) {
      const maintenance = await runMaintenanceJob(db);
      result.maintenance = maintenance;
      await recordJobRun(db, "maintenance", "ok", maintenance);
    }

    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
