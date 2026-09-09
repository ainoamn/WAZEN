/** Rebuild trip/household member settlements from net balances across every pocket-paid expense. */

import { applySettledTransfers, minimizeSettlements, netTripMemberBalances } from "./finance.ts";
import { prepareAudit } from "./audit.ts";

export async function rebuildSpaceTripSettlements(db: D1Database, spaceId: string, userId?: string) {
  const [members, expenses, splits, settled] = await Promise.all([
    db.prepare("SELECT id FROM members WHERE space_id=? AND status='active' ORDER BY joined_at")
      .bind(spaceId)
      .all<{ id: string }>(),
    db.prepare(`SELECT te.id, te.paid_by_member_id, te.amount_minor,
        COALESCE(te.paid_from, CASE WHEN t.kind='expense' THEN 'common_fund' ELSE 'member' END) AS paid_from
      FROM trip_expenses te
      LEFT JOIN transactions t ON t.id=te.transaction_id
      WHERE te.space_id=? AND COALESCE(te.status,'posted')<>'voided'`)
      .bind(spaceId)
      .all<{ id: string; paid_by_member_id: string; amount_minor: number; paid_from: string | null }>(),
    db.prepare(`SELECT es.expense_id, es.member_id, es.share_minor
      FROM expense_splits es
      JOIN trip_expenses te ON te.id=es.expense_id
      WHERE te.space_id=? AND COALESCE(te.status,'posted')<>'voided'`)
      .bind(spaceId)
      .all<{ expense_id: string; member_id: string; share_minor: number }>(),
    db.prepare(`SELECT from_member_id, to_member_id, amount_minor
      FROM settlements
      WHERE space_id=? AND status='settled'
        AND from_member_id NOT LIKE 'space:%'
        AND to_member_id NOT LIKE 'space:%'`)
      .bind(spaceId)
      .all<{ from_member_id: string; to_member_id: string; amount_minor: number }>(),
  ]);

  const memberIds = (members.results ?? []).map((row) => row.id);
  const remaining = applySettledTransfers(
    netTripMemberBalances({
      memberIds,
      expenses: expenses.results ?? [],
      splits: splits.results ?? [],
    }),
    (settled.results ?? []).map((row) => ({
      fromMemberId: row.from_member_id,
      toMemberId: row.to_member_id,
      amountMinor: Number(row.amount_minor) || 0,
    })),
  );
  const nets = minimizeSettlements(remaining);
  const createdAt = new Date().toISOString();
  const statements: ReturnType<D1Database["prepare"]>[] = [
    db.prepare(`UPDATE settlements SET status='voided'
      WHERE space_id=? AND status='pending'
        AND from_member_id NOT LIKE 'space:%'
        AND to_member_id NOT LIKE 'space:%'`).bind(spaceId),
  ];
  for (const settlement of nets) {
    statements.push(
      db.prepare("INSERT INTO settlements (id,space_id,from_member_id,to_member_id,amount_minor,status,created_at,expense_id) VALUES (?,?,?,?,?,'pending',?,NULL)")
        .bind(crypto.randomUUID(), spaceId, settlement.fromMemberId, settlement.toMemberId, settlement.amountMinor, createdAt),
    );
  }
  if (userId) {
    statements.push(prepareAudit(db, {
      userId,
      action: "trip.settlements_netted",
      entityType: "space",
      entityId: spaceId,
      metadata: { settlementCount: nets.length },
      createdAt,
    }));
  }
  await db.batch(statements);
  return { settlementCount: nets.length };
}
