"use client";
import Link from "next/link";
import { useState } from "react";
import { Brand, useCommerceLocale } from "../commercial-kit";
import { apiFetch } from "../../lib/client-api";

export function InviteClient({ token }: { token: string }) {
  const { locale, setLocale, l } = useCommerceLocale(); const [status, setStatus] = useState<"idle" | "saving" | "done" | "login" | "error">("idle");
  const accept = async () => { setStatus("saving"); const response = await apiFetch("/api/platform", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "acceptInvite", idempotencyKey: crypto.randomUUID(), token }) }); if (response.status === 401) { setStatus("login"); return; } setStatus(response.ok ? "done" : "error"); };
  const next = `/invite?token=${encodeURIComponent(token)}`;
  return <main className="auth-page"><section className="auth-panel"><header><Brand /><button onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>{locale === "ar" ? "EN" : "عربي"}</button></header><div className="auth-copy"><small>{l("دعوة إلى مساحة مالية", "Financial workspace invitation")}</small><h1>{l("انضم إلى المجموعة", "Join the group")}</h1><p>{l("لن تتمكن من رؤية أي بيانات إلا بعد تسجيل الدخول بالبريد الذي استلم الدعوة.", "Access is granted only after signing in with the invited email address.")}</p></div>{status === "done" ? <><p>{l("تم قبول الدعوة بنجاح.", "Invitation accepted.")}</p><Link className="auth-submit" href="/dashboard">{l("فتح لوحة التحكم", "Open dashboard")}</Link></> : status === "login" ? <Link className="auth-submit" href={`/login?next=${encodeURIComponent(next)}`}>{l("سجّل الدخول للمتابعة", "Sign in to continue")}</Link> : <button className="auth-submit" onClick={() => void accept()} disabled={status === "saving" || token.length < 40}>{status === "saving" ? l("جارٍ القبول…", "Accepting…") : l("قبول الدعوة", "Accept invitation")}</button>}{status === "error" && <p className="auth-error">{l("الدعوة غير صالحة أو منتهية.", "The invitation is invalid or expired.")}</p>}</section><aside><span>و</span><h2>{l("تعاون واضح بصلاحيات محددة.", "Clear collaboration with precise roles.")}</h2></aside></main>;
}
