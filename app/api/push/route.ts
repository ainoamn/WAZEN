import { ensureSchema, getRawDb } from "../../../db/runtime";
import { authenticateRequest } from "../../../lib/auth";
import { enforceCsrf, enforceWriteRequest, errorResponse, ApiError, rateLimit } from "../../../lib/security";
import { normalizePushSubscription, vapidPublicKey, isWebPushConfigured } from "../../../lib/web-push";
import { listUserNotifications, markNotificationsRead } from "../../../lib/user-notifications";
import { runWithDbUser } from "../../../lib/db-request-context";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const db = getRawDb();
    await ensureSchema(db);
    const user = await authenticateRequest(db, request);
    if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
    return await runWithDbUser(user.id, async () => {
      const url = new URL(request.url);
      if (url.searchParams.get("view") === "vapid") {
        return Response.json({
          configured: isWebPushConfigured(),
          publicKey: vapidPublicKey() || null,
        }, { headers: { "Cache-Control": "no-store" } });
      }
      const notifications = await listUserNotifications(db, user.id, 40);
      const unread = notifications.filter((row) => !row.read_at).length;
      return Response.json({
        notifications: notifications.map((row) => ({
          id: row.id,
          severity: row.severity,
          titleAr: row.title_ar,
          titleEn: row.title_en,
          bodyAr: row.body_ar,
          bodyEn: row.body_en,
          href: row.href,
          readAt: row.read_at,
          createdAt: row.created_at,
        })),
        unread,
        pushConfigured: isWebPushConfigured(),
        vapidPublicKey: vapidPublicKey() || null,
      }, { headers: { "Cache-Control": "no-store" } });
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    enforceWriteRequest(request);
    const db = getRawDb();
    await ensureSchema(db);
    await rateLimit(db, request, "push-write", 40, 60);
    const user = await authenticateRequest(db, request);
    if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
    if (user.authType === "session") await enforceCsrf(db, request);
    return await runWithDbUser(user.id, async () => {
      const payload = await request.json() as Record<string, unknown>;
      const action = String(payload.action ?? "");
      const now = new Date().toISOString();

      if (action === "subscribe") {
        const sub = normalizePushSubscription(payload.subscription);
        if (!sub) throw new ApiError(400, "INVALID_PUSH_SUBSCRIPTION");
        const ua = request.headers.get("user-agent")?.slice(0, 300) ?? null;
        await db.prepare(`INSERT INTO push_subscriptions (id,user_id,endpoint,p256dh,auth,user_agent,created_at,last_seen_at)
          VALUES (?,?,?,?,?,?,?,?)
          ON CONFLICT(endpoint) DO UPDATE SET
            user_id=excluded.user_id,
            p256dh=excluded.p256dh,
            auth=excluded.auth,
            user_agent=excluded.user_agent,
            last_seen_at=excluded.last_seen_at`)
          .bind(crypto.randomUUID(), user.id, sub.endpoint, sub.keys.p256dh, sub.keys.auth, ua, now, now).run();
        return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
      }

      if (action === "unsubscribe") {
        const endpoint = String(payload.endpoint ?? "").trim();
        if (!endpoint) throw new ApiError(400, "INVALID_PUSH_SUBSCRIPTION");
        await db.prepare("DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?").bind(user.id, endpoint).run();
        return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
      }

      if (action === "markRead") {
        const ids = Array.isArray(payload.ids) ? payload.ids.map((id) => String(id)).filter(Boolean).slice(0, 100) : undefined;
        await markNotificationsRead(db, user.id, ids);
        return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
      }

      throw new ApiError(400, "UNSUPPORTED_ACTION");
    });
  } catch (error) {
    return errorResponse(error);
  }
}
