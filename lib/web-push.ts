/** Optional Web Push helpers. Delivery needs WAZEN_VAPID_* env; subscriptions always store. */

import webpush from "web-push";

export function vapidPublicKey() {
  return process.env.WAZEN_VAPID_PUBLIC_KEY?.trim() || process.env.NEXT_PUBLIC_WAZEN_VAPID_PUBLIC_KEY?.trim() || "";
}

export function vapidPrivateKey() {
  return process.env.WAZEN_VAPID_PRIVATE_KEY?.trim() || "";
}

export function vapidSubject() {
  return process.env.WAZEN_VAPID_SUBJECT?.trim() || "mailto:support@wazen.bhd-om.com";
}

export function isWebPushConfigured() {
  return Boolean(vapidPublicKey() && vapidPrivateKey());
}

export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export function normalizePushSubscription(raw: unknown): PushSubscriptionInput | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const endpoint = String(row.endpoint ?? "").trim();
  const keys = row.keys as Record<string, unknown> | undefined;
  const p256dh = String(keys?.p256dh ?? "").trim();
  const auth = String(keys?.auth ?? "").trim();
  if (!endpoint.startsWith("https://") || !p256dh || !auth) return null;
  if (endpoint.length > 2048 || p256dh.length > 512 || auth.length > 512) return null;
  return { endpoint, keys: { p256dh, auth } };
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

function configureVapid() {
  if (!isWebPushConfigured()) return false;
  webpush.setVapidDetails(vapidSubject(), vapidPublicKey(), vapidPrivateKey());
  return true;
}

/** Queue a device push for later delivery by /api/jobs/push. Dedupes on (userId, dedupeKey). */
export async function enqueuePushOutbox(
  db: D1Database,
  userId: string,
  payload: PushPayload,
  dedupeKey: string,
) {
  const key = dedupeKey.slice(0, 160);
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO push_outbox (id,user_id,payload_json,status,attempts,dedupe_key,created_at,sent_at)
    VALUES (?,?,?,'pending',0,?,?,NULL)
    ON CONFLICT(user_id, dedupe_key) DO NOTHING
  `).bind(crypto.randomUUID(), userId, JSON.stringify(payload), key, now).run();
}

export async function sendWebPushToSubscription(
  subscription: PushSubscriptionInput,
  payload: PushPayload,
): Promise<"sent" | "gone" | "failed"> {
  if (!configureVapid()) return "failed";
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url || "/home",
        tag: payload.tag || "wazen",
      }),
      { TTL: 60 * 60 * 12, urgency: "normal" },
    );
    return "sent";
  } catch (error) {
    const status = Number((error as { statusCode?: number })?.statusCode ?? 0);
    if (status === 404 || status === 410) return "gone";
    return "failed";
  }
}

/** Drain pending push_outbox rows for all users (job) or one user. */
export async function processPushOutbox(db: D1Database, options?: { limit?: number; userId?: string }) {
  const limit = Math.min(50, Math.max(1, options?.limit ?? 20));
  const pending = options?.userId
    ? await db.prepare(`
        SELECT id,user_id,payload_json,attempts FROM push_outbox
        WHERE status='pending' AND attempts<5 AND user_id=?
        ORDER BY created_at LIMIT ?
      `).bind(options.userId, limit).all<{ id: string; user_id: string; payload_json: string; attempts: number }>()
    : await db.prepare(`
        SELECT id,user_id,payload_json,attempts FROM push_outbox
        WHERE status='pending' AND attempts<5
        ORDER BY created_at LIMIT ?
      `).bind(limit).all<{ id: string; user_id: string; payload_json: string; attempts: number }>();

  let sent = 0;
  let failed = 0;
  let gone = 0;
  if (!isWebPushConfigured()) {
    return { processed: pending.results?.length ?? 0, sent: 0, failed: 0, gone: 0, configured: false };
  }

  for (const row of pending.results ?? []) {
    let payload: PushPayload;
    try {
      payload = JSON.parse(row.payload_json) as PushPayload;
    } catch {
      await db.prepare("UPDATE push_outbox SET status='failed',attempts=attempts+1 WHERE id=?").bind(row.id).run();
      failed += 1;
      continue;
    }

    const subs = await db.prepare("SELECT id,endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=?")
      .bind(row.user_id)
      .all<{ id: string; endpoint: string; p256dh: string; auth: string }>();

    if (!(subs.results ?? []).length) {
      await db.prepare("UPDATE push_outbox SET status='failed',attempts=attempts+1 WHERE id=?").bind(row.id).run();
      failed += 1;
      continue;
    }

    let anySent = false;
    for (const sub of subs.results ?? []) {
      const result = await sendWebPushToSubscription(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      if (result === "sent") {
        anySent = true;
        sent += 1;
      } else if (result === "gone") {
        gone += 1;
        await db.prepare("DELETE FROM push_subscriptions WHERE id=?").bind(sub.id).run();
      } else {
        failed += 1;
      }
    }

    const now = new Date().toISOString();
    if (anySent) {
      await db.prepare("UPDATE push_outbox SET status='sent',attempts=attempts+1,sent_at=? WHERE id=?")
        .bind(now, row.id).run();
    } else {
      await db.prepare(`UPDATE push_outbox SET attempts=attempts+1,
        status=CASE WHEN attempts+1>=5 THEN 'failed' ELSE 'pending' END WHERE id=?`)
        .bind(row.id).run();
    }
  }

  return {
    processed: pending.results?.length ?? 0,
    sent,
    failed,
    gone,
    configured: true,
  };
}
