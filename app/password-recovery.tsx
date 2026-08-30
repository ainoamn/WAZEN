"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { WazenIcon } from "../components/brand/WazenLogo";
import { Brand, useCommerceLocale } from "./commercial-kit";
import { clientSignInPath } from "../lib/client-sign-in";

function safeNext(value?: string) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/home";
}

export function PasswordRecovery({ mode, token = "", next = "/home" }: { mode: "forgot" | "reset"; token?: string; next?: string }) {
  const router = useRouter();
  const { locale, setLocale, l } = useCommerceLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const destination = safeNext(next);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("saving");
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(mode === "forgot" ? { action: "forgotPassword", email, next: destination } : { action: "resetPassword", token, password }),
    });
    setStatus(response.ok ? "done" : "error");
    if (response.ok && mode === "reset") window.setTimeout(() => router.push(destination), 700);
  };
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <header>
          <Brand showArabic />
          <button onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>{locale === "ar" ? "EN" : "عربي"}</button>
        </header>
        <div className="auth-copy">
          <small>{l("استعادة آمنة", "Secure recovery")}</small>
          <h1>{mode === "forgot" ? l("نسيت كلمة المرور؟", "Forgot your password?") : l("كلمة مرور جديدة", "Set a new password")}</h1>
          <p>
            {mode === "forgot"
              ? l("أدخل بريدك. إذا كان الحساب موجوداً سنرسل رابطاً صالحاً لساعة واحدة.", "Enter your email. If the account exists, we will send a link valid for one hour.")
              : l("اختر كلمة مرور من 12 حرفاً على الأقل. ستُلغى جميع الجلسات القديمة.", "Choose at least 12 characters. All old sessions will be revoked.")}
          </p>
        </div>
        {status === "done" && mode === "forgot" ? (
          <p>{l("تحقق من بريدك لإكمال الاستعادة.", "Check your inbox to continue recovery.")}</p>
        ) : (
          <form onSubmit={submit}>
            {mode === "forgot" ? (
              <label>
                <span>{l("البريد الإلكتروني", "Email")}</span>
                <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
            ) : (
              <label>
                <span>{l("كلمة المرور الجديدة", "New password")}</span>
                <input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>
            )}
            {status === "error" && <p className="auth-error">{l("تعذر إكمال الطلب أو انتهت صلاحية الرابط.", "The request failed or the link expired.")}</p>}
            <button className="auth-submit" disabled={status === "saving" || (mode === "reset" && token.length < 40)}>
              {status === "saving" ? l("جارٍ الحفظ…", "Saving…") : mode === "forgot" ? l("إرسال رابط الاستعادة", "Send recovery link") : l("تعيين كلمة المرور", "Set password")}
            </button>
          </form>
        )}
        <footer>
          <Link href={clientSignInPath(destination)}>{l("العودة لتسجيل الدخول", "Back to sign in")}</Link>
        </footer>
      </section>
      <aside>
        <span className="brand-glyph">
          <WazenIcon className="h-10 w-auto" />
        </span>
        <h2>{l("حسابك يعود إليك فقط.", "Your account belongs only to you.")}</h2>
      </aside>
    </main>
  );
}
