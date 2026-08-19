"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { GoogleSignInButton } from "./google-sign-in";
import { WazenIcon } from "../components/brand/WazenLogo";
import { Brand, useCommerceLocale } from "./commercial-kit";
import { clearAdminConsole } from "../lib/admin-session";
import { ensureBrowserId, notifyBrowserSessionChange } from "../lib/browser-session-client";
import { completeClientLogout } from "../lib/client-logout";
import { clearDashboardCache } from "../lib/dashboard-session";
import { canOpenPlatformConsole } from "../lib/platform-console";

function googleErrorMessage(code: string, l: (ar: string, en: string) => string) {
  if (code === "GOOGLE_NOT_CONFIGURED") return l("تسجيل جوجل غير مهيأ بعد.", "Google sign-in is not configured yet.");
  if (code === "GOOGLE_EMAIL_UNVERIFIED") return l("بريد جوجل غير مؤكد.", "The Google email is not verified.");
  if (code === "ACCOUNT_UNAVAILABLE") return l("الحساب غير متاح.", "This account is unavailable.");
  if (code === "GOOGLE_ACCESS_DENIED") return l("جوجل رفض الحساب. إن كان التطبيق في وضع الاختبار فأضف البريد كمستخدم تجريبي من Audience.", "Google denied this account. If the app is in testing, add the email as a test user on the Audience page.");
  if (code === "GOOGLE_CLIENT_INVALID") return l("معرّف عميل جوجل لا يطابق هذا الموقع. أضف https://wazen.bhd-om.com في Authorized JavaScript origins.", "The Google client ID does not match this site. Add https://wazen.bhd-om.com to Authorized JavaScript origins.");
  if (code === "GOOGLE_REDIRECT_MISMATCH") return l("عنوان الإرجاع غير مطابق.", "Redirect URI mismatch.");
  if (code === "SESSION_ALREADY_ACTIVE") return l("يوجد حساب مسجّل في هذا المتصفح. سجّل الخروج أولاً لتبديل الحساب.", "A session is already active in this browser. Sign out first to switch accounts.");
  if (code === "BHD_NOT_CONFIGURED") return l("حساب BHD غير مهيأ بعد.", "BHD identity is not configured yet.");
  if (code === "BHD_ACCESS_DENIED") return l("أُلغي الدخول من حساب BHD.", "BHD sign-in was cancelled.");
  if (code === "BHD_EMAIL_UNVERIFIED") return l("بريد حساب BHD غير مؤكد.", "The BHD account email is not verified.");
  if (code === "BHD_REDIRECT_DENIED") return l("بوابة BHD لم تسجّل نطاق هذا الموقع بعد. استخدم النموذج أدناه أو أضف عنوان الإرجاع على الهوية.", "The BHD portal has not allowlisted this site yet. Use the form below, or register the callback on identity.");
  if (code === "BHD_EMAIL_IN_USE") return l("هذا البريد مرتبط بحساب وازن غير مؤكد. أكّد البريد أو ادخل محلياً ثم اربط الحساب.", "This email belongs to an unverified Wazen account. Verify it, or sign in locally first.");
  if (code === "BHD_STATE_MISMATCH" || code === "BHD_NONCE_MISMATCH" || code === "BHD_STATE_MISSING") return l("انتهت صلاحية جلسة الدخول. حاول مرة أخرى.", "The sign-in session expired. Try again.");
  if (code.startsWith("BHD_")) return l("تعذر الدخول بحساب BHD. حاول مرة أخرى.", "Could not sign in with BHD. Try again.");
  return l("تعذر الدخول عبر جوجل. حاول مرة أخرى.", "Google sign-in failed. Try again.");
}

function authRedirectTarget(role?: string) {
  if (typeof window === "undefined") return "/home";
  const requested = new URLSearchParams(window.location.search).get("next");
  const safeNext = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/home";
  return safeNext.startsWith("/admin") && !canOpenPlatformConsole(role) ? "/home" : safeNext;
}

export function AuthForm({ mode, next = "/home", googleClientId = "", identityEnabled = false, ssoReady = false }: { mode: "login" | "register"; next?: string; googleClientId?: string; identityEnabled?: boolean; ssoReady?: boolean }) {
  const router = useRouter();
  const { locale, setLocale, l } = useCommerceLocale();
  const [displayName, setDisplayName] = useState(""); const [email, setEmail] = useState("");
  const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const [totpCode, setTotpCode] = useState(""); const [totpRequired, setTotpRequired] = useState(false);
  const [activeSession, setActiveSession] = useState<{ dest: string } | null>(null);

  useEffect(() => {
    const oauthError = new URLSearchParams(window.location.search).get("error");
    if (oauthError) setError(googleErrorMessage(oauthError, l));
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8_000);
    void (async () => {
      ensureBrowserId();
      try {
        const response = await fetch("/api/auth", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        const result = await response.json() as { authenticated?: boolean; role?: string };
        if (response.ok && result.authenticated) {
          setActiveSession({ dest: authRedirectTarget(result.role) });
        }
      } catch { /* keep showing the auth form */ }
    })();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [router]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setSaving(true);
    ensureBrowserId();
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", signal: controller.signal, body: JSON.stringify({ action: mode, next, displayName: mode === "register" ? displayName : undefined, email, password, totpCode: totpCode || undefined }) });
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
      window.location.assign(authRedirectTarget(result.role));
      return;
    } catch (caught) {
      const aborted = caught instanceof DOMException && caught.name === "AbortError";
      const code = aborted ? "AUTH_TIMEOUT" : caught instanceof Error ? caught.message : "AUTH_FAILED";
      if (code === "TOTP_REQUIRED") setTotpRequired(true);
      setError(
        code === "AUTH_TIMEOUT"
          ? l("انتهت مهلة التحقق. حاول مرة أخرى.", "The sign-in request timed out. Try again.")
          : code === "INVALID_CREDENTIALS"
          ? l("البريد أو كلمة المرور غير صحيحة.", "Email or password is incorrect.")
          : code === "EMAIL_ALREADY_USED"
          ? l("البريد مستخدم بالفعل", "Email is already in use")
          : code === "EMAIL_NOT_VERIFIED"
            ? l("يجب تأكيد البريد أولاً من رابط الرسالة.", "Verify your email from the message link first.")
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
    } finally {
      window.clearTimeout(timer);
      setSaving(false);
    }
  }
  return <main className="auth-page"><section className="auth-panel">
    <header><Brand showArabic /><button onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>{locale === "ar" ? "EN" : "عربي"}</button></header>
    <div className="auth-copy"><small>{l("وصول آمن إلى وازن", "Secure access to Wazen")}</small><h1>{mode === "login" ? l("مرحباً بعودتك", "Welcome back") : l("أنشئ حسابك", "Create your account")}</h1><p>{identityEnabled ? l("ادخل بحساب BHD الموحّد. بيانات المحافظ تبقى في وازن فقط.", "Sign in with your unified BHD account. Wallet data stays in Wazen.") : l("بياناتك المالية تخصك. جلسة مشفرة وصلاحيات منفصلة لكل حساب.", "Your financial data stays yours, with secure sessions and isolated access.")}</p></div>
    {activeSession && (
      <p className="auth-error" role="status">
        {l("لديك جلسة في هذا المتصفح. أكمل النموذج لتحديث الدخول، أو اخرج أولاً.", "A session exists in this browser. Submit the form to refresh it, or sign out first.")}{" "}
        <Link href={activeSession.dest}>{l("فتح الرئيسية", "Open home")}</Link>
        {" · "}
        <button type="button" className="auth-inline-logout" onClick={() => void completeClientLogout()}>
          {l("تسجيل الخروج", "Sign out")}
        </button>
      </p>
    )}
    {identityEnabled && ssoReady && (
      <>
        <a className="auth-submit" href={`/api/auth/bhd/start?next=${encodeURIComponent(authRedirectTarget())}`}>
          {l("الدخول بحساب BHD", "Sign in with BHD")}
        </a>
        <div className="auth-divider"><span>{l("أو الدخول المحلي", "Or local sign-in")}</span></div>
      </>
    )}
    <form method="post" action="/api/auth" onSubmit={submit}>
      <input type="hidden" name="action" value={mode} />
      <input type="hidden" name="next" value={next.startsWith("/") && !next.startsWith("//") ? next : "/home"} />
      {mode === "register" && <label><span>{l("الاسم", "Name")}</span><input name="displayName" autoComplete="name" minLength={2} maxLength={80} required value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>}
      <label><span>{l("البريد الإلكتروني", "Email")}</span><input name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label><span>{l("كلمة المرور", "Password")}</span><input name="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} /><small>{l("12 حرفاً على الأقل", "At least 12 characters")}</small></label>
      {mode === "login" && totpRequired && <label><span>{l("رمز المصادقة", "Authenticator code")}</span><input name="totpCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ""))} /></label>}
      {mode === "login" && <Link href="/forgot-password">{l("نسيت كلمة المرور؟", "Forgot password?")}</Link>}
      {error && <p className="auth-error" role="alert">{error}</p>}<button className="auth-submit" type="submit" disabled={saving}>{saving ? l("جارٍ التحقق…", "Checking…") : mode === "login" ? l("تسجيل الدخول", "Sign in") : l("إنشاء الحساب", "Create account")}</button>
    </form>
    {!identityEnabled && <div className="auth-divider"><span>{l("أو المتابعة عبر", "Or continue with")}</span></div>}
      {identityEnabled ? null : googleClientId ? (
        <GoogleSignInButton
          clientId={googleClientId}
          label={l("المتابعة عبر جوجل", "Continue with Google")}
          disabled={saving}
          onError={(code) => setError(googleErrorMessage(code, l))}
          onSignedIn={(result) => {
            clearDashboardCache();
            clearAdminConsole();
            notifyBrowserSessionChange(result.user?.id ?? null);
            window.location.assign(authRedirectTarget(result.role));
          }}
        />
      ) : (
        <p className="auth-error" role="status">{l("تسجيل جوجل غير مهيأ بعد.", "Google sign-in is not configured yet.")}</p>
      )}
    <footer>{mode === "login" ? <>{l("ليس لديك حساب؟", "No account?")} <Link href={identityEnabled ? "/register?local=1" : "/register"}>{l("أنشئ حساباً", "Create one")}</Link></> : <>{l("لديك حساب؟", "Already registered?")} <Link href={identityEnabled ? "/login?local=1" : "/login"}>{l("سجّل الدخول", "Sign in")}</Link></>}</footer>
  </section><aside><span className="brand-glyph"><WazenIcon className="h-10 w-auto" /></span><h2>{l("وضوح مالي، من أول ريال.", "Financial clarity from day one.")}</h2><p>{l("المحافظ الشخصية والمنزلية والجمعيات والرحلات في نظام واحد.", "Personal, household, circle and trip wallets in one system.")}</p></aside></main>;
}
