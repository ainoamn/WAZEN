/** Business API v1 — WhatsApp share links for receipts and statements. */

import type { RequestUser } from "../db/runtime";
import { prepareAudit } from "./audit";
import { ApiError } from "./security";
import { formatMoneyMinor } from "./money";
import { toWhatsAppNumber } from "./phone";
import {
  buildReceiptWhatsAppMessage,
  signReceiptShareToken,
  whatsappShareUrl,
} from "./receipt-share";
import {
  buildAssociationStatementWhatsAppMessage,
  buildMemberStatementWhatsAppMessage,
  signAssociationStatementToken,
  signMemberStatementToken,
} from "./statement-share";
import type { MemberLedgerFocus } from "./member-ledger";
import type { StatementTxnFilter } from "./account-statement";

export async function createV1ReceiptShare(
  db: D1Database,
  user: RequestUser,
  space: { id: string; owner_user_id: string; currency: string },
  input: { transactionId: string; locale?: "ar" | "en"; origin?: string },
) {
  const locale = input.locale ?? "ar";
  const txn = await db.prepare("SELECT * FROM transactions WHERE id=? AND space_id=?")
    .bind(input.transactionId, space.id)
    .first<{
      id: string; space_id: string; member_id: string | null; status: string | null;
      description_ar: string; description_en: string; amount_minor: number; occurred_at: string;
    }>();
  if (!txn || (txn.status ?? "approved") === "voided") throw new ApiError(404, "RECEIPT_NOT_FOUND");

  const { assertPlanShareFeature } = await import("../services/admin/billing-service");
  await assertPlanShareFeature(db, space.owner_user_id, "whatsapp", user.id);

  const member = txn.member_id
    ? await db.prepare("SELECT display_name, phone FROM members WHERE id=?")
      .bind(txn.member_id).first<{ display_name: string; phone: string | null }>()
    : null;
  const spaceRow = await db.prepare("SELECT name_ar,name_en,currency FROM spaces WHERE id=?")
    .bind(space.id).first<{ name_ar: string; name_en: string; currency: string }>();
  const memberName = member?.display_name || (locale === "ar" ? "العضو" : "Member");
  const shareToken = signReceiptShareToken({ transactionId: txn.id, locale });
  const origin = input.origin || "https://wazen.bhd-om.com";
  const shareUrl = `${origin}/r/${encodeURIComponent(shareToken)}`;
  const message = buildReceiptWhatsAppMessage({
    locale,
    memberName,
    description: locale === "ar" ? txn.description_ar : txn.description_en,
    walletName: locale === "ar" ? (spaceRow?.name_ar ?? "") : (spaceRow?.name_en ?? ""),
    amountLabel: formatMoneyMinor(Number(txn.amount_minor), spaceRow?.currency || space.currency || "OMR", locale),
    dateLabel: new Date(txn.occurred_at).toLocaleDateString(locale === "ar" ? "ar-OM" : "en-GB"),
    reference: txn.id.slice(0, 8).toUpperCase(),
    receiptUrl: shareUrl,
  });
  const whatsappNumber = member?.phone ? toWhatsAppNumber(member.phone) : "";
  await prepareAudit(db, {
    userId: user.id,
    action: "receipt.shared",
    entityType: "transaction",
    entityId: txn.id,
    metadata: { spaceId: space.id, locale, via: "api.v1" },
    createdAt: new Date().toISOString(),
  }).run();

  return {
    kind: "receipt" as const,
    transactionId: txn.id,
    shareUrl,
    whatsappUrl: whatsappShareUrl(whatsappNumber || null, message),
    locale,
  };
}

export async function createV1MemberStatementShare(
  db: D1Database,
  user: RequestUser,
  space: { id: string; owner_user_id: string; currency: string },
  input: {
    memberId: string;
    focus?: MemberLedgerFocus;
    locale?: "ar" | "en";
    origin?: string;
  },
) {
  const locale = input.locale ?? "ar";
  const focus = (input.focus ?? "all") as MemberLedgerFocus;
  const member = await db.prepare("SELECT * FROM members WHERE id=? AND space_id=? AND status='active'")
    .bind(input.memberId, space.id)
    .first<{
      id: string; space_id: string; display_name: string; phone: string | null;
      due_minor: number; paid_minor: number; extra_minor: number; addon_minor?: number | null;
    }>();
  if (!member) throw new ApiError(404, "MEMBER_NOT_FOUND");

  const { assertPlanShareFeature } = await import("../services/admin/billing-service");
  await assertPlanShareFeature(db, space.owner_user_id, "whatsapp", user.id);

  const spaceRow = await db.prepare("SELECT name_ar,name_en,currency FROM spaces WHERE id=?")
    .bind(space.id).first<{ name_ar: string; name_en: string; currency: string }>();
  const shareToken = signMemberStatementToken({
    memberId: member.id,
    spaceId: member.space_id,
    focus,
    locale,
  });
  const origin = input.origin || "https://wazen.bhd-om.com";
  const shareUrl = `${origin}/s/${encodeURIComponent(shareToken)}`;
  const money = (minor: number) => formatMoneyMinor(minor, spaceRow?.currency || space.currency || "OMR", locale);
  const focusLabel = ({
    all: locale === "ar" ? "الكل" : "All",
    paid: locale === "ar" ? "المدفوع" : "Paid",
    spent: locale === "ar" ? "الصرف" : "Spent",
    owes: locale === "ar" ? "عليه" : "Owes",
    credit: locale === "ar" ? "له" : "Credit",
  })[focus];
  const message = buildMemberStatementWhatsAppMessage({
    locale,
    memberName: member.display_name,
    walletName: locale === "ar" ? (spaceRow?.name_ar ?? "") : (spaceRow?.name_en ?? ""),
    focusLabel,
    paidLabel: money(Number(member.paid_minor) || 0),
    owesLabel: money(Math.max(0, Number(member.due_minor) - Number(member.paid_minor))),
    creditLabel: money(Number(member.extra_minor) + Number(member.addon_minor ?? 0)),
    statementUrl: shareUrl,
  });
  const whatsappNumber = member.phone ? toWhatsAppNumber(member.phone) : "";
  if (!whatsappNumber) throw new ApiError(400, "MEMBER_PHONE_MISSING");

  await prepareAudit(db, {
    userId: user.id,
    action: "statement.member_share",
    entityType: "member",
    entityId: member.id,
    metadata: { spaceId: space.id, focus, locale, via: "api.v1" },
    createdAt: new Date().toISOString(),
  }).run();

  return {
    kind: "member_statement" as const,
    memberId: member.id,
    shareUrl,
    whatsappUrl: whatsappShareUrl(whatsappNumber, message),
    locale,
    focus,
  };
}

export async function createV1AssociationStatementShare(
  db: D1Database,
  user: RequestUser,
  space: { id: string; owner_user_id: string; currency: string; balance_minor?: number },
  input: {
    filter?: StatementTxnFilter;
    locale?: "ar" | "en";
    phone?: string;
    origin?: string;
  },
) {
  const locale = input.locale ?? "ar";
  const filter = (input.filter ?? "full") as StatementTxnFilter;
  const { assertPlanShareFeature } = await import("../services/admin/billing-service");
  await assertPlanShareFeature(db, space.owner_user_id, "whatsapp", user.id);

  const spaceRow = await db.prepare("SELECT id,name_ar,name_en,currency,balance_minor FROM spaces WHERE id=?")
    .bind(space.id)
    .first<{ id: string; name_ar: string; name_en: string; currency: string; balance_minor: number }>();
  if (!spaceRow) throw new ApiError(404, "WALLET_NOT_FOUND");

  const shareToken = signAssociationStatementToken({
    spaceId: spaceRow.id,
    filter,
    locale,
  });
  const origin = input.origin || "https://wazen.bhd-om.com";
  const shareUrl = `${origin}/s/${encodeURIComponent(shareToken)}`;
  const filterLabel = ({
    full: locale === "ar" ? "الكشف الكامل" : "Full statement",
    valid: locale === "ar" ? "المعاملات الصحيحة" : "Valid transactions",
    voided: locale === "ar" ? "المعاملات المحذوفة" : "Deleted transactions",
    all: locale === "ar" ? "كل المعاملات" : "All transactions",
  })[filter];
  const txnCount = await db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE space_id=?")
    .bind(spaceRow.id).first<{ count: number }>();
  const message = buildAssociationStatementWhatsAppMessage({
    locale,
    walletName: locale === "ar" ? spaceRow.name_ar : spaceRow.name_en,
    filterLabel,
    balanceLabel: formatMoneyMinor(Number(spaceRow.balance_minor) || 0, spaceRow.currency || "OMR", locale),
    movementsLabel: String(Number(txnCount?.count ?? 0)),
    statementUrl: shareUrl,
  });
  const whatsappNumber = input.phone ? toWhatsAppNumber(input.phone) : "";

  await prepareAudit(db, {
    userId: user.id,
    action: "statement.association_share",
    entityType: "space",
    entityId: spaceRow.id,
    metadata: { spaceId: spaceRow.id, filter, locale, via: "api.v1" },
    createdAt: new Date().toISOString(),
  }).run();

  return {
    kind: "association_statement" as const,
    spaceId: spaceRow.id,
    shareUrl,
    whatsappUrl: whatsappShareUrl(whatsappNumber || null, message),
    locale,
    filter,
  };
}
