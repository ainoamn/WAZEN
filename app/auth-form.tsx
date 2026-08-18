"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { WazenIcon } from "../components/brand/WazenLogo";
import { Brand, PageLoader, useCommerceLocale } from "./commercial-kit";
import { clearAdminConsole } from "../lib/admin-session";
import { ensureBrowserId, notifyBrowserSessionChange } from "../lib/browser-session-client";
import { clearDashboardCache } from "../lib/dashboard-session";
import { canOpenPlatformConsole } from "../lib/platform-console";

function authRedirectTarget(role?: string) {
  const requested = new URLSearchParams(window.location.search).get("next");
  const safeNext = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/home";
  return safeNext.startsWith("/admin") && !canOpenPlatformConsole(role) ? "/home" : safeNext;
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const { locale, setLocale, l } = useCommerceLocale();
  const [displayName, setDisplayName] = useState(""); const [email, setEmail] = useState("");
  const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const [totpCode, setTotpCode] = useState(""); const [totpRequired, setTotpRequired] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const oauthError = new URLSearchParams(window.location.search).get("error");
    if (oauthError === "GOOGLE_NOT_CONFIGURED") setError(l("تسجيل جوجل غير مهيأ بعد.", "Google sign-in is not configured yet."));
    else if (oauthError === "GOOGLE_EMAIL_UNVERIFIED") setError(l("بريد جوجل غير مؤكد.", "The Google email is not verified."));
    else if (oauthError === "ACCOUNT_UNAVAILABLE") setError(l("الحساب غير متاح.", "This account is unavailable."));
    else if (oauthError === "GOOGLE_AUTH_FAILED") setError(l("تعذر الدخول عبر جوجل. حاول مرة أخرى.", "Google sign-in failed. Try again."));
    let cancelled = false;
    void (async () => {
      ensureBrowserId();
      try {
        const response = await fetch("/api/auth", { cache: "no-store", credentials: "same-origin" });
        if (cancelled) return;
        const result = await response.json() as { authenticated?: boolean; role?: string };
        if (response.ok && result.authenticated) {
          router.replace(authRedirectTarget(result.role));
          return;
        }
      } catch { /* show auth form */ }
      if (!cancelled) setCheckingSession(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setSaving(true);
    ensureBrowserId();
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ action: mode, displayName: mode === "register" ? displayName : undefined, email, password, totpCode: totpCode || undefined }) });
      const result = await response.json() as {
        error?: string;
        verificationRequired?: boolean;
        emailDelivery?: "queued" | "not_configured";
        verifyUrl?: string;
        role?: string;
        user?: { id?: string };
      };
      if (!response.ok) throw new Error(result.error ?? "AUTH_FAILED");
      if (result.verificationRequired) {
        if (result.verifyUrl?.startsWith("/verify-email")) {
          router.push(result.verifyUrl);
          return;
        }
        router.push(`/verify-email?sent=1&email=${encodeURIComponent(email)}&delivery=${result.emailDelivery === "queued" ? "queued" : "deferred"}`);
        return;
      }
      clearDashboardCache();
      clearAdminConsole();
      notifyBrowserSessionChange(result.user?.id ?? null);
      router.push(authRedirectTarget(result.role));
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "AUTH_FAILED"; if (code === "TOTP_REQUIRED") setTotpRequired(true);
      setError(
        code === "EMAIL_ALREADY_USED"
          ? l("البريد مستخدم بالفعل", "Email is already in use")
          : code === "EMAIL_NOT_VERIFIED"
            ? l("يجب تأكيد البريد أولاً.", "Verify your email first.")
            : code === "SESSION_ALREADY_ACTIVE"
              ? l("يوجد حساب مسجّل في هذا المتصفح. سجّل الخروج أولاً لتبديل الحساب.", "A session is already active in this browser. Sign out first to switch accounts.")
              : code === "DATABASE_NOT_CONFIGURED"
              ? l("قاعدة البيانات الإنتاجية غير مهيأة", "Production database is not configured")
              : code === "APP_ORIGIN_INVALID"
                ? l("إعداد عنوان الموقع غير صالح. راجع WAZEN_APP_ORIGIN.", "App origin is misconfigured. Check WAZEN_APP_ORIGIN.")
                : mode === "register"
                  ? l("تعذر إنشاء الحساب. تحقق من البيانات وحاول مرة أخرى.", "Could not create the account. Check your details and try again.")
                  : l("تعذر تسجيل الدخول. تحقق من البيانات.", "Unable to sign in. Check your details."),
      );
    } finally { setSaving(false); }
  }
  if (checkingSession) return <PageLoader label={l("جاري التحقق…", "Checking…")} />;
  return <main className="auth-page"><section className="auth-panel">
    <header><Brand showArabic /><button onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>{locale === "ar" ? "EN" : "عربي"}</button></header>
    <div className="auth-copy"><small>{l("وصول آمن إلى وازن", "Secure access to Wazen")}</small><h1>{mode === "login" ? l("مرحباً بعودتك", "Welcome back") : l("أنشئ حسابك", "Create your account")}</h1><p>{l("بياناتك المالية تخصك. جلسة مشفرة وصلاحيات منفصلة لكل حساب.", "Your financial data stays yours, with secure sessions and isolated access.")}</p></div>
    <form onSubmit={submit}>
      {mode === "register" && <label><span>{l("الاسم", "Name")}</span><input autoComplete="name" minLength={2} maxLength={80} required value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>}
      <label><span>{l("البريد الإلكتروني", "Email")}</span><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label><span>{l("كلمة المرور", "Password")}</span><input type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} /><small>{l("12 حرفاً على الأقل", "At least 12 characters")}</small></label>
      {mode === "login" && totpRequired && <label><span>{l("رمز المصادقة", "Authenticator code")}</span><input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ""))} /></label>}
      {mode === "login" && <Link href="/forgot-password">{l("نسيت كلمة المرور؟", "Forgot password?")}</Link>}
      {error && <p className="auth-error" role="alert">{error}</p>}<button className="auth-submit" disabled={saving}>{saving ? l("جارٍ التحقق…", "Checking…") : mode === "login" ? l("تسجيل الدخول", "Sign in") : l("إنشاء الحساب", "Create account")}</button>
    </form>
    <div className="auth-divider"><span>{l("أو المتابعة عبر", "Or continue with")}</span></div>
      <a className="auth-google" href={`/api/auth/google?next=${encodeURIComponent(authRedirectTarget())}`}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.46c-.28 1.5-1.12 2.77-2.39 3.63v3.02h3.86c2.26-2.08 3.56-5.14 3.56-8.68z" />
          <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.86-3.02c-1.07.72-2.44 1.15-4.08 1.15-3.14 0-5.8-2.12-6.76-4.97H1.27v3.11C3.24 21.53 7.31 24 12 24z" />
          <path fill="#FBBC05" d="M5.24 14.25A7.2 7.2 0 0 1 4.86 12c0-.78.14-1.53.38-2.25V6.64H1.27A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.27 5.36l3.97-3.11z" />
          <path fill="#EA4335" d="M12 4.75c1.76 0 3.33.6 4.58 1.79l3.43-3.43C17.95 1.19 15.24 0 12 0 7.31 0 3.24 2.47 1.27 6.64l3.97 3.11C6.2 6.87 8.86 4.75 12 4.75z" />
        </svg>
        {l("المتابعة عبر جوجل", "Continue with Google")}
      </a>
    <footer>{mode === "login" ? <>{l("ليس لديك حساب؟", "No account?")} <Link href="/register">{l("أنشئ حساباً", "Create one")}</Link></> : <>{l("لديك حساب؟", "Already registered?")} <Link href="/login">{l("سجّل الدخول", "Sign in")}</Link></>}</footer>
  </section><aside><span className="brand-glyph"><WazenIcon className="h-10 w-auto" /></span><h2>{l("وضوح مالي، من أول ريال.", "Financial clarity from day one.")}</h2><p>{l("المحافظ الشخصية والمنزلية والجمعيات والرحلات في نظام واحد.", "Personal, household, circle and trip wallets in one system.")}</p></aside></main>;
}
