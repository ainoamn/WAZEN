/** Business API v1 — list trip/group expenses. */

import { formatMoneyMinor } from "./money";

export async function listV1Expenses(
  db: D1Database,
  space: { id: string; currency: string },
  options?: { limit?: number },
) {
  const limit = Math.min(200, Math.max(1, options?.limit ?? 50));
  const currency = space.currency || "OMR";
  let rows: {
    results: Array<{
      id: string; paid_by_member_id: string; amount_minor: number; description: string;
      occurred_at: string; status?: string | null; paid_from?: string | null; transaction_id?: string | null; created_at: string;
    }>;
  };
  try {
    rows = await db.prepare(`
      SELECT id, paid_by_member_id, amount_minor, description, occurred_at, status, paid_from, transaction_id, created_at
      FROM trip_expenses WHERE space_id=? AND COALESCE(status,'posted')<>'voided'
      ORDER BY occurred_at DESC LIMIT ?
    `).bind(space.id, limit).all();
  } catch {
    rows = await db.prepare(`
      SELECT id, paid_by_member_id, amount_minor, description, occurred_at, created_at
      FROM trip_expenses WHERE space_id=?
      ORDER BY occurred_at DESC LIMIT ?
    `).bind(space.id, limit).all();
  }

  return (rows.results ?? []).map((row) => ({
    id: row.id,
    paidByMemberId: row.paid_by_member_id,
    amountMinor: Number(row.amount_minor) || 0,
    amountLabel: formatMoneyMinor(Number(row.amount_minor) || 0, currency, "en"),
    description: row.description,
    occurredAt: row.occurred_at,
    status: row.status ?? "posted",
    paidFrom: row.paid_from ?? null,
    transactionId: row.transaction_id ?? null,
    createdAt: row.created_at,
  }));
}
