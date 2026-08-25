/** Business API v1 — member live ledger. */

import { buildMemberLedger, filterMemberLedgerLines, type MemberLedgerFocus } from "./member-ledger";
import { ApiError } from "./security";

export async function getV1MemberLedger(
  db: D1Database,
  spaceId: string,
  memberId: string,
  focus: MemberLedgerFocus = "all",
) {
  const space = await db.prepare(
    "SELECT id, name_ar, name_en, currency FROM spaces WHERE id=? LIMIT 1",
  ).bind(spaceId).first<{ id: string; name_ar: string; name_en: string; currency: string }>();
  if (!space) throw new ApiError(404, "WALLET_NOT_FOUND");

  const member = await db.prepare(`
    SELECT id, space_id, display_name, email, phone, role, status, due_minor, paid_minor, extra_minor, addon_minor, avatar, joined_at
    FROM members WHERE id=? AND space_id=? LIMIT 1
  `).bind(memberId, space.id).first<{
    id: string; space_id: string; display_name: string; email: string | null; phone: string | null;
    role: string; status: string | null; due_minor: number; paid_minor: number; extra_minor: number;
    addon_minor: number | null; avatar: string; joined_at: string | null;
  }>();
  if (!member) throw new ApiError(404, "MEMBER_NOT_FOUND");

  const [plan, installments, transactions, settlements, tripExpenses, expenseSplits] = await Promise.all([
    db.prepare("SELECT space_id, amount_minor, duration_months, starts_at FROM contribution_plans WHERE space_id=? LIMIT 1")
      .bind(space.id)
      .first<{ space_id: string; amount_minor: number; duration_months: number; starts_at: string }>(),
    db.prepare("SELECT * FROM member_installments WHERE member_id=? AND space_id=? ORDER BY period_index")
      .bind(memberId, space.id).all(),
    db.prepare("SELECT * FROM transactions WHERE space_id=? ORDER BY occurred_at DESC LIMIT 250")
      .bind(space.id).all(),
    db.prepare("SELECT * FROM settlements WHERE space_id=?").bind(space.id).all(),
    db.prepare(`SELECT te.id, te.space_id, te.paid_by_member_id, te.amount_minor, te.description, te.occurred_at,
        COALESCE(m.display_name, '') AS paid_by_name
      FROM trip_expenses te
      LEFT JOIN members m ON m.id=te.paid_by_member_id
      WHERE te.space_id=? AND COALESCE(te.status,'posted')<>'voided'`)
      .bind(space.id).all(),
    db.prepare(`SELECT es.expense_id, es.member_id, es.share_minor
      FROM expense_splits es
      JOIN trip_expenses te ON te.id=es.expense_id
      WHERE te.space_id=? AND COALESCE(te.status,'posted')<>'voided'`)
      .bind(space.id).all(),
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

  return {
    member: {
      id: member.id,
      displayName: member.display_name,
      email: member.email,
      phone: member.phone,
      role: member.role,
      status: member.status,
      dueMinor: Number(member.due_minor),
      paidMinor: Number(member.paid_minor),
      extraMinor: Number(member.extra_minor),
      addonMinor: Number(member.addon_minor ?? 0),
    },
    focus,
    paidMinor: ledger.paidMinor,
    spentMinor: ledger.spentMinor,
    owesMinor: ledger.owesMinor,
    creditMinor: ledger.creditMinor,
    goalMinor: ledger.goalMinor,
    months: ledger.months,
    lines: filterMemberLedgerLines(ledger.lines, focus),
  };
}
