/** Outbound integration webhooks for Business API events. */

import { createHmac, randomBytes } from "node:crypto";
import { prepareAudit } from "./audit";
import { ApiError } from "./security";
import { validatePublicHttpsWebhookUrl } from "./outbound";

export const INTEGRATION_WEBHOOK_EVENTS = [
  "transaction.created",
  "transaction.voided",
  "member.invited",
  "surplus.withdrawn",
  "contribution.recorded",
  "member.updated",
  "document.created",
  "settlement.settled",
  "period.closed",
  "period.reopened",
  "contribution_plan.updated",
] as const;

export type IntegrationWebhookEvent = (typeof INTEGRATION_WEBHOOK_EVENTS)[number];

function isoNow() {
  return new Date().toISOString();
}

export async function listIntegrationWebhooks(db: D1Database, userId: string) {
  const rows = await db.prepare(`
    SELECT id, url, events_json, status, created_at, revoked_at
    FROM integration_webhooks WHERE user_id=? ORDER BY created_at DESC LIMIT 50
  `).bind(userId).all<{
    id: string; url: string; events_json: string; status: string; created_at: string; revoked_at: string | null;
  }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    url: row.url,
    events: JSON.parse(row.events_json || "[]") as string[],
    status: row.status,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  }));
}

export async function createIntegrationWebhook(
  db: D1Database,
  userId: string,
  input: { url: string; events: string[] },
) {
  const url = validatePublicHttpsWebhookUrl(input.url).toString();
  const events = [...new Set(input.events)].filter((event) =>
    (INTEGRATION_WEBHOOK_EVENTS as readonly string[]).includes(event),
  );
  if (!events.length) throw new ApiError(400, "INVALID_WEBHOOK_EVENTS");
  const active = await db.prepare(
    "SELECT COUNT(*) AS count FROM integration_webhooks WHERE user_id=? AND status='active'",
  ).bind(userId).first<{ count: number }>();
  if (Number(active?.count ?? 0) >= 5) throw new ApiError(403, "WEBHOOK_LIMIT");

  const id = crypto.randomUUID();
  const secret = randomBytes(24).toString("hex");
  const now = isoNow();
  await db.batch([
    db.prepare(`
      INSERT INTO integration_webhooks (id,user_id,url,secret,events_json,status,created_at)
      VALUES (?,?,?,?,?,'active',?)
    `).bind(id, userId, url, secret, JSON.stringify(events), now),
    prepareAudit(db, {
      userId,
      action: "integration.webhook_created",
      entityType: "integration_webhook",
      entityId: id,
      metadata: { url, events },
      createdAt: now,
    }),
  ]);
  return { id, url, events, secret, createdAt: now };
}

export async function revokeIntegrationWebhook(db: D1Database, userId: string, webhookId: string) {
  const now = isoNow();
  const result = await db.prepare(`
    UPDATE integration_webhooks SET status='revoked', revoked_at=?
    WHERE id=? AND user_id=? AND status='active'
  `).bind(now, webhookId, userId).run();
  if (!result.meta.changes) throw new ApiError(404, "WEBHOOK_NOT_FOUND");
  await prepareAudit(db, {
    userId,
    action: "integration.webhook_revoked",
    entityType: "integration_webhook",
    entityId: webhookId,
    metadata: {},
    createdAt: now,
  }).run();
  return { ok: true as const, id: webhookId };
}

export async function listWebhookDeliveries(db: D1Database, userId: string, options?: { limit?: number }) {
  const limit = Math.min(50, Math.max(1, options?.limit ?? 20));
  const rows = await db.prepare(`
    SELECT id, webhook_id, event, status, attempts, last_error, created_at, sent_at
    FROM webhook_outbox WHERE user_id=?
    ORDER BY created_at DESC LIMIT ?
  `).bind(userId, limit).all<{
    id: string; webhook_id: string; event: string; status: string; attempts: number;
    last_error: string | null; created_at: string; sent_at: string | null;
  }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    webhookId: row.webhook_id,
    event: row.event,
    status: row.status,
    attempts: Number(row.attempts) || 0,
    lastError: row.last_error,
    createdAt: row.created_at,
    sentAt: row.sent_at,
  }));
}

/** Queue a one-off test delivery for a specific webhook (ignores events_json filter). */
export async function enqueueWebhookTest(db: D1Database, userId: string, webhookId: string) {
  const hook = await db.prepare(
    "SELECT id,status FROM integration_webhooks WHERE id=? AND user_id=? LIMIT 1",
  ).bind(webhookId, userId).first<{ id: string; status: string }>();
  if (!hook || hook.status !== "active") throw new ApiError(404, "WEBHOOK_NOT_FOUND");
  const now = isoNow();
  const body = JSON.stringify({
    api: "wazen.v1",
    event: "webhook.test",
    occurredAt: now,
    data: { ok: true, message: "Wazen webhook test ping" },
  });
  const id = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO webhook_outbox (id,webhook_id,user_id,event,payload_json,status,attempts,created_at)
    VALUES (?,?,?,?,?,'pending',0,?)
  `).bind(id, webhookId, userId, "webhook.test", body, now).run();
  return { ok: true as const, deliveryId: id, event: "webhook.test" as const };
}

export async function enqueueIntegrationEvent(
  db: D1Database,
  userId: string,
  event: IntegrationWebhookEvent,
  payload: Record<string, unknown>,
) {
  const hooks = await db.prepare(`
    SELECT id FROM integration_webhooks
    WHERE user_id=? AND status='active' AND events_json LIKE ?
  `).bind(userId, `%"${event}"%`).all<{ id: string }>();
  if (!hooks.results?.length) return { enqueued: 0 };
  const now = isoNow();
  const body = JSON.stringify({
    api: "wazen.v1",
    event,
    occurredAt: now,
    data: payload,
  });
  const statements = hooks.results.map((hook) =>
    db.prepare(`
      INSERT INTO webhook_outbox (id,webhook_id,user_id,event,payload_json,status,attempts,created_at)
      VALUES (?,?,?,?,?,'pending',0,?)
    `).bind(crypto.randomUUID(), hook.id, userId, event, body, now),
  );
  await db.batch(statements);
  return { enqueued: statements.length };
}

function signBody(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export async function processWebhookOutbox(db: D1Database, options?: { limit?: number }) {
  const limit = Math.min(40, Math.max(1, options?.limit ?? 20));
  const pending = await db.prepare(`
    SELECT o.id, o.webhook_id, o.payload_json, o.attempts, w.url, w.secret, w.status AS webhook_status
    FROM webhook_outbox o
    JOIN integration_webhooks w ON w.id=o.webhook_id
    WHERE o.status='pending' AND o.attempts<5
    ORDER BY o.created_at LIMIT ?
  `).bind(limit).all<{
    id: string; webhook_id: string; payload_json: string; attempts: number;
    url: string; secret: string; webhook_status: string;
  }>();

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of pending.results ?? []) {
    if (row.webhook_status !== "active") {
      await db.prepare("UPDATE webhook_outbox SET status='skipped',attempts=attempts+1 WHERE id=?")
        .bind(row.id).run();
      skipped += 1;
      continue;
    }
    try {
      const signature = signBody(row.secret, row.payload_json);
      const response = await fetch(row.url, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: {
          "content-type": "application/json",
          "user-agent": "Wazen-Webhooks/1.0",
          "x-wazen-signature": `sha256=${signature}`,
          "x-wazen-event": String(JSON.parse(row.payload_json).event ?? ""),
        },
        body: row.payload_json,
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      await db.prepare("UPDATE webhook_outbox SET status='sent',attempts=attempts+1,sent_at=?,last_error=NULL WHERE id=? AND status='pending'")
        .bind(isoNow(), row.id).run();
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 200) : "DELIVERY_FAILED";
      await db.prepare(`
        UPDATE webhook_outbox
        SET attempts=attempts+1,
            last_error=?,
            status=CASE WHEN attempts+1>=5 THEN 'failed' ELSE 'pending' END
        WHERE id=?
      `).bind(message, row.id).run();
      failed += 1;
    }
  }
  return { processed: pending.results?.length ?? 0, sent, failed, skipped };
}
