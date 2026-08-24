/** Business API v1 — wallet summary KPIs. */

import { formatMoneyMinor } from "./money";

export async function buildV1SpaceSummary(
  db: D1Database,
  space: { id: string; type: string; currency: string; balance_minor: number },
) {
  const currency = space.currency || "OMR";
  const members = await db.prepare(`
    SELECT id, display_name, due_minor, paid_minor, extra_minor, status
    FROM members WHERE space_id=? AND status='active'
  `).bind(space.id).all<{
    id: string; display_name: string; due_minor: number; paid_minor: number; extra_minor: number; status: string;
  }>();
  const rows = members.results ?? [];
  let dueTotal = 0;
  let paidTotal = 0;
  let extraTotal = 0;
  let overdueCount = 0;
  for (const member of rows) {
    const due = Number(member.due_minor) || 0;
    const paid = Number(member.paid_minor) || 0;
    const extra = Number(member.extra_minor) || 0;
    dueTotal += due;
    paidTotal += paid;
    extraTotal += extra;
    if (due > paid) overdueCount += 1;
  }
  const balanceMinor = Number(space.balance_minor) || 0;
  const cashOnHandMinor = balanceMinor + extraTotal;
  return {
    spaceId: space.id,
    type: space.type,
    currency,
    balanceMinor,
    balanceLabel: formatMoneyMinor(balanceMinor, currency, "en"),
    personalReserveTotalMinor: extraTotal,
    personalReserveTotalLabel: formatMoneyMinor(extraTotal, currency, "en"),
    cashOnHandMinor,
    cashOnHandLabel: formatMoneyMinor(cashOnHandMinor, currency, "en"),
    dueTotalMinor: dueTotal,
    dueTotalLabel: formatMoneyMinor(dueTotal, currency, "en"),
    paidTotalMinor: paidTotal,
    paidTotalLabel: formatMoneyMinor(paidTotal, currency, "en"),
    remainingDueMinor: Math.max(0, dueTotal - paidTotal),
    remainingDueLabel: formatMoneyMinor(Math.max(0, dueTotal - paidTotal), currency, "en"),
    memberCount: rows.length,
    overdueMemberCount: overdueCount,
  };
}
