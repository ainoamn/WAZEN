import { ensureSchema, getRawDb } from "../../../../db/runtime";
import {
  verifyAnyStatementToken,
  type AssociationStatementSharePayload,
  type MemberStatementSharePayload,
} from "../../../../lib/statement-share";
import type { MemberLedgerFocus } from "../../../../lib/member-ledger";
import { loadMemberStatementSection } from "../../../../lib/member-statement-data";
import { buildAccountStatementModel, type StatementTxnFilter } from "../../../../lib/account-statement";
import { formatMoneyMinor } from "../../../../lib/money";

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
    spentLabel: sameCurrency ? money(spentMinor) : first.spentLabel,
    owesLabel: sameCurrency ? money(owesMinor) : first.owesLabel,
    creditLabel: sameCurrency ? money(creditMinor) : first.creditLabel,
    paidMinor: sameCurrency ? paidMinor : first.paidMinor,
    spentMinor: sameCurrency ? spentMinor : first.spentMinor,
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
      paidMinor: item.paidMinor,
      spentMinor: item.spentMinor,
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
