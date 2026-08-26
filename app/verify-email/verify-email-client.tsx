"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { WazenIcon } from "../../components/brand/WazenLogo";
import { Brand, useCommerceLocale } from "../commercial-kit";

export function VerifyEmailClient({
  token,
  sent,
  delivery,
}: {
  token: string;
  sent: boolean;
  delivery: "queued" | "deferred" | "unknown";
}) {
  const { locale, setLocale, l } = useCommerceLocale();
  const [status, setStatus] = useState<"waiting" | "verifying" | "done" | "error">(token ? "verifying" : "waiting");

  useEffect(() => {
    if (!token) return;
    void fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "verifyEmail", token }),
    })
      .then((response) => setStatus(response.ok ? "done" : "error"))
      .catch(() => setStatus("error"));
  }, [token]);

  const waitingCopy =
    delivery === "deferred"
      ? l(
          "مزوّد البريد غير مضبوط بعد، لذلك لم تُرسل رسالة حقيقية. استخدم رابط التأكيد من شاشة التسجيل أو اضبط RESEND_API_KEY و RESEND_FROM_EMAIL.",
          "Email delivery is not configured yet, so no real message was sent. Use the confirmation link from signup or set RESEND_API_KEY and RESEND_FROM_EMAIL.",
        )
      : sent
        ? l("أرسلنا رابطاً صالحاً لمدة 24 ساعة. افحص بريدك.", "We sent a link valid for 24 hours. Check your inbox.")
        : l("جارٍ التحقق من الرابط…", "Checking your link…");

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <header>
          <Brand showArabic />
          <button onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>{locale === "ar" ? "EN" : "عربي"}</button>
        </header>
        <div className="auth-copy">
          <small>{l("حماية الحساب", "Account security")}</small>
          <h1>{l("تأكيد البريد الإلكتروني", "Verify your email")}</h1>
          <p>
            {status === "done"
              ? l("تم تأكيد بريدك وإنشاء جلسة آمنة.", "Your email is verified and a secure session was created.")
              : status === "error"
                ? l("رابط التأكيد غير صالح أو انتهت صلاحيته.", "The verification link is invalid or expired.")
                : status === "verifying"
                  ? l("جارٍ التحقق من الرابط…", "Checking your link…")
                  : waitingCopy}
          </p>
        </div>
        {status === "done" ? (
          <Link className="auth-submit" href="/home">{l("فتح الرئيسية", "Open home")}</Link>
        ) : status === "error" ? (
          <Link className="auth-submit" href="/register">{l("إنشاء حساب جديد", "Create a new account")}</Link>
        ) : delivery === "deferred" && !token ? (
          <p className="auth-error" role="status">
            {l(
              "اضبط إرسال البريد عبر RESEND_API_KEY و RESEND_FROM_EMAIL ثم مهمة /api/jobs/tick.",
              "Configure email with RESEND_API_KEY and RESEND_FROM_EMAIL, then the /api/jobs/tick job.",
            )}
          </p>
        ) : null}
      </section>
      <aside>
        <span className="brand-glyph">
          <WazenIcon className="h-10 w-auto" />
        </span>
        <h2>{l("خطوة صغيرة لحماية بياناتك المالية.", "One small step to protect your financial data.")}</h2>
      </aside>
    </main>
  );
}
