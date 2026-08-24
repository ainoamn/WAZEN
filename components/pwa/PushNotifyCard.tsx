"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { apiFetch } from "../../lib/client-api";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function PushNotifyCard({ locale }: { locale: "ar" | "en" }) {
  const [status, setStatus] = useState<"idle" | "ready" | "subscribed" | "unsupported" | "missing-key">("idle");
  const [busy, setBusy] = useState(false);
  const [publicKey, setPublicKey] = useState("");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    void (async () => {
      const response = await fetch("/api/push?view=vapid", { cache: "no-store" });
      const data = await response.json() as { configured?: boolean; publicKey?: string | null };
      if (!data.publicKey) {
        setStatus("missing-key");
        return;
      }
      setPublicKey(data.publicKey);
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      setStatus(existing ? "subscribed" : "ready");
    })().catch(() => setStatus("unsupported"));
  }, []);

  const subscribe = async () => {
    if (!publicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const response = await apiFetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "subscribe", subscription: subscription.toJSON() }),
      });
      if (response.ok) setStatus("subscribed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker"><Bell size={15} />{locale === "ar" ? "إشعارات الجهاز" : "Device alerts"}</span>
          <h2>{locale === "ar" ? "تنبيهات الدفع على الجوال" : "Push alerts on your phone"}</h2>
          <p className="modal-note">
            {status === "unsupported"
              ? (locale === "ar" ? "المتصفح لا يدعم إشعارات الدفع." : "This browser does not support push notifications.")
              : status === "missing-key"
                ? (locale === "ar" ? "لم تُضبط مفاتيح VAPID على الخادم بعد. التنبيهات داخل اللوحة تعمل." : "VAPID keys are not configured on the server yet. In-app alerts still work.")
                : status === "subscribed"
                  ? (locale === "ar" ? "هذا الجهاز مشترك في التنبيهات." : "This device is subscribed for alerts.")
                  : (locale === "ar" ? "فعّل التنبيهات لاستلام تذكيرات المستحقات والرصيد عند ضبط الخادم." : "Enable alerts to receive dues/balance reminders when the server is configured.")}
          </p>
        </div>
      </div>
      {status === "ready" ? (
        <button type="button" className="primary-button" disabled={busy} onClick={() => void subscribe()}>
          {busy ? "…" : (locale === "ar" ? "تفعيل إشعارات الجهاز" : "Enable device alerts")}
        </button>
      ) : null}
    </article>
  );
}
