/** Queue member payment receipt emails (WhatsApp-style body). */

import { appOrigin } from "./app-origin";
import { formatMoneyMinor } from "./money";
import { buildReceiptWhatsAppMessage, signReceiptShareToken } from "./receipt-share";
import { drainEmailOutbox, isEmailProviderConfigured } from "./email-provider";

export async function queueMemberPaymentReceiptEmail(input: {
  db: D1Database;
  request?: Request;
  member: { id: string; display_name: string; email: string | null | undefined; space_id: string };
  transaction: { id: string; description_ar: string; description_en: string; amount_minor: number; occurred_at: string };
  space: { name_ar: string; name_en: string; currency: string };
  locale?: "ar" | "en";
  flush?: boolean;
}) {
  const email = String(input.member.email ?? "").trim();
  if (!email) return { queued: false as const, reason: "NO_EMAIL" };
  const locale = input.locale ?? "ar";
  let origin = "https://wazen.bhd-om.com";
  try {
    origin = appOrigin(input.request);
  } catch {
    /* keep fallback */
  }

  const shareToken = signReceiptShareToken({ transactionId: input.transaction.id, locale });
  const receiptUrl = `${origin}/r/${encodeURIComponent(shareToken)}`;
  const message = buildReceiptWhatsAppMessage({
    locale,
    memberName: input.member.display_name,
    description: locale === "ar" ? input.transaction.description_ar : input.transaction.description_en,
    walletName: locale === "ar" ? input.space.name_ar : input.space.name_en,
    amountLabel: formatMoneyMinor(Number(input.transaction.amount_minor), input.space.currency, locale),
    dateLabel: new Date(input.transaction.occurred_at).toLocaleDateString(locale === "ar" ? "ar-OM" : "en-GB"),
    reference: input.transaction.id.slice(0, 8).toUpperCase(),
    receiptUrl,
  });
  const createdAt = new Date().toISOString();
  await input.db.prepare(
    "INSERT INTO email_outbox (id,recipient,template,payload_json,status,created_at) VALUES (?,?,?,?,'pending',?)",
  ).bind(
    crypto.randomUUID(),
    email,
    "member_receipt",
    JSON.stringify({
      displayName: input.member.display_name,
      message,
      html: message.replaceAll("\n", "<br/>"),
      transactionId: input.transaction.id,
      receiptUrl,
      link: receiptUrl,
      locale,
    }),
    createdAt,
  ).run();

  if (input.flush !== false && isEmailProviderConfigured()) {
    await drainEmailOutbox(input.db, 5).catch(() => {});
  }
  return { queued: true as const, receiptUrl };
}
