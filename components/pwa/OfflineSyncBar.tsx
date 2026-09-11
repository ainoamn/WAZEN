"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { notifyLiveRefresh } from "../../lib/live-sync";
import { flushOfflineQueue, OFFLINE_QUEUE_EVENT, readOfflineQueue } from "../../lib/offline-queue";

function csrfToken() {
  if (typeof document === "undefined") return "";
  for (const name of ["__Host-wazen_csrf", "wazen_csrf"]) {
    const prefix = `${name}=`;
    const value = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
    if (value) return decodeURIComponent(value.slice(prefix.length));
  }
  return "";
}

async function flushWhenOnline() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { sent: 0, remaining: readOfflineQueue().length };
  await fetch("/api/auth", { cache: "no-store", credentials: "same-origin" }).catch(() => {});
  const token = csrfToken();
  const result = await flushOfflineQueue(async (url, init = {}) => {
    const headers = new Headers(init.headers);
    if (token) headers.set("x-csrf-token", token);
    return fetch(url, { ...init, headers, credentials: "same-origin" });
  });
  if (result.sent > 0) notifyLiveRefresh();
  return result;
}

export function OfflineSyncBar({ locale = "ar" }: { locale?: "ar" | "en" }) {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [flushing, setFlushing] = useState(false);

  useEffect(() => {
    const sync = () => {
      setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
      setPending(readOfflineQueue().length);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "FLUSH_OFFLINE_QUEUE") void flushWhenOnline().then(sync);
    };
    const onOnline = () => {
      sync();
      void flushWhenOnline().then(sync);
    };
    sync();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", sync);
    window.addEventListener(OFFLINE_QUEUE_EVENT, sync);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    if (navigator.onLine && readOfflineQueue().length) void flushWhenOnline().then(sync);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", sync);
      window.removeEventListener(OFFLINE_QUEUE_EVENT, sync);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);

  if (online && pending === 0) return null;

  return (
    <div className="pwa-install-banner offline-sync-bar" role="status">
      <div className="pwa-install-banner-copy">
        {online ? <RefreshCw size={18} /> : <CloudOff size={18} />}
        <div>
          <strong>
            {online
              ? (locale === "ar" ? "رفع في الخلفية" : "Uploading in the background")
              : (locale === "ar" ? "تعمل بدون شبكة" : "Working offline")}
          </strong>
          <span>
            {online
              ? (locale === "ar" ? `${pending} عملية بانتظار الرفع إلى السيرفر.` : `${pending} change(s) waiting to upload.`)
              : (locale === "ar"
                ? "التنقل والبيانات من جهازك. عند عودة الشبكة يحدّث التطبيق نفسه ويرفع ما حُفظ."
                : "Pages and data stay on this device. When the network returns, Wazen updates and uploads in the background.")}
          </span>
        </div>
      </div>
      {online && pending > 0 ? (
        <button type="button" className="secondary-button compact" disabled={flushing} onClick={() => {
          setFlushing(true);
          void flushWhenOnline().finally(() => setFlushing(false));
        }}>
          {flushing ? "…" : (locale === "ar" ? "رفع الآن" : "Upload now")}
        </button>
      ) : null}
    </div>
  );
}
