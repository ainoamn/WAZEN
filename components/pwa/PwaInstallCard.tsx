"use client";

import { Download, Smartphone, X } from "lucide-react";
import { ReactNode, useCallback, useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "wazen-pwa-install-dismissed-until";

export function registerWazenServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    if (process.env.NODE_ENV === "development" && !window.localStorage.getItem("wazen_sw_dev")) return;
  }
  void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
}

export function isWazenInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia("(display-mode: standalone)").matches
    || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  return standalone;
}

export function usePwaInstallState() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    registerWazenServiceWorker();
    if (isWazenInstalled()) setInstalled(true);
    const ua = navigator.userAgent || "";
    setIos(/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

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

  const promptInstall = useCallback(async () => {
    if (!deferred) return false;
    setBusy(true);
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      setDeferred(null);
      return choice.outcome === "accepted";
    } finally {
      setBusy(false);
    }
  }, [deferred]);

  return { installed, deferred, canNativePrompt: Boolean(deferred), busy, ios, promptInstall };
}

export function PwaInstallCard({ locale }: { locale: "ar" | "en" }) {
  const { installed, canNativePrompt, busy, ios, promptInstall } = usePwaInstallState();

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
                ? "اختصار على الشاشة الرئيسية لفتح وازن كتطبيق. البيانات الحية تبقى من الخادم."
                : "Add a home-screen shortcut to open Wazen like an app. Live data still comes from the server.")}
          </p>
        </div>
      </div>
      {!installed && canNativePrompt ? (
        <button type="button" className="primary-button" disabled={busy} onClick={() => void promptInstall()}>
          <Download size={16} />
          {busy ? "…" : (locale === "ar" ? "تثبيت التطبيق" : "Install app")}
        </button>
      ) : !installed ? (
        <p className="modal-note">
          {ios
            ? (locale === "ar"
              ? "في Safari: زر المشاركة ← «إضافة إلى الشاشة الرئيسية»."
              : "In Safari: Share → Add to Home Screen.")
            : (locale === "ar"
              ? "من قائمة المتصفح: إضافة إلى الشاشة الرئيسية / تثبيت التطبيق."
              : "From the browser menu: Add to Home Screen / Install app.")}
        </p>
      ) : null}
    </article>
  );
}

/** Compact sitewide prompt — hidden when already installed or temporarily dismissed. */
export function PwaInstallBanner({ locale = "ar" }: { locale?: "ar" | "en" }) {
  const { installed, canNativePrompt, busy, ios, promptInstall } = usePwaInstallState();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (installed) {
      setVisible(false);
      return;
    }
    try {
      const until = Number(window.localStorage.getItem(DISMISS_KEY) || "0");
      if (until && Date.now() < until) {
        setVisible(false);
        return;
      }
    } catch { /* ignore */ }
    setVisible(true);
  }, [installed]);

  if (!visible || installed) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now() + 30 * 86_400_000));
    } catch { /* ignore */ }
    setVisible(false);
  };

  return (
    <div className="pwa-install-banner" role="region" aria-label={locale === "ar" ? "تثبيت التطبيق" : "Install app"}>
      <div className="pwa-install-banner-copy">
        <Smartphone size={18} />
        <div>
          <strong>{locale === "ar" ? "ثبّت وازن على جهازك" : "Install Wazen"}</strong>
          <span>
            {canNativePrompt
              ? (locale === "ar" ? "اختصار على الشاشة الرئيسية بضغطة واحدة." : "Add a home-screen shortcut in one tap.")
              : ios
                ? (locale === "ar" ? "Safari ← مشاركة ← إضافة إلى الشاشة الرئيسية." : "Safari → Share → Add to Home Screen.")
                : (locale === "ar" ? "من قائمة المتصفح: تثبيت التطبيق / إضافة إلى الشاشة." : "From the browser menu: Install / Add to Home Screen.")}
          </span>
        </div>
      </div>
      <div className="pwa-install-banner-actions">
        {canNativePrompt ? (
          <button type="button" className="primary-button compact" disabled={busy} onClick={() => void promptInstall()}>
            <Download size={14} />
            {locale === "ar" ? "تثبيت" : "Install"}
          </button>
        ) : null}
        <button type="button" className="icon-button" aria-label={locale === "ar" ? "إخفاء" : "Dismiss"} onClick={dismiss}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

export function PwaInstallGate({
  locale,
  title,
  text,
  continueLabel,
  onContinue,
  children,
}: {
  locale: "ar" | "en";
  title: string;
  text: string;
  continueLabel: string;
  onContinue: () => void;
  children?: ReactNode;
}) {
  const { installed, canNativePrompt, busy, ios, promptInstall } = usePwaInstallState();
  const [skipped, setSkipped] = useState(false);
  const showGate = !installed && !skipped;

  if (!showGate) return <>{children}</>;

  return (
    <div className="pwa-install-gate">
      <span className="section-kicker"><Smartphone size={15} />{locale === "ar" ? "الخطوة 1" : "Step 1"}</span>
      <h2>{title}</h2>
      <p>{text}</p>
      {canNativePrompt ? (
        <button type="button" className="auth-submit" disabled={busy} onClick={() => void promptInstall().then((ok) => { if (ok) onContinue(); })}>
          <Download size={16} />
          {busy ? "…" : (locale === "ar" ? "تثبيت التطبيق ثم المتابعة" : "Install app, then continue")}
        </button>
      ) : (
        <p className="modal-note">
          {ios
            ? (locale === "ar"
              ? "في Safari: زر المشاركة ← «إضافة إلى الشاشة الرئيسية»، ثم ارجع هنا."
              : "In Safari: Share → Add to Home Screen, then come back here.")
            : (locale === "ar"
              ? "من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»، ثم تابع."
              : "Use the browser menu: Install app / Add to Home Screen, then continue.")}
        </p>
      )}
      <button type="button" className="secondary-button" style={{ width: "100%", marginTop: 10 }} onClick={() => { setSkipped(true); onContinue(); }}>
        {continueLabel}
      </button>
    </div>
  );
}
