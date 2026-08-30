"use client";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { WazenIcon } from "../../components/brand/WazenLogo";
import { PwaInstallGate, isWazenInstalled } from "../../components/pwa/PwaInstallCard";
import { Brand, useCommerceLocale } from "../commercial-kit";
import { apiFetch } from "../../lib/client-api";
import { completeClientLogout } from "../../lib/client-logout";

type InviteInfo = {
  email: string;
  spaceNameAr: string | null;
  spaceNameEn: string | null;
};

function inviteErrorMessage(code: string, l: (ar: string, en: string) => string, signedInEmail?: string) {
  if (code === "INVITE_EMAIL_MISMATCH") {
    return signedInEmail
      ? l(
          `أنت مسجّل كـ ${signedInEmail}. سجّل خروجاً ثم أكمل التسجيل ببريد الدعوة.`,
          `You are signed in as ${signedInEmail}. Sign out, then complete signup with the invited email.`,
        )
      : l(
          "البريد المسجّل حالياً لا يطابق بريد الدعوة.",
          "The current signed-in email does not match the invite.",
        );
  }
  if (code === "CSRF_REJECTED") {
    return l("انتهت صلاحية الجلسة الأمنية. حدّث الصفحة ثم اقبل الدعوة مرة أخرى.", "Security session expired. Refresh the page, then accept again.");
  }
  if (code === "INVITATION_EXPIRED") return l("انتهت صلاحية الدعوة. اطلب دعوة جديدة من مدير المحفظة.", "This invite expired. Ask the wallet admin for a new one.");
  if (code === "INVITATION_CANCELLED") return l("أُلغيت هذه الدعوة (ربما أُرسلت دعوة أحدث). استخدم آخر رسالة بريد.", "This invite was cancelled (a newer one may have been sent). Use the latest email.");
  if (code === "INVITATION_ALREADY_USED") return l("تم قبول هذه الدعوة مسبقاً. افتح الرئيسية للمتابعة.", "This invite was already accepted. Open Home to continue.");
  if (code === "INVITATION_NOT_FOUND" || code === "INVALID_INVITATION") {
    return l("رابط الدعوة غير معروف. تأكد أنك فتحت آخر رسالة، أو اطلب دعوة جديدة.", "Unknown invite link. Open the latest email, or ask for a new invite.");
  }
  if (code === "INVALID_PASSWORD") return l("كلمة المرور يجب أن تكون 12 حرفاً على الأقل.", "Password must be at least 12 characters.");
  if (code === "INVALID_PHONE") return l("أدخل رقم هاتف صالحاً.", "Enter a valid phone number.");
  if (code === "INVALID_PROFILE") return l("أدخل اسماً واضحاً (حرفان على الأقل).", "Enter a clear name (at least 2 characters).");
  if (code === "PLAN_USER_LIMIT" || code === "PLAN_MEMBER_LIMIT") {
    return l("وصلت المحفظة لحد الأعضاء في الباقة. راجع المدير.", "This wallet reached its member limit. Ask the admin.");
  }
  return l("تعذر إكمال الانضمام. حاول مرة أخرى أو اطلب رابطاً جديداً.", "Could not complete joining. Try again or request a new link.");
}

function goHome() {
  window.location.replace("/home");
}

export function InviteClient({ token }: { token: string }) {
  const { locale, setLocale, l } = useCommerceLocale();
  const [status, setStatus] = useState<"loading" | "install" | "register" | "saving" | "done" | "exists" | "error">("loading");
  const [errorCode, setErrorCode] = useState("");
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [signedInEmail, setSignedInEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [resetStatus, setResetStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const autoJoinTried = useRef(false);

  const sessionMatchesInvite = useMemo(() => {
    if (!invite?.email || !signedInEmail) return false;
    return signedInEmail.trim().toLowerCase() === invite.email.trim().toLowerCase();
  }, [invite?.email, signedInEmail]);

  const submitJoin = async (opts?: { name?: string; phone?: string; password?: string; asMember?: boolean }) => {
    const nameValue = (opts?.name ?? displayName).trim();
    const phoneValue = (opts?.phone ?? phone).trim();
    const passwordValue = opts?.password ?? password;
    const asMember = opts?.asMember ?? sessionMatchesInvite;
    setStatus("saving");
    setErrorCode("");
    try {
      const response = await apiFetch("/api/platform", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "joinInvite",
          token,
          displayName: nameValue,
          phone: phoneValue,
          ...(asMember ? {} : { password: passwordValue }),
        }),
      });
      const result = await response.json() as { error?: string; ok?: boolean };
      if (response.status === 409 && result.error === "EMAIL_ALREADY_USED") {
        setStatus("exists");
        setResetStatus("idle");
        return false;
      }
      if (response.status === 409 && result.error === "INVITATION_ALREADY_USED") {
        setStatus("done");
        window.setTimeout(goHome, 400);
        return true;
      }
      if (!response.ok) {
        setErrorCode(result.error ?? "INVITATION_NOT_FOUND");
        setStatus(result.error === "INVITE_EMAIL_MISMATCH" ? "error" : "register");
        return false;
      }
      setStatus("done");
      window.setTimeout(goHome, 400);
      return true;
    } catch {
      setErrorCode("INVITATION_NOT_FOUND");
      setStatus("error");
      return false;
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (token.length < 40) {
        setErrorCode("INVALID_INVITATION");
        setStatus("error");
        return;
      }

      let sessionEmail = "";
      let sessionName = "";
      try {
        const authResponse = await fetch("/api/auth", { cache: "no-store", credentials: "same-origin" });
        const authResult = await authResponse.json() as { authenticated?: boolean; user?: { email?: string; displayName?: string } };
        if (authResponse.ok && authResult.authenticated) {
          sessionEmail = String(authResult.user?.email ?? "").trim();
          sessionName = String(authResult.user?.displayName ?? "").trim();
          if (!cancelled) {
            setSignedInEmail(sessionEmail);
            if (sessionName) setDisplayName(sessionName);
          }
        }
      } catch { /* guest */ }

      try {
        const peekResponse = await apiFetch("/api/platform", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "peekInvite", token }),
        });
        const peekResult = await peekResponse.json() as {
          ok?: boolean;
          error?: string;
          invite?: InviteInfo;
        };
        if (cancelled) return;
        if (!peekResponse.ok || !peekResult.invite) {
          const code = peekResult.error ?? "INVITATION_NOT_FOUND";
          if (code === "INVITATION_ALREADY_USED" && sessionEmail) {
            setStatus("done");
            window.setTimeout(goHome, 400);
            return;
          }
          setErrorCode(code);
          setStatus("error");
          return;
        }
        setInvite(peekResult.invite);

        const emailMatch = sessionEmail
          && sessionEmail.trim().toLowerCase() === peekResult.invite.email.trim().toLowerCase();

        if (emailMatch && sessionName.length >= 2 && !autoJoinTried.current) {
          autoJoinTried.current = true;
          setStatus("saving");
          const ok = await submitJoin({ name: sessionName, phone: "", asMember: true });
          if (!cancelled && !ok) setStatus(isWazenInstalled() ? "register" : "install");
          return;
        }

        setStatus(isWazenInstalled() ? "register" : "install");
      } catch {
        if (!cancelled) {
          setErrorCode("INVITATION_NOT_FOUND");
          setStatus("error");
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per token
  }, [token]);

  const join = async (event: FormEvent) => {
    event.preventDefault();
    if (!invite) return;
    await submitJoin();
  };

  const sendReset = async () => {
    if (!invite?.email) return;
    setResetStatus("sending");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "forgotPassword",
          email: invite.email,
          next: `/invite?token=${encodeURIComponent(token)}`,
        }),
      });
      setResetStatus(response.ok ? "sent" : "error");
    } catch {
      setResetStatus("error");
    }
  };

  const spaceLabel = invite
    ? (locale === "ar" ? (invite.spaceNameAr || invite.spaceNameEn) : (invite.spaceNameEn || invite.spaceNameAr))
    : null;

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
          <p>
            {spaceLabel
              ? l(`ثبّت وازن إن لزم، ثم أكمل بياناتك للانضمام إلى «${spaceLabel}».`, `Install Wazen if needed, then complete your details to join “${spaceLabel}”.`)
              : l("ثبّت وازن إن لزم، ثم أكمل بياناتك للانضمام مباشرة.", "Install Wazen if needed, then complete your details to join directly.")}
          </p>
        </div>

        {status === "loading" || status === "saving" ? (
          <p className="modal-note">
            {status === "saving"
              ? l("جارٍ قبول الدعوة وإدخالك للتطبيق…", "Accepting the invite and opening the app…")
              : l("جارٍ تجهيز الدعوة…", "Preparing the invite…")}
          </p>
        ) : status === "install" ? (
          <PwaInstallGate
            locale={locale}
            title={l("ثبّت التطبيق أولاً", "Install the app first")}
            text={l(
              "أضف اختصار وازن إلى الشاشة الرئيسية، ثم أكمل التسجيل ببريد الدعوة.",
              "Add Wazen to your home screen, then complete signup with the invited email.",
            )}
            continueLabel={l("متابعة إلى إنشاء الحساب", "Continue to create account")}
            onContinue={() => setStatus("register")}
          />
        ) : status === "done" ? (
          <>
            <p>{l("تم الانضمام بنجاح. جارٍ فتح الرئيسية…", "Joined successfully. Opening home…")}</p>
            <Link className="auth-submit" href="/home">{l("فتح الرئيسية", "Open home")}</Link>
          </>
        ) : status === "exists" ? (
          <>
            <p className="auth-error" role="alert">
              {l(
                "هذا البريد مسجّل مسبقاً. أعد تعيين كلمة المرور للمتابعة، أو تواصل مع الإدارة إن لم تستطع الوصول للحساب.",
                "This email is already registered. Reset your password to continue, or contact admin if you cannot access the account.",
              )}
            </p>
            {invite?.email ? (
              <p className="modal-note" style={{ marginTop: 8 }}>
                {l(`البريد: ${invite.email}`, `Email: ${invite.email}`)}
              </p>
            ) : null}
            {resetStatus === "sent" ? (
              <p>{l("تحقق من بريدك لرابط إعادة كلمة المرور. بعد التعيين سنقبل الدعوة تلقائياً.", "Check your inbox for the reset link. After setting a password we will accept the invite automatically.")}</p>
            ) : (
              <button type="button" className="auth-submit" disabled={resetStatus === "sending"} onClick={() => void sendReset()}>
                {resetStatus === "sending"
                  ? l("جارٍ الإرسال…", "Sending…")
                  : l("إعادة كلمة المرور للمتابعة", "Reset password to continue")}
              </button>
            )}
            {resetStatus === "error" ? (
              <p className="auth-error" role="alert">{l("تعذر إرسال رابط الاستعادة. تواصل مع الإدارة أو حاول لاحقاً.", "Could not send the recovery link. Contact admin or try again later.")}</p>
            ) : null}
            <button type="button" className="secondary-button" style={{ width: "100%", marginTop: 10 }} onClick={() => setStatus("register")}>
              {l("العودة للنموذج", "Back to form")}
            </button>
          </>
        ) : status === "error" && !invite ? (
          <>
            <p className="auth-error" role="alert">{inviteErrorMessage(errorCode || "INVITATION_NOT_FOUND", l, signedInEmail)}</p>
            {errorCode === "INVITATION_ALREADY_USED" ? (
              <Link className="auth-submit" href="/home">{l("فتح الرئيسية", "Open home")}</Link>
            ) : null}
          </>
        ) : (
          <form onSubmit={(event) => void join(event)}>
            {signedInEmail && !sessionMatchesInvite ? (
              <>
                <p className="auth-error" role="alert">{inviteErrorMessage("INVITE_EMAIL_MISMATCH", l, signedInEmail)}</p>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ width: "100%", marginBottom: 12 }}
                  onClick={() => void completeClientLogout().then(() => { window.location.reload(); })}
                >
                  {l("تسجيل الخروج والمتابعة", "Sign out and continue")}
                </button>
              </>
            ) : null}

            {sessionMatchesInvite ? (
              <p className="modal-note">
                {l(
                  `أنت مسجّل كـ ${signedInEmail}. أكمل الهاتف إن رغبت ثم اضغط قبول الدعوة مرة واحدة للدخول.`,
                  `Signed in as ${signedInEmail}. Optionally add a phone, then press Accept once to enter.`,
                )}
              </p>
            ) : null}

            <label>
              <span>{l("الاسم", "Name")}</span>
              <input
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                disabled={Boolean(signedInEmail && !sessionMatchesInvite)}
              />
            </label>
            <label>
              <span>{sessionMatchesInvite ? l("رقم الهاتف (اختياري)", "Phone (optional)") : l("رقم الهاتف", "Phone")}</span>
              <input
                required={!sessionMatchesInvite}
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                placeholder="+968…"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                disabled={Boolean(signedInEmail && !sessionMatchesInvite)}
              />
            </label>
            <label>
              <span>{l("البريد الإلكتروني (إجباري كما في الدعوة)", "Email (locked to invite)")}</span>
              <input required type="email" readOnly value={invite?.email ?? ""} autoComplete="email" />
            </label>
            {!sessionMatchesInvite ? (
              <label>
                <span>{l("كلمة المرور (12 حرفاً على الأقل)", "Password (min 12 characters)")}</span>
                <input
                  required
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={Boolean(signedInEmail && !sessionMatchesInvite)}
                />
              </label>
            ) : null}

            <button
              type="submit"
              className="auth-submit"
              disabled={Boolean(signedInEmail && !sessionMatchesInvite)}
            >
              {sessionMatchesInvite
                ? l("قبول الدعوة والدخول", "Accept invite and enter")
                : l("إنشاء الحساب والانضمام", "Create account and join")}
            </button>

            {errorCode ? (
              <p className="auth-error" role="alert">{inviteErrorMessage(errorCode, l, signedInEmail)}</p>
            ) : null}
          </form>
        )}
      </section>
      <aside>
        <span className="brand-glyph"><WazenIcon className="h-10 w-auto" /></span>
        <h2>{l("تعاون واضح بصلاحيات محددة.", "Clear collaboration with precise roles.")}</h2>
      </aside>
    </main>
  );
}
