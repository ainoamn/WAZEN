/** Outbound email: Resend API (preferred) or legacy HTTPS webhook bridge. */

import { appOrigin } from "./app-origin";
import {
  applyTemplatePlaceholders,
  brandedEmailShell,
  DEFAULT_EMAIL_TEMPLATES,
  type EmailTemplateId,
} from "./email-template-catalog";
import { resolveEmailTemplate } from "./email-template-store";

export type EmailOutboxRow = {
  id: string;
  recipient: string;
  template: string;
  payload_json: string;
  attempts: number;
};

type TemplatePayload = Record<string, unknown>;

type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

function env(name: string) {
  return process.env[name]?.trim().replace(/^["']+|["']+$/g, "") || "";
}

/** True when Resend or the legacy webhook bridge is configured. */
export function isEmailProviderConfigured() {
  if (env("RESEND_API_KEY") && env("RESEND_FROM_EMAIL")) return true;
  return Boolean(env("WAZEN_EMAIL_WEBHOOK_URL") && env("WAZEN_EMAIL_WEBHOOK_TOKEN"));
}

function str(data: TemplatePayload, key: string, fallback = "") {
  const value = data[key];
  return typeof value === "string" ? value : fallback;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function publicOrigin() {
  try {
    return appOrigin();
  } catch {
    return "https://wazen.bhd-om.com";
  }
}

function ctaMeta(template: string, locale: "ar" | "en", link: string, receiptUrl: string) {
  const href = receiptUrl || link;
  if (!href) return { ctaUrl: "", ctaLabel: "" };
  if (template === "verify_email") return { ctaUrl: href, ctaLabel: locale === "ar" ? "تأكيد البريد" : "Verify email" };
  if (template === "reset_password") return { ctaUrl: href, ctaLabel: locale === "ar" ? "تعيين كلمة مرور جديدة" : "Set new password" };
  if (template === "member_invitation") return { ctaUrl: href, ctaLabel: locale === "ar" ? "قبول الدعوة" : "Accept invite" };
  if (template === "member_receipt") return { ctaUrl: href, ctaLabel: locale === "ar" ? "عرض الإيصال" : "View receipt" };
  if (template === "member_statement") return { ctaUrl: href, ctaLabel: locale === "ar" ? "عرض الكشف التفصيلي" : "View full statement" };
  return { ctaUrl: href, ctaLabel: locale === "ar" ? "فتح الرابط" : "Open link" };
}

export async function renderEmailTemplate(
  template: string,
  data: TemplatePayload,
  db?: D1Database | null,
): Promise<RenderedEmail> {
  const locale: "ar" | "en" = str(data, "locale") === "en" ? "en" : "ar";
  const displayName = str(data, "displayName") || str(data, "inviter") || (locale === "ar" ? "مستخدم وازون" : "Wazen user");
  const link = str(data, "link");
  const receiptUrl = str(data, "receiptUrl");
  const message = str(data, "messageAr") || str(data, "message") || str(data, "messageEn");
  const messageHtml = str(data, "html") || escapeHtml(message).replaceAll("\n", "<br/>");
  const definition = await resolveEmailTemplate(db, template);
  const { ctaUrl, ctaLabel } = ctaMeta(template, locale, link, receiptUrl);
  const vars = {
    displayName,
    walletName: str(data, "walletName"),
    link: link || receiptUrl,
    message,
    messageHtml,
    balanceAlertHtml: str(data, "balanceAlertHtml"),
    transactionNoteHtml: str(data, "transactionNoteHtml"),
    owesLabel: str(data, "owesLabel"),
    creditLabel: str(data, "creditLabel"),
    ctaLabel,
    inviter: str(data, "inviter", displayName),
  };
  const subject = applyTemplatePlaceholders(locale === "ar" ? definition.subjectAr : definition.subjectEn, vars);
  const bodyHtml = applyTemplatePlaceholders(locale === "ar" ? definition.bodyHtmlAr : definition.bodyHtmlEn, vars);
  const text = applyTemplatePlaceholders(locale === "ar" ? definition.textAr : definition.textEn, vars);
  const origin = publicOrigin();
  const html = brandedEmailShell({
    title: subject,
    bodyHtml,
    logoUrl: `${origin}/brand/wazen-lockup.png`,
    appOrigin: origin,
    locale,
    ctaUrl,
    ctaLabel,
  });
  return { subject, html, text: text || message || subject };
}

/** Sync helper for tests / fallback without DB override. */
export function renderEmailTemplateSync(template: string, data: TemplatePayload): RenderedEmail {
  const locale: "ar" | "en" = str(data, "locale") === "en" ? "en" : "ar";
  const id = (template in DEFAULT_EMAIL_TEMPLATES ? template : "dues_digest") as EmailTemplateId;
  const definition = DEFAULT_EMAIL_TEMPLATES[id];
  const displayName = str(data, "displayName") || (locale === "ar" ? "مستخدم وازون" : "Wazen user");
  const link = str(data, "link") || str(data, "receiptUrl");
  const message = str(data, "message") || str(data, "messageAr") || str(data, "messageEn");
  const messageHtml = str(data, "html") || escapeHtml(message).replaceAll("\n", "<br/>");
  const { ctaUrl, ctaLabel } = ctaMeta(template, locale, link, str(data, "receiptUrl"));
  const vars = {
    displayName,
    walletName: str(data, "walletName"),
    link,
    message,
    messageHtml,
    balanceAlertHtml: str(data, "balanceAlertHtml"),
    transactionNoteHtml: str(data, "transactionNoteHtml"),
    owesLabel: str(data, "owesLabel"),
    creditLabel: str(data, "creditLabel"),
    ctaLabel,
    inviter: str(data, "inviter", displayName),
  };
  const subject = applyTemplatePlaceholders(locale === "ar" ? definition.subjectAr : definition.subjectEn, vars);
  const bodyHtml = applyTemplatePlaceholders(locale === "ar" ? definition.bodyHtmlAr : definition.bodyHtmlEn, vars);
  const text = applyTemplatePlaceholders(locale === "ar" ? definition.textAr : definition.textEn, vars);
  const origin = publicOrigin();
  return {
    subject,
    text,
    html: brandedEmailShell({
      title: subject,
      bodyHtml,
      logoUrl: `${origin}/brand/wazen-lockup.png`,
      appOrigin: origin,
      locale,
      ctaUrl,
      ctaLabel,
    }),
  };
}

async function sendViaResend(to: string, rendered: RenderedEmail) {
  const apiKey = env("RESEND_API_KEY");
  const from = env("RESEND_FROM_EMAIL");
  if (!apiKey || !from) throw new Error("RESEND_NOT_CONFIGURED");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`RESEND_REJECTED:${response.status}:${detail.slice(0, 200)}`);
  }
}

async function sendViaWebhook(to: string, template: string, data: TemplatePayload) {
  const { configuredAllowedHosts, validateOutboundHttpsUrl } = await import("./outbound");
  const configuredEndpoint = env("WAZEN_EMAIL_WEBHOOK_URL");
  const token = env("WAZEN_EMAIL_WEBHOOK_TOKEN");
  if (!configuredEndpoint || !token) throw new Error("EMAIL_WEBHOOK_NOT_CONFIGURED");
  const endpoint = validateOutboundHttpsUrl(configuredEndpoint, configuredAllowedHosts("email"));
  const response = await fetch(endpoint.toString(), {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to, template, data }),
  });
  if (!response.ok) throw new Error("PROVIDER_REJECTED");
}

export async function deliverOutboxEmail(message: EmailOutboxRow, db?: D1Database | null) {
  const data = JSON.parse(message.payload_json) as TemplatePayload;
  const rendered = await renderEmailTemplate(message.template, data, db);
  if (env("RESEND_API_KEY") && env("RESEND_FROM_EMAIL")) {
    await sendViaResend(message.recipient, rendered);
    return;
  }
  await sendViaWebhook(message.recipient, message.template, data);
}

async function markOutboxSent(db: D1Database, id: string) {
  await db.prepare("UPDATE email_outbox SET status='sent',attempts=attempts+1,sent_at=? WHERE id=? AND status='pending'")
    .bind(new Date().toISOString(), id).run();
}

async function markOutboxAttemptFailed(db: D1Database, id: string) {
  await db.prepare("UPDATE email_outbox SET attempts=attempts+1,status=CASE WHEN attempts+1>=5 THEN 'failed' ELSE 'pending' END WHERE id=?")
    .bind(id).run();
}

/** Deliver only the given outbox rows (never other users' queued mail). */
export async function flushOutboxByIds(db: D1Database, ids: string[]) {
  const unique = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!unique.length) return { skipped: true as const, reason: "NO_IDS", processed: 0, sent: 0 };
  if (!isEmailProviderConfigured()) {
    return { skipped: true as const, reason: "EMAIL_PROVIDER_NOT_CONFIGURED", processed: 0, sent: 0 };
  }
  let sent = 0;
  for (const id of unique) {
    const message = await db.prepare(
      "SELECT id,recipient,template,payload_json,attempts FROM email_outbox WHERE id=? AND status='pending' AND attempts<5 LIMIT 1",
    ).bind(id).first<EmailOutboxRow>();
    if (!message) continue;
    try {
      await deliverOutboxEmail(message, db);
      await markOutboxSent(db, message.id);
      sent += 1;
    } catch {
      await markOutboxAttemptFailed(db, message.id);
    }
  }
  return { skipped: false as const, processed: unique.length, sent };
}

/** Drain pending rows from email_outbox. Shared by /api/jobs/email and /api/jobs/tick. */
export async function drainEmailOutbox(db: D1Database, limit = 20) {
  if (!isEmailProviderConfigured()) {
    return { skipped: true as const, reason: "EMAIL_PROVIDER_NOT_CONFIGURED", processed: 0, sent: 0 };
  }
  const pending = await db.prepare(
    "SELECT id,recipient,template,payload_json,attempts FROM email_outbox WHERE status='pending' AND attempts<5 ORDER BY created_at LIMIT ?",
  ).bind(limit).all<EmailOutboxRow>();
  let sent = 0;
  for (const message of pending.results ?? []) {
    try {
      await deliverOutboxEmail(message, db);
      await markOutboxSent(db, message.id);
      sent += 1;
    } catch {
      await markOutboxAttemptFailed(db, message.id);
    }
  }
  return { skipped: false as const, processed: pending.results?.length ?? 0, sent };
}
