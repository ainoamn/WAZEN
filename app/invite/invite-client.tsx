"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { WazenIcon } from "../../components/brand/WazenLogo";
import { PwaInstallGate, isWazenInstalled } from "../../components/pwa/PwaInstallCard";
import { Brand, useCommerceLocale } from "../commercial-kit";
import { apiFetch } from "../../lib/client-api";
import { clientSignInPath } from "../../lib/client-sign-in";
import { completeClientLogout } from "../../lib/client-logout";

function inviteErrorMessage(code: string, l: (ar: string, en: string) => string, signedInEmail?: string) {
  if (code === "INVITE_EMAIL_MISMATCH") {
    return signedInEmail
      ? l(
          `أنت مسجّل كـ ${signedInEmail}. افتح الدعوة بعد الدخول بنفس بريد الدعوة، أو سجّل خروجاً وبدّل الحساب.`,
          `You are signed in as ${signedInEmail}. Open the invite after signing in with the invited email, or sign out and switch accounts.`,
        )
      : l(
          "البريد المسجّل حالياً لا يطابق بريد الدعوة. سجّل خروجاً ثم ادخل ببريد الدعوة.",
          "The current signed-in email does not match the invite. Sign out, then sign in with the invited email.",
        );
  }
  if (code === "INVITATION_EXPIRED") return l("انتهت صلاحية الدعوة. اطلب دعوة جديدة من مدير المحفظة.", "This invite expired. Ask the wallet admin for a new one.");
  if (code === "INVITATION_CANCELLED") return l("أُلغيت هذه الدعوة (ربما أُرسلت دعوة أحدث). استخدم آخر رسالة بريد.", "This invite was cancelled (a newer one may have been sent). Use the latest email.");
  if (code === "INVITATION_ALREADY_USED") return l("تم قبول هذه الدعوة مسبقاً. افتح الرئيسية للمتابعة.", "This invite was already accepted. Open Home to continue.");
  if (code === "INVITATION_NOT_FOUND" || code === "INVALID_INVITATION") {
    return l("رابط الدعوة غير معروف. تأكد أنك فتحت آخر رسالة، أو اطلب دعوة جديدة.", "Unknown invite link. Open the latest email, or ask for a new invite.");
  }
  if (code === "PLAN_USER_LIMIT" || code === "PLAN_MEMBER_LIMIT") {
    return l("وصلت المحفظة لحد الأعضاء في الباقة. راجع المدير.", "This wallet reached its member limit. Ask the admin.");
  }
  return l("تعذر قبول الدعوة. حاول مرة أخرى أو اطلب رابطاً جديداً.", "Could not accept the invite. Try again or request a new link.");
}

export function InviteClient({ token }: { token: string }) {
  const { locale, setLocale, l } = useCommerceLocale();
  const [status, setStatus] = useState<"loading" | "install" | "login" | "ready" | "saving" | "done" | "error">("loading");
  const [errorCode, setErrorCode] = useState("");
  const [signedInEmail, setSignedInEmail] = useState("");
  const next = useMemo(() => `/invite?token=${encodeURIComponent(token)}`, [token]);
  const signInHref = clientSignInPath(next);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/auth", { cache: "no-store", credentials: "same-origin" });
        const result = await response.json() as { authenticated?: boolean; user?: { email?: string } };
        if (cancelled) return;
        if (response.ok && result.authenticated) {
          setSignedInEmail(String(result.user?.email ?? "").trim());
          setStatus(isWazenInstalled() ? "ready" : "install");
          return;
        }
      } catch { /* treat as logged out */ }
      if (cancelled) return;
      setStatus(isWazenInstalled() ? "login" : "install");
    })();
    return () => { cancelled = true; };
  }, []);

  const accept = async () => {
    if (token.length < 40) {
      setErrorCode("INVALID_INVITATION");
      setStatus("error");
      return;
    }
    setStatus("saving");
    setErrorCode("");
    try {
      const response = await apiFetch("/api/platform", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "acceptInvite", idempotencyKey: crypto.randomUUID(), token }),
      });
      const result = await response.json() as { error?: string; ok?: boolean };
      if (response.status === 401) {
        setStatus("login");
        return;
      }
      if (!response.ok) {
        setErrorCode(result.error ?? "INVITATION_NOT_FOUND");
        setStatus("error");
        return;
      }
      setStatus("done");
    } catch {
      setErrorCode("INVITATION_NOT_FOUND");
      setStatus("error");
    }
  };

  const afterInstall = () => {
    setStatus(signedInEmail ? "ready" : "login");
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
          <p>{l("ثبّت وازن عند الحاجة، ثم سجّل الدخول بنفس البريد الذي استلم الدعوة، ثم اقبل الدعوة.", "Install Wazen if needed, sign in with the invited email, then accept the invite.")}</p>
        </div>

        {status === "loading" ? (
          <p className="modal-note">{l("جارٍ التحقق من الجلسة…", "Checking your session…")}</p>
        ) : status === "install" ? (
          <PwaInstallGate
            locale={locale}
            title={l("ثبّت التطبيق أولاً (اختياري)", "Install the app first (optional)")}
            text={l(
              "أضف اختصار وازن إلى الشاشة الرئيسية، ثم تابع تسجيل الدخول وقبول الدعوة.",
              "Add Wazen to your home screen, then continue to sign in and accept the invite.",
            )}
            continueLabel={l("متابعة إلى تسجيل الدخول", "Continue to sign in")}
            onContinue={afterInstall}
          />
        ) : status === "done" ? (
          <>
            <p>{l("تم قبول الدعوة بنجاح.", "Invitation accepted.")}</p>
            <Link className="auth-submit" href="/home">{l("فتح الرئيسية", "Open home")}</Link>
          </>
        ) : status === "login" ? (
          <>
            <p className="modal-note">{l("يجب تسجيل الدخول ببريد الدعوة قبل القبول.", "Sign in with the invited email before accepting.")}</p>
            <a className="auth-submit" href={signInHref}>{l("تسجيل الدخول للمتابعة", "Sign in to continue")}</a>
          </>
        ) : (
          <>
            {signedInEmail ? (
              <p className="modal-note">
                {l(`مسجّل الدخول: ${signedInEmail}`, `Signed in as: ${signedInEmail}`)}
              </p>
            ) : null}
            <button
              type="button"
              className="auth-submit"
              onClick={() => void accept()}
              disabled={status === "saving" || token.length < 40}
            >
              {status === "saving" ? l("جارٍ القبول…", "Accepting…") : l("قبول الدعوة", "Accept invitation")}
            </button>
            {errorCode === "INVITE_EMAIL_MISMATCH" ? (
              <button
                type="button"
                className="secondary-button"
                style={{ width: "100%", marginTop: 10 }}
                onClick={() => void completeClientLogout().then(() => { window.location.href = signInHref; })}
              >
                {l("تسجيل الخروج وتبديل الحساب", "Sign out and switch account")}
              </button>
            ) : null}
            {status === "error" || errorCode ? (
              <p className="auth-error" role="alert">{inviteErrorMessage(errorCode || "INVITATION_NOT_FOUND", l, signedInEmail)}</p>
            ) : null}
          </>
        )}
      </section>
      <aside>
        <span className="brand-glyph"><WazenIcon className="h-10 w-auto" /></span>
        <h2>{l("تعاون واضح بصلاحيات محددة.", "Clear collaboration with precise roles.")}</h2>
      </aside>
    </main>
  );
}
