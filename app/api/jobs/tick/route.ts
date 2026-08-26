import { ensureSchema, getRawDb } from "../../../../db/runtime";
import { errorResponse } from "../../../../lib/security";
import { assertJobAuthorized, recordJobRun } from "../../../../lib/job-auth";
import { processPushOutbox, isWebPushConfigured } from "../../../../lib/web-push";
import { drainEmailOutbox } from "../../../../lib/email-provider";
import { runMaintenanceJob } from "../../../../lib/jobs-maintenance";
import { runDuesDigest } from "../../../../lib/dues-digest";
import { processPrivacyRequests } from "../../../../lib/privacy-requests";
import { processWebhookOutbox } from "../../../../lib/integration-webhooks";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Unified cron tick for Vercel Cron / external schedulers.
 * GET or POST /api/jobs/tick?tasks=email,push,maintenance,privacy,dues,webhooks
 * Default: email + push + webhooks every run; privacy at 03:00 UTC; dues digest at 06:00 UTC; maintenance at 02:00 UTC when tasks omitted.
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
    const runWebhooks = !requested.length || requested.includes("webhooks");
    const runPrivacy = requested.includes("privacy") || (!requested.length && hour === 3);
    const runDues = requested.includes("dues") || (!requested.length && hour === 6);
    const runMaintenance = requested.includes("maintenance") || (!requested.length && hour === 2);

    const result: Record<string, unknown> = { ok: true, at: new Date().toISOString() };

    if (runEmail) {
      const email = await drainEmailOutbox(db);
      result.email = email;
      await recordJobRun(db, "email", email.skipped ? "skipped" : "ok", email);
    }
    if (runPush) {
      const push = await processPushOutbox(db, { limit: 25 });
      result.push = { ...push, vapidConfigured: isWebPushConfigured() };
      await recordJobRun(db, "push", push.configured ? "ok" : "skipped", push as unknown as Record<string, unknown>);
    }
    if (runWebhooks) {
      const webhooks = await processWebhookOutbox(db);
      result.webhooks = webhooks;
      await recordJobRun(db, "webhooks", "ok", webhooks);
    }
    if (runPrivacy) {
      const privacy = await processPrivacyRequests(db);
      result.privacy = privacy;
      await recordJobRun(db, "privacy", "ok", privacy);
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
