import { ensureSchema, getRawDb } from "../../../../db/runtime";
import {
  verifyAnyStatementToken,
  type AssociationStatementSharePayload,
  type MemberStatementSharePayload,
} from "../../../../lib/statement-share";
import { buildMemberLedger, filterMemberLedgerLines, type MemberLedgerFocus } from "../../../../lib/member-ledger";
import { buildAccountStatementModel, type StatementTxnFilter } from "../../../../lib/account-statement";
import { formatMoneyMinor } from "../../../../lib/money";

export const runtime = "nodejs";

async function memberStatementJson(payload: MemberStatementSharePayload) {
  const db = await getRawDb();
  await ensureSchema(db);

  const member = await db.prepare(`
    SELECT id, space_id, display_name, email, phone, role, status, due_minor, paid_minor, extra_minor, addon_minor, avatar, joined_at
    FROM members WHERE id=? AND space_id=? LIMIT 1
  `).bind(payload.memberId, payload.spaceId).first<{
    id: string;
    space_id: string;
    display_name: string;
    email: string | null;
    phone: string | null;
    role: string;
    status: string | null;
    due_minor: number;
    paid_minor: number;
    extra_minor: number;
    addon_minor: number | null;
    avatar: string;
    joined_at: string | null;
  }>();
  if (!member) return null;

  const space = await db.prepare(`
    SELECT id, name_ar, name_en, type, currency FROM spaces WHERE id=? LIMIT 1
  `).bind(payload.spaceId).first<{ id: string; name_ar: string; name_en: string; type: string; currency: string }>();
  if (!space) return null;

  const [plan, installments, transactions, settlements, tripExpenses, expenseSplits] = await Promise.all([
    db.prepare("SELECT space_id, amount_minor, duration_months, starts_at FROM contribution_plans WHERE space_id=? LIMIT 1")
      .bind(payload.spaceId)
      .first<{ space_id: string; amount_minor: number; duration_months: number; starts_at: string }>(),
    db.prepare("SELECT * FROM member_installments WHERE member_id=? AND space_id=? ORDER BY period_index")
      .bind(payload.memberId, payload.spaceId)
      .all(),
    db.prepare("SELECT * FROM transactions WHERE space_id=? ORDER BY occurred_at DESC LIMIT 250")
      .bind(payload.spaceId)
      .all(),
    db.prepare("SELECT * FROM settlements WHERE space_id=?")
      .bind(payload.spaceId)
      .all(),
    db.prepare(`SELECT te.id, te.space_id, te.paid_by_member_id, te.amount_minor, te.description, te.occurred_at,
        COALESCE(m.display_name, '') AS paid_by_name
      FROM trip_expenses te
      LEFT JOIN members m ON m.id=te.paid_by_member_id
      WHERE te.space_id=? AND COALESCE(te.status,'posted')<>'voided'`)
      .bind(payload.spaceId)
      .all(),
    db.prepare(`SELECT es.expense_id, es.member_id, es.share_minor
      FROM expense_splits es
      JOIN trip_expenses te ON te.id=es.expense_id
      WHERE te.space_id=? AND COALESCE(te.status,'posted')<>'voided'`)
      .bind(payload.spaceId)
      .all(),
  ]);

  const locale = payload.locale;
  const focus = payload.focus as MemberLedgerFocus;
  const ledger = buildMemberLedger({
    member: {
      id: member.id,
      space_id: member.space_id,
      display_name: member.display_name,
      email: member.email,
      phone: member.phone,
      role: member.role,
      due_minor: Number(member.due_minor),
      paid_minor: Number(member.paid_minor),
      extra_minor: Number(member.extra_minor),
      addon_minor: Number(member.addon_minor ?? 0),
      joined_at: member.joined_at ?? undefined,
    },
    spaceNameAr: space.name_ar,
    spaceNameEn: space.name_en,
    currency: space.currency || "OMR",
    plan: plan ?? null,
    installments: (installments.results ?? []) as never[],
    transactions: (transactions.results ?? []) as never[],
    settlements: (settlements.results ?? []) as never[],
    tripExpenses: (tripExpenses.results ?? []) as never[],
    expenseSplits: (expenseSplits.results ?? []) as never[],
  });

  const lines = filterMemberLedgerLines(ledger.lines, focus).map((line) => ({
    at: line.at,
    titleAr: line.titleAr,
    titleEn: line.titleEn,
    detailAr: line.detailAr,
    detailEn: line.detailEn,
    amountMinor: line.amountMinor,
    direction: line.direction,
    focus: line.focus,
  }));

  const money = (minor: number) => formatMoneyMinor(minor, space.currency || "OMR", locale);
  const focusLabel = ({
    all: locale === "ar" ? "الكل" : "All",
    paid: locale === "ar" ? "المدفوع" : "Paid",
    spent: locale === "ar" ? "الصرف" : "Spent",
    owes: locale === "ar" ? "عليه" : "Owes",
    credit: locale === "ar" ? "له" : "Credit",
  })[focus];

  return {
    kind: "member_statement" as const,
    locale,
    focus,
    focusLabel,
    title: locale === "ar" ? "كشف حساب وازن" : "WAZEN statement",
    memberName: member.display_name,
    walletName: locale === "ar" ? space.name_ar : space.name_en,
    phone: member.phone,
    email: member.email,
    joinedAt: member.joined_at,
    currency: space.currency || "OMR",
    paidLabel: money(ledger.paidMinor),
    spentLabel: money(ledger.addonMinor),
    owesLabel: money(ledger.owesMinor),
    creditLabel: money(ledger.creditMinor),
    paidMinor: ledger.paidMinor,
    spentMinor: ledger.addonMinor,
    owesMinor: ledger.owesMinor,
    creditMinor: ledger.creditMinor,
    lines,
  };
}

async function associationStatementJson(payload: AssociationStatementSharePayload) {
  const db = await getRawDb();
  await ensureSchema(db);

  const space = await db.prepare(`
    SELECT id, name_ar, name_en, type, currency, balance_minor FROM spaces WHERE id=? LIMIT 1
  `).bind(payload.spaceId).first<{
    id: string;
    name_ar: string;
    name_en: string;
    type: string;
    currency: string;
    balance_minor: number;
  }>();
  if (!space) return null;

  const [members, transactions] = await Promise.all([
    db.prepare("SELECT id, space_id, display_name FROM members WHERE space_id=?")
      .bind(payload.spaceId)
      .all<{ id: string; space_id: string; display_name: string }>(),
    db.prepare("SELECT * FROM transactions WHERE space_id=? ORDER BY occurred_at ASC LIMIT 500")
      .bind(payload.spaceId)
      .all(),
  ]);

  const locale = payload.locale;
  const filter = payload.filter as StatementTxnFilter;
  const model = buildAccountStatementModel({
    locale,
    issuerName: "WAZEN",
    spaces: [space],
    members: members.results ?? [],
    transactions: (transactions.results ?? []) as never[],
    spaceId: space.id,
    txnFilter: filter,
  });
  const money = (minor: number) => formatMoneyMinor(minor, model.currency, locale);

  return {
    kind: "association_statement" as const,
    locale,
    filter,
    filterLabel: model.title,
    title: model.title,
    subtitle: model.subtitle,
    walletName: model.entityName,
    currency: model.currency,
    openingLabel: money(model.openingMinor),
    closingLabel: money(model.closingMinor),
    totalInLabel: money(model.totalInMinor),
    totalOutLabel: money(model.totalOutMinor),
    openingMinor: model.openingMinor,
    closingMinor: model.closingMinor,
    totalInMinor: model.totalInMinor,
    totalOutMinor: model.totalOutMinor,
    movementCount: model.movementCount,
    lines: model.lines.map((line) => ({
      at: line.at,
      ref: line.ref,
      description: line.description,
      item: line.item,
      flow: line.flow,
      userName: line.userName,
      depositMinor: line.depositMinor,
      withdrawMinor: line.withdrawMinor,
      balanceMinor: line.balanceMinor,
      status: line.status,
      live: line.live,
    })),
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const payload = verifyAnyStatementToken(token);
  if (!payload) {
    return Response.json({ error: "STATEMENT_LINK_INVALID" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const data = payload.kind === "member_statement"
    ? await memberStatementJson(payload)
    : await associationStatementJson(payload);

  if (!data) {
    return Response.json({ error: "STATEMENT_NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  return Response.json(data, {
    headers: { "Cache-Control": "public, max-age=120" },
  });
}
