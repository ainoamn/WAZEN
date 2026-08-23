/** Signed public receipt links for WhatsApp (text + URL, no file attach). */

import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function receiptSecret() {
  return (
    process.env.WAZEN_RECEIPT_SECRET?.trim()
    || process.env.WAZEN_JOB_SECRET?.trim()
    || process.env.WAZEN_PAYMENT_WEBHOOK_SECRET?.trim()
    || "wazen-dev-receipt-share"
  );
}

function b64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function fromB64url(input: string) {
  return Buffer.from(input, "base64url");
}

export type ReceiptSharePayload = {
  transactionId: string;
  locale: "ar" | "en";
  exp: number;
};

export function signReceiptShareToken(input: {
  transactionId: string;
  locale?: "ar" | "en";
  ttlMs?: number;
}) {
  const payload: ReceiptSharePayload = {
    transactionId: input.transactionId,
    locale: input.locale ?? "ar",
    exp: Date.now() + (input.ttlMs ?? DEFAULT_TTL_MS),
  };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", receiptSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyReceiptShareToken(token: string): ReceiptSharePayload | null {
  const raw = String(token ?? "").trim();
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", receiptSecret()).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as ReceiptSharePayload;
    if (!payload?.transactionId || !Number.isFinite(payload.exp)) return null;
    if (payload.exp < Date.now()) return null;
    if (payload.locale !== "en") payload.locale = "ar";
    return payload;
  } catch {
    return null;
  }
}

export function buildReceiptWhatsAppMessage(input: {
  locale: "ar" | "en";
  memberName: string;
  description: string;
  walletName: string;
  amountLabel: string;
  dateLabel: string;
  reference: string;
  receiptUrl: string;
}) {
  const name = String(input.memberName || "").trim() || (input.locale === "ar" ? "عزيزي العضو" : "Member");
  const body = input.locale === "ar"
    ? [
        `السلام عليكم ${name}`,
        "",
        "إيصال وازن",
        `الوصف: ${input.description}`,
        `المحفظة: ${input.walletName}`,
        `المساهم: ${name}`,
        `المبلغ: ${input.amountLabel}`,
        `التاريخ: ${input.dateLabel}`,
        `المرجع: ${input.reference}`,
        "",
        `رابط الإيصال (فتح / تنزيل):`,
        input.receiptUrl,
      ]
    : [
        `Hello ${name}`,
        "",
        "WAZEN receipt",
        `Description: ${input.description}`,
        `Wallet: ${input.walletName}`,
        `Member: ${name}`,
        `Amount: ${input.amountLabel}`,
        `Date: ${input.dateLabel}`,
        `Ref: ${input.reference}`,
        "",
        `Receipt link (open / download):`,
        input.receiptUrl,
      ];
  return body.join("\n");
}

export function whatsappShareUrl(phoneDigits: string | null | undefined, text: string) {
  const phone = String(phoneDigits ?? "").replace(/\D/g, "");
  const encoded = encodeURIComponent(text);
  return phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

/** Normalize any WhatsApp https URL to wa.me so phone + desktop both open the WhatsApp app when installed. */
export function toDeviceWhatsAppUrl(url: string) {
  const raw = String(url ?? "").trim();
  if (!raw) return raw;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./, "");
    let phone = "";
    const text = parsed.searchParams.get("text") ?? "";
    if (host === "wa.me" || host === "api.whatsapp.com") {
      phone = parsed.pathname.replace(/\D/g, "");
    } else if (host === "web.whatsapp.com") {
      phone = String(parsed.searchParams.get("phone") ?? "").replace(/\D/g, "");
    } else {
      return raw;
    }
    return whatsappShareUrl(phone || null, text);
  } catch {
    return raw;
  }
}

/** Open WhatsApp with prefilled text via wa.me (app on mobile and WhatsApp Desktop when available). */
export function openWhatsAppUrl(url: string) {
  if (typeof window === "undefined") return false;
  const target = toDeviceWhatsAppUrl(url);
  window.open(target, "_blank", "noopener,noreferrer");
  return true;
}
