"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function registerWazenServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    // Still useful on local HTTPS tunnels; skip noisy localhost unless forced.
    if (process.env.NODE_ENV === "development" && !window.localStorage.getItem("wazen_sw_dev")) return;
  }
  void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
}

export function PwaInstallCard({ locale }: { locale: "ar" | "en" }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    registerWazenServiceWorker();
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    if (standalone) setInstalled(true);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferred) return;
    setBusy(true);
    try {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="panel pwa-install-card">
      <div className="panel-heading">
        <div>
          <span className="section-kicker"><Smartphone size={15} />{locale === "ar" ? "تطبيق الجوال" : "Mobile app"}</span>
          <h2>{locale === "ar" ? "ثبّت وازن على جهازك" : "Install Wazen on your device"}</h2>
          <p className="modal-note">
            {installed
              ? (locale === "ar" ? "التطبيق مثبت ويعمل بوضع مستقل." : "App is installed and running standalone.")
              : (locale === "ar"
                ? "اختصار على الشاشة الرئيسية مع عمل أوضح دون اتصال للصفحات الثابتة. البيانات الحية تبقى من الخادم."
                : "Home-screen shortcut with a clearer offline shell for static pages. Live data still comes from the server.")}
          </p>
        </div>
      </div>
      {!installed && deferred ? (
        <button type="button" className="primary-button" disabled={busy} onClick={() => void install()}>
          <Download size={16} />
          {busy ? "…" : (locale === "ar" ? "تثبيت التطبيق" : "Install app")}
        </button>
      ) : !installed ? (
        <p className="modal-note">
          {locale === "ar"
            ? "من متصفح الجوال: القائمة ← إضافة إلى الشاشة الرئيسية / تثبيت التطبيق."
            : "On mobile browser: Menu → Add to Home Screen / Install app."}
        </p>
      ) : null}
    </article>
  );
}
