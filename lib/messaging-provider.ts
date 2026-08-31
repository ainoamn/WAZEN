/**
 * Outbound WhatsApp (Meta Cloud API) + SMS (Twilio or Unifonic).
 * Mirrors email_outbox: queue rows, flush when provider env is configured.
 */

import { toWhatsAppNumber } from "./phone.ts";

export type MessageChannel = "whatsapp" | "sms";

export type MessageOutboxRow = {
  id: string;
  channel: MessageChannel;
  recipient: string;
  template: string;
  payload_json: string;
  attempts: number;
};

type InvitePayload = {
  inviter?: string;
  spaceName?: string;
  link?: string;
  locale?: "ar" | "en";
  body?: string;
};

function env(name: string) {
  return process.env[name]?.trim().replace(/^["']+|["']+$/g, "") || "";
}

/** Meta WhatsApp Cloud API ready (token + phone number id). */
export function isWhatsAppCloudConfigured() {
  return Boolean(env("WHATSAPP_TOKEN") && env("WHATSAPP_PHONE_NUMBER_ID"));
}

/** SMS via Twilio or Unifonic. */
export function isSmsProviderConfigured() {
  if (env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN") && env("TWILIO_FROM_NUMBER")) return true;
  if (env("UNIFONIC_APP_SID") && env("UNIFONIC_SENDER_ID")) return true;
  return false;
}

export function isMessagingConfigured() {
  return isWhatsAppCloudConfigured() || isSmsProviderConfigured();
}

function inviteBody(data: InvitePayload) {
  if (data.body?.trim()) return data.body.trim();
  const locale = data.locale === "en" ? "en" : "ar";
  const inviter = data.inviter || (locale === "ar" ? "عضو" : "a member");
  const space = data.spaceName || (locale === "ar" ? "محفظة وازن" : "a Wazen wallet");
  const link = data.link || "";
  if (locale === "en") {
    return `${inviter} invited you to join “${space}” on Wazen.\nOpen: ${link}`;
  }
  return `${inviter} دعاك للانضمام إلى «${space}» في وازن.\nافتح الرابط: ${link}`;
}

async function sendWhatsAppCloud(toE164Digits: string, data: InvitePayload) {
  const token = env("WHATSAPP_TOKEN");
  const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
  const template = env("WHATSAPP_INVITE_TEMPLATE");
  const lang = env("WHATSAPP_TEMPLATE_LANG") || "ar";
  if (!token || !phoneNumberId) throw new Error("WHATSAPP_NOT_CONFIGURED");

  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`;
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
  };

  let body: Record<string, unknown>;
  if (template) {
    // Approved template: body params = inviter, space, link (order depends on your Meta template).
    body = {
      messaging_product: "whatsapp",
      to: toE164Digits,
      type: "template",
      template: {
        name: template,
        language: { code: lang },
        components: [{
          type: "body",
          parameters: [
            { type: "text", text: String(data.inviter || "Wazen").slice(0, 60) },
            { type: "text", text: String(data.spaceName || "Wazen").slice(0, 60) },
            { type: "text", text: String(data.link || "").slice(0, 1024) },
          ],
        }],
      },
    };
  } else {
    // Session/free-form — works only within 24h customer-care window; prefer templates in production.
    body = {
      messaging_product: "whatsapp",
      to: toE164Digits,
      type: "text",
      text: { preview_url: true, body: inviteBody(data).slice(0, 4096) },
    };
  }

  const response = await fetch(url, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`WHATSAPP_REJECTED:${response.status}:${detail.slice(0, 240)}`);
  }
}

async function sendSmsTwilio(toE164: string, text: string) {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  const from = env("TWILIO_FROM_NUMBER");
  if (!sid || !token || !from) throw new Error("TWILIO_NOT_CONFIGURED");
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const form = new URLSearchParams({ To: `+${toE164.replace(/^\+/, "")}`, From: from, Body: text.slice(0, 1600) });
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`TWILIO_REJECTED:${response.status}:${detail.slice(0, 240)}`);
  }
}

async function sendSmsUnifonic(toE164: string, text: string) {
  const appSid = env("UNIFONIC_APP_SID");
  const sender = env("UNIFONIC_SENDER_ID");
  const base = env("UNIFONIC_BASE_URL") || "https://el.cloud.unifonic.com";
  if (!appSid || !sender) throw new Error("UNIFONIC_NOT_CONFIGURED");
  const endpoint = `${base.replace(/\/$/, "")}/rest/SMS/messages`;
  const form = new URLSearchParams({
    AppSid: appSid,
    SenderID: sender,
    Recipient: toE164.replace(/^\+/, ""),
    Body: text.slice(0, 1000),
    ResponseType: "JSON",
  });
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`UNIFONIC_REJECTED:${response.status}:${detail.slice(0, 240)}`);
  }
}

export async function deliverOutboxMessage(row: MessageOutboxRow) {
  const data = JSON.parse(row.payload_json) as InvitePayload;
  const digits = toWhatsAppNumber(row.recipient) || row.recipient.replace(/\D/g, "");
  if (!digits || digits.length < 8) throw new Error("INVALID_PHONE");

  if (row.channel === "whatsapp") {
    await sendWhatsAppCloud(digits, data);
    return;
  }

  const text = inviteBody(data);
  if (env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN") && env("TWILIO_FROM_NUMBER")) {
    await sendSmsTwilio(digits, text);
    return;
  }
  if (env("UNIFONIC_APP_SID") && env("UNIFONIC_SENDER_ID")) {
    await sendSmsUnifonic(digits, text);
    return;
  }
  throw new Error("SMS_NOT_CONFIGURED");
}

async function markSent(db: D1Database, id: string) {
  await db.prepare("UPDATE message_outbox SET status='sent',attempts=attempts+1,sent_at=? WHERE id=? AND status='pending'")
    .bind(new Date().toISOString(), id).run();
}

async function markFailed(db: D1Database, id: string) {
  await db.prepare("UPDATE message_outbox SET attempts=attempts+1,status=CASE WHEN attempts+1>=5 THEN 'failed' ELSE 'pending' END WHERE id=?")
    .bind(id).run();
}

export async function enqueueMessage(db: D1Database, input: {
  channel: MessageChannel;
  recipient: string;
  template: string;
  payload: InvitePayload;
  createdAt?: string;
}) {
  const digits = toWhatsAppNumber(input.recipient) || input.recipient.replace(/\D/g, "");
  if (!digits) return null;
  if (input.channel === "whatsapp" && !isWhatsAppCloudConfigured()) return null;
  if (input.channel === "sms" && !isSmsProviderConfigured()) return null;
  const id = crypto.randomUUID();
  const createdAt = input.createdAt || new Date().toISOString();
  await db.prepare(
    "INSERT INTO message_outbox (id,channel,recipient,template,payload_json,status,created_at) VALUES (?,?,?,?,?,'pending',?)",
  ).bind(id, input.channel, digits, input.template, JSON.stringify(input.payload), createdAt).run();
  return id;
}

export async function flushMessageOutboxByIds(db: D1Database, ids: string[]) {
  const unique = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!unique.length) return { skipped: true as const, reason: "NO_IDS", processed: 0, sent: 0 };
  let sent = 0;
  for (const id of unique) {
    const row = await db.prepare(
      "SELECT id,channel,recipient,template,payload_json,attempts FROM message_outbox WHERE id=? AND status='pending' AND attempts<5 LIMIT 1",
    ).bind(id).first<MessageOutboxRow>();
    if (!row) continue;
    try {
      await deliverOutboxMessage(row);
      await markSent(db, row.id);
      sent += 1;
    } catch {
      await markFailed(db, row.id);
    }
  }
  return { skipped: false as const, processed: unique.length, sent };
}

export async function drainMessageOutbox(db: D1Database, limit = 20) {
  if (!isMessagingConfigured()) {
    return { skipped: true as const, reason: "MESSAGING_NOT_CONFIGURED", processed: 0, sent: 0 };
  }
  const pending = await db.prepare(
    "SELECT id,channel,recipient,template,payload_json,attempts FROM message_outbox WHERE status='pending' AND attempts<5 ORDER BY created_at LIMIT ?",
  ).bind(limit).all<MessageOutboxRow>();
  let sent = 0;
  for (const row of pending.results ?? []) {
    try {
      await deliverOutboxMessage(row);
      await markSent(db, row.id);
      sent += 1;
    } catch {
      await markFailed(db, row.id);
    }
  }
  return { skipped: false as const, processed: pending.results?.length ?? 0, sent };
}
