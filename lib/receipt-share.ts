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

/** WhatsApp Web compose URL — better on desktop when the Desktop/Web session is logged in. */
export function whatsappWebShareUrl(phoneDigits: string | null | undefined, text: string) {
  const phone = String(phoneDigits ?? "").replace(/\D/g, "");
  const encoded = encodeURIComponent(text);
  return phone
    ? `https://web.whatsapp.com/send?phone=${phone}&text=${encoded}`
    : `https://web.whatsapp.com/send?text=${encoded}`;
}

export function isLikelyMobileWhatsAppClient(userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "") {
  if (/Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) return true;
  // iPadOS 13+ may report as Macintosh with touch
  if (typeof navigator !== "undefined" && navigator.maxTouchPoints > 1 && /Macintosh/i.test(userAgent)) return true;
  return false;
}

/** Pick wa.me (app) on phones, web.whatsapp.com/send on desktop. */
export function toDeviceWhatsAppUrl(url: string) {
  const raw = String(url ?? "").trim();
  if (!raw) return raw;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./, "");
    let phone = "";
    let text = parsed.searchParams.get("text") ?? "";
    if (host === "wa.me" || host === "api.whatsapp.com") {
      phone = parsed.pathname.replace(/\D/g, "");
    } else if (host === "web.whatsapp.com") {
      phone = String(parsed.searchParams.get("phone") ?? "").replace(/\D/g, "");
    } else {
      return raw;
    }
    if (isLikelyMobileWhatsAppClient()) {
      return whatsappShareUrl(phone || null, text);
    }
    return whatsappWebShareUrl(phone || null, text);
  } catch {
    return raw;
  }
}

/** Open WhatsApp chat with prefilled text — app on mobile, WhatsApp Web on desktop. */
export function openWhatsAppUrl(url: string) {
  if (typeof window === "undefined") return false;
  const target = toDeviceWhatsAppUrl(url);
  window.open(target, "_blank", "noopener,noreferrer");
  return true;
}
