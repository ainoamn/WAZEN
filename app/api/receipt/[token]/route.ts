import { ensureSchema, getRawDb } from "../../../../db/runtime";
import { verifyReceiptShareToken } from "../../../../lib/receipt-share";
import { formatMoneyMinor } from "../../../../lib/money";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const payload = verifyReceiptShareToken(token);
  if (!payload) {
    return Response.json({ error: "RECEIPT_LINK_INVALID" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const db = await getRawDb();
  await ensureSchema(db);
  const txn = await db.prepare(`
    SELECT t.id, t.space_id, t.member_id, t.kind, t.amount_minor, t.description_ar, t.description_en,
           t.occurred_at, t.status, m.display_name AS member_name, m.phone AS member_phone,
           s.name_ar AS space_name_ar, s.name_en AS space_name_en, s.currency
    FROM transactions t
    LEFT JOIN members m ON m.id = t.member_id
    JOIN spaces s ON s.id = t.space_id
    WHERE t.id = ?
    LIMIT 1
  `).bind(payload.transactionId).first<{
    id: string;
    space_id: string;
    member_id: string | null;
    kind: string;
    amount_minor: number;
    description_ar: string;
    description_en: string;
    occurred_at: string;
    status: string;
    member_name: string | null;
    member_phone: string | null;
    space_name_ar: string;
    space_name_en: string;
    currency: string;
  }>();

  if (!txn || (txn.status ?? "approved") === "voided") {
    return Response.json({ error: "RECEIPT_NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const locale = payload.locale;
  const amountLabel = formatMoneyMinor(Number(txn.amount_minor), txn.currency || "OMR", locale);
  const dateLabel = new Date(txn.occurred_at).toLocaleDateString(locale === "ar" ? "ar-OM" : "en-GB");
  const description = locale === "ar" ? txn.description_ar : txn.description_en;
  const walletName = locale === "ar" ? txn.space_name_ar : txn.space_name_en;
  const memberName = txn.member_name || (locale === "ar" ? "—" : "—");
  const reference = txn.id.slice(0, 8).toUpperCase();

  return Response.json({
    locale,
    title: locale === "ar" ? "إيصال وازن" : "WAZEN receipt",
    memberName,
    description,
    walletName,
    amountLabel,
    dateLabel,
    reference,
    kind: txn.kind,
    occurredAt: txn.occurred_at,
    currency: txn.currency || "OMR",
    amountMinor: Number(txn.amount_minor),
  }, {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}
