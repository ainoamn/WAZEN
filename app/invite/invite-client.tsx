"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { WazenIcon } from "../../components/brand/WazenLogo";
import { PwaInstallGate, isWazenInstalled } from "../../components/pwa/PwaInstallCard";
import { Brand, useCommerceLocale } from "../commercial-kit";
import { apiFetch } from "../../lib/client-api";
import { clientSignInPath } from "../../lib/client-sign-in";

export function InviteClient({ token }: { token: string }) {
  const { locale, setLocale, l } = useCommerceLocale();
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "login" | "error">("idle");
  const [step, setStep] = useState<"install" | "join">("install");
  const next = useMemo(() => `/invite?token=${encodeURIComponent(token)}`, [token]);
  const signInHref = clientSignInPath(next);

  useEffect(() => {
    if (isWazenInstalled()) setStep("join");
  }, []);

  const accept = async () => {
    setStatus("saving");
    const response = await apiFetch("/api/platform", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "acceptInvite", idempotencyKey: crypto.randomUUID(), token }),
    });
    if (response.status === 401) {
      setStatus("login");
      return;
    }
    setStatus(response.ok ? "done" : "error");
  };

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <header>
          <Brand showArabic />
          <button type="button" onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>{locale === "ar" ? "EN" : "عربي"}</button>
        </header>
        <div className="auth-copy">
          <small>{l("دعوة إلى مساحة مالية", "Financial workspace invitation")}</small>
          <h1>{l("انضم إلى المجموعة", "Join the group")}</h1>
          <p>{l("ثبّت وازن على جهازك ثم سجّل الدخول بنفس البريد الذي استلم الدعوة.", "Install Wazen on your device, then sign in with the invited email.")}</p>
        </div>

        {step === "install" ? (
          <PwaInstallGate
            locale={locale}
            title={l("ثبّت التطبيق أولاً", "Install the app first")}
            text={l(
              "أضف اختصار وازن إلى الشاشة الرئيسية لفتحه كتطبيق، ثم تابع قبول الدعوة وتسجيل الدخول.",
              "Add Wazen to your home screen so it opens like an app, then continue to accept the invite and sign in.",
            )}
            continueLabel={l("تمت الإضافة — متابعة الدعوة", "Installed — continue invite")}
            onContinue={() => setStep("join")}
          />
        ) : status === "done" ? (
          <>
            <p>{l("تم قبول الدعوة بنجاح.", "Invitation accepted.")}</p>
            <Link className="auth-submit" href="/home">{l("فتح الرئيسية", "Open home")}</Link>
          </>
        ) : status === "login" ? (
          <a className="auth-submit" href={signInHref}>{l("سجّل الدخول للمتابعة", "Sign in to continue")}</a>
        ) : (
          <button
            type="button"
            className="auth-submit"
            onClick={() => void accept()}
            disabled={status === "saving" || token.length < 40}
          >
            {status === "saving" ? l("جارٍ القبول…", "Accepting…") : l("قبول الدعوة", "Accept invitation")}
          </button>
        )}
        {status === "error" && <p className="auth-error">{l("الدعوة غير صالحة أو منتهية.", "The invitation is invalid or expired.")}</p>}
      </section>
      <aside>
        <span className="brand-glyph"><WazenIcon className="h-10 w-auto" /></span>
        <h2>{l("تعاون واضح بصلاحيات محددة.", "Clear collaboration with precise roles.")}</h2>
      </aside>
    </main>
  );
}
