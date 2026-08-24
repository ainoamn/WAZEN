/** Business API v1 — installment schedule for a wallet. */

import { formatMoneyMinor } from "./money";

export async function listV1Installments(
  db: D1Database,
  space: { id: string; currency: string },
  options?: { memberId?: string; limit?: number },
) {
  const limit = Math.min(500, Math.max(1, options?.limit ?? 200));
  const currency = space.currency || "OMR";
  const rows = options?.memberId
    ? await db.prepare(`
        SELECT id, member_id, period_index, period_key, due_at, amount_minor, paid_minor, status, created_at
        FROM member_installments WHERE space_id=? AND member_id=?
        ORDER BY period_index ASC LIMIT ?
      `).bind(space.id, options.memberId, limit).all<{
        id: string; member_id: string; period_index: number; period_key: string; due_at: string;
        amount_minor: number; paid_minor: number; status: string; created_at: string;
      }>()
    : await db.prepare(`
        SELECT id, member_id, period_index, period_key, due_at, amount_minor, paid_minor, status, created_at
        FROM member_installments WHERE space_id=?
        ORDER BY due_at ASC, period_index ASC LIMIT ?
      `).bind(space.id, limit).all<{
        id: string; member_id: string; period_index: number; period_key: string; due_at: string;
        amount_minor: number; paid_minor: number; status: string; created_at: string;
      }>();

  return (rows.results ?? []).map((row) => ({
    id: row.id,
    memberId: row.member_id,
    periodIndex: Number(row.period_index) || 0,
    periodKey: row.period_key,
    dueAt: row.due_at,
    amountMinor: Number(row.amount_minor) || 0,
    amountLabel: formatMoneyMinor(Number(row.amount_minor) || 0, currency, "en"),
    paidMinor: Number(row.paid_minor) || 0,
    paidLabel: formatMoneyMinor(Number(row.paid_minor) || 0, currency, "en"),
    status: row.status,
    createdAt: row.created_at,
  }));
}
