/** Business API v1 — WhatsApp share links for receipts and statements. */

import type { RequestUser } from "../db/runtime";
import { prepareAudit } from "./audit";
import { ApiError } from "./security";
import { formatDebitMoneyMinor, formatMoneyMinor } from "./money";
import { summarizeAssociationArrears } from "./installments";
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
  const { loadMemberStatementSection } = await import("./member-statement-data");
  const section = await loadMemberStatementSection(db, member.id, member.space_id, locale, focus);
  const message = buildMemberStatementWhatsAppMessage({
    locale,
    memberName: member.display_name,
    walletName: locale === "ar" ? (spaceRow?.name_ar ?? "") : (spaceRow?.name_en ?? ""),
    focusLabel,
    paidLabel: section?.paidLabel ?? money(Number(member.paid_minor) || 0),
    owesLabel: section?.owesLabel ?? money(Math.max(0, Number(member.due_minor) - Number(member.paid_minor))),
    creditLabel: section?.creditLabel ?? money(Number(member.extra_minor) + Number(member.addon_minor ?? 0)),
    statementUrl: shareUrl,
    payInstruction: section?.payInstruction || "",
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

  const sheetKind = "movements" as const;
  const shareToken = signAssociationStatementToken({
    spaceId: spaceRow.id,
    filter,
    locale,
    sheetKind,
  });
  const origin = input.origin || "https://wazen.bhd-om.com";
  const shareUrl = `${origin}/s/${encodeURIComponent(shareToken)}`;
  const currency = spaceRow.currency || "OMR";
  const [txnCount, expenseRow, holdingsRow, membersRoster, installmentRoster] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE space_id=?")
      .bind(spaceRow.id).first<{ count: number }>(),
    db.prepare(
      "SELECT COALESCE(SUM(amount_minor),0) AS total FROM transactions WHERE space_id=? AND status='approved' AND kind='expense'",
    ).bind(spaceRow.id).first<{ total: number }>(),
    db.prepare(
      "SELECT COALESCE(SUM(amount_minor),0) AS total FROM space_holdings WHERE space_id=? AND status='active'",
    ).bind(spaceRow.id).first<{ total: number }>().catch(() => ({ total: 0 })),
    db.prepare(
      `SELECT id, due_minor, paid_minor, COALESCE(dues_exempt,0) AS dues_exempt
       FROM members WHERE space_id=? AND status='active'`,
    ).bind(spaceRow.id).all<{ id: string; due_minor: number; paid_minor: number; dues_exempt: number }>(),
    db.prepare(
      `SELECT member_id, id, period_index, period_key, due_at, amount_minor, paid_minor, status
       FROM member_installments WHERE space_id=?`,
    ).bind(spaceRow.id).all<{
      member_id: string;
      id: string;
      period_index: number;
      period_key: string;
      due_at: string | null;
      amount_minor: number;
      paid_minor: number;
      status: string;
    }>(),
  ]);
  const duesSummary = summarizeAssociationArrears(
    membersRoster.results ?? [],
    (installmentRoster.results ?? []).map((row) => ({ ...row, due_at: row.due_at ?? undefined })),
  );
  const cash = Number(spaceRow.balance_minor) || 0;
  const available = cash + Number(holdingsRow?.total ?? 0);
  const expenses = Number(expenseRow?.total ?? 0);
  const arrears = duesSummary.arrearsMinor;
  const message = buildAssociationStatementWhatsAppMessage({
    locale,
    walletName: locale === "ar" ? spaceRow.name_ar : spaceRow.name_en,
    filterLabel: locale === "ar" ? "كشف كامل وعام" : "Full general statement",
    balanceLabel: formatMoneyMinor(cash, currency, locale),
    movementsLabel: String(Number(txnCount?.count ?? 0)),
    statementUrl: shareUrl,
    sheetKind,
    availableLabel: formatMoneyMinor(available, currency, locale),
    expensesLabel: formatMoneyMinor(expenses, currency, locale),
    arrearsLabel: arrears > 0 ? formatDebitMoneyMinor(arrears, currency, locale) : formatMoneyMinor(0, currency, locale),
    lateMembersLabel: String(duesSummary.lateCount),
    committedMembersLabel: String(duesSummary.committedCount),
  });
  const whatsappNumber = input.phone ? toWhatsAppNumber(input.phone) : "";

  await prepareAudit(db, {
    userId: user.id,
    action: "statement.association_share",
    entityType: "space",
    entityId: spaceRow.id,
    metadata: { spaceId: spaceRow.id, filter, sheetKind, locale, via: "api.v1" },
    createdAt: new Date().toISOString(),
  }).run();

  return {
    kind: "association_statement" as const,
    spaceId: spaceRow.id,
    shareUrl,
    whatsappUrl: whatsappShareUrl(whatsappNumber || null, message),
    locale,
    filter,
    sheetKind,
  };
}
