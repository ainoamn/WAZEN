/** In-app notification feed helpers. */

import { enqueuePushOutbox } from "./web-push";

export type UserNotificationRow = {
  id: string;
  user_id: string;
  severity: "info" | "warning" | "danger";
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  href: string | null;
  read_at: string | null;
  created_at: string;
  dedupe_key: string | null;
};

export async function upsertUserNotifications(
  db: D1Database,
  userId: string,
  alerts: Array<{ id: string; severity: "info" | "warning" | "danger"; href?: string; ar: string; en: string }>,
) {
  if (!alerts.length) return;
  const now = new Date().toISOString();
  const statements = alerts.slice(0, 12).map((alert) =>
    db.prepare(`INSERT INTO user_notifications
      (id,user_id,severity,title_ar,title_en,body_ar,body_en,href,read_at,created_at,dedupe_key)
      VALUES (?,?,?,?,?,?,?,?,NULL,?,?)
      ON CONFLICT(user_id, dedupe_key) DO UPDATE SET
        severity=excluded.severity,
        title_ar=excluded.title_ar,
        title_en=excluded.title_en,
        body_ar=excluded.body_ar,
        body_en=excluded.body_en,
        href=excluded.href,
        created_at=CASE WHEN user_notifications.read_at IS NULL THEN excluded.created_at ELSE user_notifications.created_at END`)
      .bind(
        crypto.randomUUID(),
        userId,
        alert.severity,
        alert.ar.slice(0, 120),
        alert.en.slice(0, 120),
        alert.ar,
        alert.en,
        alert.href ?? null,
        now,
        alert.id.slice(0, 160),
      ),
  );
  await db.batch(statements);

  // Device push only for warning/danger, deduped so dashboard polls do not spam.
  for (const alert of alerts.slice(0, 12)) {
    if (alert.severity === "info") continue;
    try {
      await enqueuePushOutbox(
        db,
        userId,
        {
          title: alert.ar.slice(0, 80),
          body: alert.en.slice(0, 160),
          url: alert.href || "/home",
          tag: alert.id.slice(0, 80),
        },
        `alert:${alert.id}`,
      );
    } catch {
      /* outbox is best-effort */
    }
  }
}

export async function listUserNotifications(db: D1Database, userId: string, limit = 30) {
  const rows = await db.prepare(`
    SELECT id,user_id,severity,title_ar,title_en,body_ar,body_en,href,read_at,created_at,dedupe_key
    FROM user_notifications WHERE user_id=?
    ORDER BY created_at DESC LIMIT ?
  `).bind(userId, limit).all<UserNotificationRow>();
  return rows.results ?? [];
}

export async function markNotificationsRead(db: D1Database, userId: string, ids?: string[]) {
  const now = new Date().toISOString();
  if (ids?.length) {
    const placeholders = ids.map(() => "?").join(",");
    await db.prepare(`UPDATE user_notifications SET read_at=? WHERE user_id=? AND id IN (${placeholders}) AND read_at IS NULL`)
      .bind(now, userId, ...ids).run();
    return;
  }
  await db.prepare("UPDATE user_notifications SET read_at=? WHERE user_id=? AND read_at IS NULL").bind(now, userId).run();
}
