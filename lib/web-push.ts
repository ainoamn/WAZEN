/** Optional Web Push helpers. Delivery needs WAZEN_VAPID_* env; subscriptions always store. */

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
