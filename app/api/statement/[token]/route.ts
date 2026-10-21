import { ensureSchema, getRawDb } from "../../../../db/runtime";
import {
  verifyAnyStatementToken,
  type AssociationStatementSharePayload,
  type MemberStatementSharePayload,
} from "../../../../lib/statement-share";
import type { MemberLedgerFocus } from "../../../../lib/member-ledger";
import { loadMemberStatementSection } from "../../../../lib/member-statement-data";
import { buildAccountStatementModel, type StatementTxnFilter } from "../../../../lib/account-statement";
import { formatDebitMoneyMinor, formatMoneyMinor } from "../../../../lib/money";
import { accruedDueMinor } from "../../../../lib/installments";
import { parseSpaceStatementCopy, resolveStatementIntro } from "../../../../lib/statement-copy";

export const runtime = "nodejs";

async function memberStatementJson(payload: MemberStatementSharePayload) {
  const db = await getRawDb();
  await ensureSchema(db);
  const locale = payload.locale;
  const focus = payload.focus as MemberLedgerFocus;
  const ids = payload.memberIds?.length ? payload.memberIds : [payload.memberId];
  const sections = [];
  for (const id of ids) {
    const section = await loadMemberStatementSection(db, id, id === payload.memberId ? payload.spaceId : undefined, locale, focus);
    if (section) sections.push(section);
  }
  if (!sections.length) return null;
  const first = sections[0];
  const focusLabel = ({
    all: locale === "ar" ? "الكل" : "All",
    paid: locale === "ar" ? "المدفوع" : "Paid",
    spent: locale === "ar" ? "الصرف" : "Spent",
    owes: locale === "ar" ? "عليه" : "Owes",
    credit: locale === "ar" ? "له" : "Credit",
  })[focus];
  const combined = sections.length > 1;
  const sameCurrency = sections.every((item) => item.currency === first.currency);
  const paidMinor = sections.reduce((sum, item) => sum + item.paidMinor, 0);
  const spentMinor = sections.reduce((sum, item) => sum + item.spentMinor, 0);
  const owesMinor = sections.reduce((sum, item) => sum + item.owesMinor, 0);
  const creditMinor = sections.reduce((sum, item) => sum + item.creditMinor, 0);
  const money = (minor: number) => formatMoneyMinor(minor, first.currency, locale);
  const debit = (minor: number) => formatDebitMoneyMinor(minor, first.currency, locale);
  return {
    kind: "member_statement" as const,
    combined,
    locale,
    focus,
    focusLabel,
    title: combined
      ? (locale === "ar" ? "كشف كامل لكل الجمعيات" : "Full statement for every association")
      : (locale === "ar" ? "كشف حساب وازن" : "WAZEN statement"),
    memberName: first.member.display_name,
    walletName: combined ? (locale === "ar" ? "كل الجمعيات" : "All associations") : first.walletName,
    phone: sections.map((item) => item.member.phone).find(Boolean) ?? first.member.phone,
    email: sections.map((item) => item.member.email).find(Boolean) ?? first.member.email,
    joinedAt: first.member.joined_at,
    currency: first.currency,
    paidLabel: sameCurrency ? money(paidMinor) : first.paidLabel,
    spentLabel: sameCurrency ? debit(spentMinor) : first.spentLabel,
    owesLabel: sameCurrency ? debit(owesMinor) : first.owesLabel,
    creditLabel: sameCurrency ? money(creditMinor) : first.creditLabel,
    payInstruction: first.payInstruction,
    paidMinor: sameCurrency ? paidMinor : first.paidMinor,
    spentMinor: sameCurrency ? spentMinor : first.spentMinor,
    fundSpentMinor: combined ? 0 : first.fundSpentMinor,
    pocketSpentMinor: combined ? 0 : first.pocketSpentMinor,
    pocketPaidMinor: combined ? 0 : first.pocketPaidMinor,
    owesMinor: sameCurrency ? owesMinor : first.owesMinor,
    creditMinor: sameCurrency ? creditMinor : first.creditMinor,
    lines: combined ? first.lines : first.lines,
    sections: sections.map((item) => ({
      walletName: item.walletName,
      currency: item.currency,
      joinedAt: item.member.joined_at,
      paidLabel: item.paidLabel,
      spentLabel: item.spentLabel,
      owesLabel: item.owesLabel,
      creditLabel: item.creditLabel,
      payInstruction: item.payInstruction,
      paidMinor: item.paidMinor,
      spentMinor: item.spentMinor,
      fundSpentMinor: item.fundSpentMinor,
      pocketSpentMinor: item.pocketSpentMinor,
      pocketPaidMinor: item.pocketPaidMinor,
      owesMinor: item.owesMinor,
      creditMinor: item.creditMinor,
      lines: item.lines,
    })),
  };
}

async function associationStatementJson(payload: AssociationStatementSharePayload) {
  const db = await getRawDb();
  await ensureSchema(db);

  const space = await db.prepare(`
    SELECT id, name_ar, name_en, type, currency, balance_minor, statement_copy_json FROM spaces WHERE id=? LIMIT 1
  `).bind(payload.spaceId).first<{
    id: string;
    name_ar: string;
    name_en: string;
    type: string;
    currency: string;
    balance_minor: number;
    statement_copy_json?: string | null;
  }>();
  if (!space) return null;

  const sheetKind = payload.sheetKind ?? "movements";
  const [members, transactions, roster, installmentRows, holdings] = await Promise.all([
    db.prepare("SELECT id, space_id, display_name FROM members WHERE space_id=?")
      .bind(payload.spaceId)
      .all<{ id: string; space_id: string; display_name: string }>(),
    db.prepare("SELECT * FROM transactions WHERE space_id=? ORDER BY occurred_at ASC LIMIT 500")
      .bind(payload.spaceId)
      .all(),
    db.prepare(
      `SELECT id, display_name, due_minor, paid_minor, status, COALESCE(dues_exempt,0) AS dues_exempt
       FROM members WHERE space_id=? AND status='active' ORDER BY display_name`,
    ).bind(payload.spaceId).all<{
      id: string;
      display_name: string;
      due_minor: number;
      paid_minor: number;
      status: string;
      dues_exempt: number;
    }>(),
    db.prepare(
      `SELECT member_id, id, period_index, period_key, due_at, amount_minor, paid_minor, status
       FROM member_installments WHERE space_id=? ORDER BY member_id, period_index`,
    ).bind(payload.spaceId).all<{
      member_id: string;
      id: string;
      period_index: number;
      period_key: string;
      due_at: string | null;
      amount_minor: number;
      paid_minor: number;
      status: string;
    }>(),
    db.prepare(
      `SELECT id, space_id, name, kind, amount_minor, matures_at, expected_return_minor, status
       FROM space_holdings WHERE space_id=? AND status='active'`,
    ).bind(payload.spaceId).all<{
      id: string;
      space_id: string;
      name: string;
      kind: string;
      amount_minor: number;
      matures_at: string | null;
      expected_return_minor: number;
      status: string;
    }>().catch(() => ({ results: [] as Array<{
      id: string;
      space_id: string;
      name: string;
      kind: string;
      amount_minor: number;
      matures_at: string | null;
      expected_return_minor: number;
      status: string;
    }> })),
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
    holdings: holdings.results ?? [],
  });
  const money = (minor: number) => formatMoneyMinor(minor, model.currency, locale);
  const debit = (minor: number) => formatDebitMoneyMinor(minor, model.currency, locale);

  const installmentsByMember = new Map<string, Array<{
    id: string;
    period_index: number;
    period_key: string;
    amount_minor: number;
    paid_minor: number;
    status: string;
    due_at?: string;
  }>>();
  for (const row of installmentRows.results ?? []) {
    const list = installmentsByMember.get(row.member_id) ?? [];
    list.push({
      id: row.id,
      period_index: row.period_index,
      period_key: row.period_key,
      amount_minor: Number(row.amount_minor) || 0,
      paid_minor: Number(row.paid_minor) || 0,
      status: row.status,
      due_at: row.due_at ? String(row.due_at) : undefined,
    });
    installmentsByMember.set(row.member_id, list);
  }

  let memberRows = (roster.results ?? []).map((row) => {
    const paid = Number(row.paid_minor) || 0;
    const exempt = Number(row.dues_exempt) > 0;
    const months = installmentsByMember.get(row.id) ?? [];
    const accrued = months.length ? accruedDueMinor(months) : Number(row.due_minor) || 0;
    const owes = exempt ? 0 : Math.max(0, accrued - paid);
    return {
      id: row.id,
      display_name: row.display_name,
      paid_minor: paid,
      owes_minor: owes,
      paidLabel: money(paid),
      owesLabel: owes > 0 ? debit(owes) : money(0),
      status: row.status ?? "active",
    };
  });
  if (sheetKind === "dues_paid") memberRows = memberRows.filter((row) => row.paid_minor > 0);
  if (sheetKind === "dues_owing") memberRows = memberRows.filter((row) => row.owes_minor > 0);

  const sheetTitles = {
    movements: { ar: "كشف حساب كامل وعام", en: "Full general account statement" },
    dues: { ar: "كشف المتأخرات حتى نهاية الشهر الحالي", en: "Arrears statement to current month" },
    dues_paid: { ar: "كشف المسدّدين", en: "Payers statement" },
    dues_owing: { ar: "كشف المترتبة عليهم مبالغ", en: "Owing members statement" },
  } as const;
  const title = locale === "ar" ? sheetTitles[sheetKind].ar : sheetTitles[sheetKind].en;
  const subtitle = resolveStatementIntro(
    parseSpaceStatementCopy(space.statement_copy_json),
    locale,
    sheetKind,
    model.entityName,
  );

  return {
    kind: "association_statement" as const,
    locale,
    filter,
    sheetKind,
    filterLabel: title,
    title,
    subtitle,
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
    cashMinor: model.closingMinor,
    cashLabel: money(model.closingMinor),
    holdingsMinor: model.holdingsMinor,
    holdingsLabel: money(model.holdingsMinor),
    availableMinor: model.availableMinor,
    availableLabel: money(model.availableMinor),
    expenseMinor: model.expenseMinor,
    expenseLabel: money(model.expenseMinor),
    members: memberRows,
    lines: sheetKind === "movements"
      ? model.lines.map((line) => ({
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
      }))
      : [],
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
