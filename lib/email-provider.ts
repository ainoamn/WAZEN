/** Outbound email: Resend API (preferred) or legacy HTTPS webhook bridge. */

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

function wrapHtml(title: string, bodyHtml: string) {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f4f6f2;font-family:Tahoma,Arial,sans-serif;color:#17332d;">
  <div style="max-width:560px;margin:24px auto;padding:24px;background:#fff;border:1px solid #dce5e0;border-radius:16px;">
    <p style="margin:0 0 8px;font-size:13px;color:#6d7b75;">وازون · Wazen</p>
    <h1 style="margin:0 0 16px;font-size:20px;letter-spacing:-0.02em;">${escapeHtml(title)}</h1>
    ${bodyHtml}
    <p style="margin:28px 0 0;font-size:12px;color:#8a9690;line-height:1.5;">إذا لم تطلب هذا الإجراء يمكنك تجاهله بأمان.</p>
  </div>
</body>
</html>`;
}

function cta(href: string, label: string) {
  const safe = escapeHtml(href);
  return `<p style="margin:20px 0;"><a href="${safe}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#0f766e;color:#fff;text-decoration:none;font-weight:700;">${escapeHtml(label)}</a></p>
<p style="margin:0;font-size:12px;color:#6d7b75;word-break:break-all;">${safe}</p>`;
}

export function renderEmailTemplate(template: string, data: TemplatePayload): RenderedEmail {
  const displayName = str(data, "displayName", "مستخدم وازون");
  const link = str(data, "link");
  const messageAr = str(data, "messageAr") || str(data, "message");
  const messageEn = str(data, "messageEn");
  const htmlBody = str(data, "html");

  switch (template) {
    case "verify_email": {
      const subject = "تأكيد بريدك في وازون";
      const text = `مرحباً ${displayName},\n\nأكّد بريدك عبر الرابط:\n${link}\n`;
      const html = wrapHtml(subject, `<p>مرحباً ${escapeHtml(displayName)}،</p><p>اضغط الزر لتأكيد بريدك وتفعيل الحساب.</p>${cta(link, "تأكيد البريد")}`);
      return { subject, html, text };
    }
    case "reset_password": {
      const subject = "استعادة كلمة المرور — وازون";
      const text = `مرحباً ${displayName},\n\nعيّن كلمة مرور جديدة عبر:\n${link}\n`;
      const html = wrapHtml(subject, `<p>مرحباً ${escapeHtml(displayName)}،</p><p>طلبت استعادة كلمة المرور. الرابط صالح لفترة محدودة.</p>${cta(link, "تعيين كلمة مرور جديدة")}`);
      return { subject, html, text };
    }
    case "member_invitation": {
      const inviter = str(data, "inviter", "عضو");
      const subject = "دعوة للانضمام إلى محفظة في وازون";
      const text = `${inviter} دعاك إلى وازون:\n${link}\n`;
      const html = wrapHtml(subject, `<p>دعاك <strong>${escapeHtml(inviter)}</strong> للانضمام إلى محفظة على وازون.</p>${cta(link, "قبول الدعوة")}`);
      return { subject, html, text };
    }
    case "member_receipt": {
      const subject = "إيصال من وازون";
      const receiptUrl = str(data, "receiptUrl");
      const bodyText = messageAr || "لديك إيصال جديد من وازون.";
      const text = `${bodyText}\n${receiptUrl || link}\n`;
      const html = wrapHtml(
        subject,
        `<p>مرحباً ${escapeHtml(displayName)}،</p><p>${htmlBody || escapeHtml(bodyText).replaceAll("\n", "<br/>")}</p>${receiptUrl || link ? cta(receiptUrl || link, "عرض الإيصال") : ""}`,
      );
      return { subject, html, text };
    }
    case "dues_digest": {
      const subject = "ملخص مستحقات — وازون";
      const text = `${messageAr || messageEn || "ملخص المستحقات"}\n`;
      const html = wrapHtml(subject, `<p>${escapeHtml(messageAr || messageEn || "ملخص المستحقات").replaceAll("\n", "<br/>")}</p>`);
      return { subject, html, text };
    }
    case "privacy_export_ready": {
      const subject = "تصدير بياناتك جاهز — وازون";
      const text = `${messageAr || messageEn || subject}\n`;
      const html = wrapHtml(subject, `<p>${escapeHtml(messageAr || messageEn || subject)}</p>`);
      return { subject, html, text };
    }
    case "privacy_deletion_done": {
      const subject = "تم حذف بياناتك — وازون";
      const text = `${messageAr || messageEn || subject}\n`;
      const html = wrapHtml(subject, `<p>${escapeHtml(messageAr || messageEn || subject)}</p>`);
      return { subject, html, text };
    }
    default: {
      const subject = `إشعار وازون · ${template}`;
      const text = messageAr || messageEn || JSON.stringify(data);
      const html = wrapHtml(subject, `<p>${htmlBody || escapeHtml(text).replaceAll("\n", "<br/>")}</p>${link ? cta(link, "فتح الرابط") : ""}`);
      return { subject, html, text };
    }
  }
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

export async function deliverOutboxEmail(message: EmailOutboxRow) {
  const data = JSON.parse(message.payload_json) as TemplatePayload;
  const rendered = renderEmailTemplate(message.template, data);
  if (env("RESEND_API_KEY") && env("RESEND_FROM_EMAIL")) {
    await sendViaResend(message.recipient, rendered);
    return;
  }
  await sendViaWebhook(message.recipient, message.template, data);
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
      await deliverOutboxEmail(message);
      await db.prepare("UPDATE email_outbox SET status='sent',attempts=attempts+1,sent_at=? WHERE id=? AND status='pending'")
        .bind(new Date().toISOString(), message.id).run();
      sent += 1;
    } catch {
      await db.prepare("UPDATE email_outbox SET attempts=attempts+1,status=CASE WHEN attempts+1>=5 THEN 'failed' ELSE 'pending' END WHERE id=?")
        .bind(message.id).run();
    }
  }
  return { skipped: false as const, processed: pending.results?.length ?? 0, sent };
}
