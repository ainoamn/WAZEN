"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AccountHeader, useCommerceLocale } from "../../commercial-kit";
import { apiFetch } from "../../../lib/client-api";
import { errorLabel } from "../../../lib/admin-labels";

type ApiKeyRow = { id: string; name: string; key_prefix: string; scopes: string[]; expires_at: string; revoked_at: string | null };
type WebhookRow = { id: string; url: string; events: string[]; status: string; createdAt: string; revokedAt: string | null };
type DeliveryRow = { id: string; webhookId: string; event: string; status: string; attempts: number; lastError: string | null; createdAt: string; sentAt: string | null };

const DEFAULT_EVENTS = [
  "transaction.created",
  "transaction.voided",
  "member.invited",
  "surplus.withdrawn",
  "contribution.recorded",
  "member.updated",
  "document.created",
  "settlement.settled",
  "period.closed",
  "period.reopened",
  "contribution_plan.updated",
  "expense.created",
  "expense.voided",
  "space.created",
  "space.updated",
  "space.archived",
  "circle.order_set",
  "circle.turn_paid",
  "settlement.voided",
  "share.created",
  "transaction.updated",
  "expense.updated",
  "expense.resplit",
  "space.linked",
  "space.unlinked",
  "space.bank_linked",
  "space.bank_unlinked",
  "space.transferred",
  "account.created",
];

export function SecurityClient() {
  const { locale, setLocale, l } = useCommerceLocale();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNext] = useState("");
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [rawKey, setRawKey] = useState("");
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [eventOptions, setEventOptions] = useState<string[]>(DEFAULT_EVENTS);

  const refresh = () =>
    fetch("/api/platform?view=security", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: { apiKeys: ApiKeyRow[] }) => setKeys(data.apiKeys))
      .catch(() => undefined);

  const refreshWebhooks = () =>
    fetch("/api/platform?view=webhooks", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: { webhooks: WebhookRow[]; deliveries?: DeliveryRow[]; events?: string[] }) => {
        setWebhooks(data.webhooks ?? []);
        setDeliveries(data.deliveries ?? []);
        if (data.events?.length) setEventOptions(data.events);
      })
      .catch(() => undefined);

  useEffect(() => {
    void refresh();
    void refreshWebhooks();
  }, []);

  const send = async (body: Record<string, unknown>) => {
    setMessage("");
    const response = await apiFetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json() as { error?: string; secret?: string; otpauthUri?: string };
    if (!response.ok) {
      setMessage(errorLabel(data.error ?? "INTERNAL_ERROR", locale));
      return data;
    }
    setMessage(l("تم الحفظ بنجاح", "Saved successfully"));
    return data;
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    const result = await send({ action: "changePassword", currentPassword, newPassword });
    if (!result.error) {
      setCurrent("");
      setNext("");
    }
  };
  const beginTotp = async () => {
    const result = await send({ action: "beginTotp", currentPassword });
    setSecret(result.secret ?? "");
    setUri(result.otpauthUri ?? "");
  };
  const confirmTotp = async () => {
    const result = await send({ action: "confirmTotp", totpCode: code });
    if (!result.error) {
      setSecret("");
      setUri("");
      setCode("");
    }
  };

  const createKey = async (mode: "read" | "write") => {
    const scopes = mode === "write"
      ? ["wallets:read", "wallets:write", "members:write", "settlements:write", "documents:read", "webhooks:read", "webhooks:write"]
      : ["wallets:read", "documents:read", "webhooks:read"];
    const response = await apiFetch("/api/platform", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "createApiKey",
        idempotencyKey: crypto.randomUUID(),
        name: mode === "write" ? "Wazen integration (write)" : "Wazen integration",
        scopes,
        expiresInDays: 90,
      }),
    });
    const result = await response.json() as { apiKey?: { token: string }; error?: string };
    setMessage(response.ok
      ? l("انسخ المفتاح الآن؛ لن يظهر مرة أخرى.", "Copy the key now; it will not be shown again.")
      : errorLabel(result.error ?? "ERROR", locale));
    if (result.apiKey) setRawKey(result.apiKey.token);
    await refresh();
  };

  const revokeKey = async (apiKeyId: string) => {
    await apiFetch("/api/platform", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "revokeApiKey", idempotencyKey: crypto.randomUUID(), apiKeyId }),
    });
    await refresh();
  };

  const createWebhook = async () => {
    setMessage("");
    setWebhookSecret("");
    const response = await apiFetch("/api/platform", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "createWebhook",
        idempotencyKey: crypto.randomUUID(),
        url: webhookUrl.trim(),
        events: eventOptions,
      }),
    });
    const result = await response.json() as { webhook?: { secret: string }; error?: string };
    if (!response.ok) {
      setMessage(errorLabel(result.error ?? "INVALID_WEBHOOK", locale));
      return;
    }
    setWebhookSecret(result.webhook?.secret ?? "");
    setWebhookUrl("");
    setMessage(l("أُنشئ الـ webhook — انسخ السر الآن.", "Webhook created — copy the secret now."));
    await refreshWebhooks();
  };

  const revokeWebhook = async (webhookId: string) => {
    await apiFetch("/api/platform", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "revokeWebhook", idempotencyKey: crypto.randomUUID(), webhookId }),
    });
    await refreshWebhooks();
  };

  const testWebhook = async (webhookId: string) => {
    setMessage("");
    const response = await apiFetch("/api/platform", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "testWebhook", idempotencyKey: crypto.randomUUID(), webhookId }),
    });
    const result = await response.json() as { error?: string };
    setMessage(response.ok
      ? l("طُلب اختبار — يُسلَّم مع دورة tick التالية.", "Test queued — delivered on the next tick cycle.")
      : errorLabel(result.error ?? "INVALID_WEBHOOK", locale));
    await refreshWebhooks();
  };

  return (
    <main className="auth-page">
      <AccountHeader locale={locale} setLocale={setLocale} />
      <section className="auth-panel" style={{ maxWidth: 760 }}>
        <div className="auth-copy">
          <small>{l("أمان الحساب", "Account security")}</small>
          <h1>{l("كلمة المرور والمصادقة", "Password and authentication")}</h1>
          <p>{l("تغيير كلمة المرور يلغي الجلسات القديمة. مفاتيح API وWebhooks محدودة الصلاحية.", "Changing your password revokes old sessions. API keys and webhooks are scoped.")}</p>
        </div>
        {message && <p role="status" className="auth-error">{message}</p>}

        <form onSubmit={changePassword}>
          <h2>{l("تغيير كلمة المرور", "Change password")}</h2>
          <label>
            <span>{l("كلمة المرور الحالية", "Current password")}</span>
            <input type="password" autoComplete="current-password" minLength={12} required value={currentPassword} onChange={(event) => setCurrent(event.target.value)} />
          </label>
          <label>
            <span>{l("كلمة المرور الجديدة", "New password")}</span>
            <input type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={(event) => setNext(event.target.value)} />
          </label>
          <button className="auth-submit">{l("تغيير وإلغاء الجلسات القديمة", "Change and revoke old sessions")}</button>
        </form>

        <form onSubmit={(event) => event.preventDefault()}>
          <h2>{l("المصادقة الثنائية TOTP", "TOTP two-factor authentication")}</h2>
          <button type="button" className="auth-submit" onClick={beginTotp}>{l("بدء الإعداد", "Start setup")}</button>
          {secret && (
            <>
              <label><span>{l("المفتاح السري — يظهر مرة واحدة", "Secret — shown once")}</span><input readOnly value={secret} /></label>
              <label><span>{l("رابط تطبيق المصادقة", "Authenticator URI")}</span><textarea readOnly value={uri} /></label>
              <label>
                <span>{l("رمز من 6 أرقام", "6-digit code")}</span>
                <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
              </label>
              <button type="button" className="auth-submit" onClick={confirmTotp}>{l("تأكيد التفعيل", "Confirm activation")}</button>
            </>
          )}
        </form>

        <section>
          <h2>{l("مفاتيح API", "API keys")}</h2>
          <p><Link href="/developers">{l("وثائق واجهة البرمجة v1", "Business API v1 docs")}</Link></p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button className="auth-submit" type="button" onClick={() => void createKey("read")}>{l("مفتاح قراءة 90 يوماً", "90-day read key")}</button>
            <button className="auth-submit" type="button" onClick={() => void createKey("write")}>{l("مفتاح كتابة 90 يوماً", "90-day write key")}</button>
          </div>
          {rawKey && <label><span>{l("المفتاح الجديد", "New key")}</span><textarea readOnly value={rawKey} /></label>}
          <ul>{keys.filter((key) => !key.revoked_at).map((key) => (
            <li key={key.id}><code>{key.key_prefix}…</code> — {key.name} <button type="button" onClick={() => void revokeKey(key.id)}>{l("إلغاء", "Revoke")}</button></li>
          ))}</ul>
        </section>

        <section>
          <h2>{l("Webhooks التكامل", "Integration webhooks")}</h2>
          <p>{l("HTTPS فقط. التوقيع: رأس X-Wazen-Signature = sha256=HMAC. التسليم عبر /api/jobs/tick.", "HTTPS only. Signature header X-Wazen-Signature = sha256=HMAC. Delivered via /api/jobs/tick.")}</p>
          <label>
            <span>{l("رابط الاستقبال (HTTPS)", "Receiver URL (HTTPS)")}</span>
            <input type="url" placeholder="https://example.com/wazen-hooks" value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} />
          </label>
          <button className="auth-submit" type="button" disabled={!webhookUrl.trim()} onClick={() => void createWebhook()}>
            {l("إنشاء webhook", "Create webhook")}
          </button>
          {webhookSecret && <label><span>{l("سر التوقيع — يظهر مرة واحدة", "Signing secret — shown once")}</span><textarea readOnly value={webhookSecret} /></label>}
          <ul>{webhooks.filter((hook) => hook.status === "active").map((hook) => (
            <li key={hook.id}>
              <code>{hook.url}</code>
              <small> · {hook.events.join(", ")}</small>
              {" "}
              <button type="button" onClick={() => void testWebhook(hook.id)}>{l("اختبار", "Test")}</button>
              {" "}
              <button type="button" onClick={() => void revokeWebhook(hook.id)}>{l("إلغاء", "Revoke")}</button>
            </li>
          ))}</ul>
          {deliveries.length ? (
            <>
              <h3>{l("آخر التسليمات", "Recent deliveries")}</h3>
              <ul>{deliveries.slice(0, 12).map((row) => (
                <li key={row.id}>
                  <strong>{row.event}</strong> · {row.status}
                  <small> · {new Date(row.createdAt).toLocaleString(locale === "ar" ? "ar-OM" : "en-GB")}</small>
                  {row.lastError ? <em> · {row.lastError}</em> : null}
                </li>
              ))}</ul>
            </>
          ) : null}
        </section>

        <footer><Link href="/dashboard">{l("العودة إلى لوحة التحكم", "Back to dashboard")}</Link></footer>
      </section>
    </main>
  );
}
