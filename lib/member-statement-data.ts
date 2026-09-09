/** Shared member-statement ledger load so WhatsApp, print, and /s links use the same numbers. */

import { buildMemberLedger, filterMemberLedgerLines, type MemberLedgerFocus } from "./member-ledger.ts";
import { formatMoneyMinor } from "./money.ts";

export type StatementMemberRow = {
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
};

export type MemberStatementSection = {
  member: StatementMemberRow;
  space: { id: string; name_ar: string; name_en: string; type: string; currency: string };
  ledger: ReturnType<typeof buildMemberLedger>;
  lines: ReturnType<typeof filterMemberLedgerLines>;
  walletName: string;
  currency: string;
  paidLabel: string;
  spentLabel: string;
  owesLabel: string;
  creditLabel: string;
  paidMinor: number;
  spentMinor: number;
  owesMinor: number;
  creditMinor: number;
};

export async function loadMemberStatementSection(
  db: D1Database,
  memberId: string,
  spaceId: string | undefined,
  locale: "ar" | "en",
  focus: MemberLedgerFocus,
): Promise<MemberStatementSection | null> {
  const member = spaceId
    ? await db.prepare(`
        SELECT id, space_id, display_name, email, phone, role, status, due_minor, paid_minor, extra_minor, addon_minor, avatar, joined_at
        FROM members WHERE id=? AND space_id=? LIMIT 1
      `).bind(memberId, spaceId).first<StatementMemberRow>()
    : await db.prepare(`
        SELECT id, space_id, display_name, email, phone, role, status, due_minor, paid_minor, extra_minor, addon_minor, avatar, joined_at
        FROM members WHERE id=? LIMIT 1
      `).bind(memberId).first<StatementMemberRow>();
  if (!member) return null;

  const space = await db.prepare(`
    SELECT id, name_ar, name_en, type, currency FROM spaces WHERE id=? LIMIT 1
  `).bind(member.space_id).first<{ id: string; name_ar: string; name_en: string; type: string; currency: string }>();
  if (!space) return null;

  const [plan, installments, transactions, settlements, tripExpenses, expenseSplits] = await Promise.all([
    db.prepare("SELECT space_id, amount_minor, duration_months, starts_at FROM contribution_plans WHERE space_id=? LIMIT 1")
      .bind(member.space_id)
      .first<{ space_id: string; amount_minor: number; duration_months: number; starts_at: string }>(),
    db.prepare("SELECT * FROM member_installments WHERE member_id=? AND space_id=? ORDER BY period_index")
      .bind(member.id, member.space_id)
      .all(),
    db.prepare("SELECT * FROM transactions WHERE space_id=? ORDER BY occurred_at DESC LIMIT 250")
      .bind(member.space_id)
      .all(),
    db.prepare("SELECT * FROM settlements WHERE space_id=?")
      .bind(member.space_id)
      .all(),
    db.prepare(`SELECT te.id, te.space_id, te.paid_by_member_id, te.amount_minor, te.description, te.occurred_at,
        COALESCE(m.display_name, '') AS paid_by_name, te.paid_from
      FROM trip_expenses te
      LEFT JOIN members m ON m.id=te.paid_by_member_id
      WHERE te.space_id=? AND COALESCE(te.status,'posted')<>'voided'`)
      .bind(member.space_id)
      .all(),
    db.prepare(`SELECT es.expense_id, es.member_id, es.share_minor
      FROM expense_splits es
      JOIN trip_expenses te ON te.id=es.expense_id
      WHERE te.space_id=? AND COALESCE(te.status,'posted')<>'voided'`)
      .bind(member.space_id)
      .all(),
  ]);

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
  const money = (minor: number) => formatMoneyMinor(minor, space.currency || "OMR", locale);
  const lines = filterMemberLedgerLines(ledger.lines, focus);
  return {
    member,
    space,
    ledger,
    lines,
    walletName: locale === "ar" ? space.name_ar : space.name_en,
    currency: space.currency || "OMR",
    paidLabel: money(ledger.paidMinor),
    spentLabel: money(ledger.addonMinor),
    owesLabel: money(ledger.owesMinor),
    creditLabel: money(ledger.creditMinor),
    paidMinor: ledger.paidMinor,
    spentMinor: ledger.addonMinor,
    owesMinor: ledger.owesMinor,
    creditMinor: ledger.creditMinor,
  };
}
