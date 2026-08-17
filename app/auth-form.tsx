"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { WazenIcon } from "../components/brand/WazenLogo";
import { Brand, useCommerceLocale } from "./commercial-kit";
import { canOpenPlatformConsole } from "../lib/platform-console";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const { locale, setLocale, l } = useCommerceLocale();
  const [displayName, setDisplayName] = useState(""); const [email, setEmail] = useState("");
  const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const [totpCode, setTotpCode] = useState(""); const [totpRequired, setTotpRequired] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setSaving(true);
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: mode, displayName: mode === "register" ? displayName : undefined, email, password, totpCode: totpCode || undefined }) });
      const result = await response.json() as {
        error?: string;
        verificationRequired?: boolean;
        emailDelivery?: "queued" | "not_configured";
        verifyUrl?: string;
        role?: string;
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
      const requested = new URLSearchParams(window.location.search).get("next");
      const safeNext = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/home";
      router.push(safeNext.startsWith("/admin") && !canOpenPlatformConsole(result.role) ? "/home" : safeNext);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "AUTH_FAILED"; if (code === "TOTP_REQUIRED") setTotpRequired(true);
      setError(
        code === "EMAIL_ALREADY_USED"
          ? l("البريد مستخدم بالفعل", "Email is already in use")
          : code === "EMAIL_NOT_VERIFIED"
            ? l("يجب تأكيد البريد أولاً.", "Verify your email first.")
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
    <footer>{mode === "login" ? <>{l("ليس لديك حساب؟", "No account?")} <Link href="/register">{l("أنشئ حساباً", "Create one")}</Link></> : <>{l("لديك حساب؟", "Already registered?")} <Link href="/login">{l("سجّل الدخول", "Sign in")}</Link></>}</footer>
  </section><aside><span className="brand-glyph"><WazenIcon className="h-10 w-auto" /></span><h2>{l("وضوح مالي، من أول ريال.", "Financial clarity from day one.")}</h2><p>{l("المحافظ الشخصية والمنزلية والجمعيات والرحلات في نظام واحد.", "Personal, household, circle and trip wallets in one system.")}</p></aside></main>;
}
