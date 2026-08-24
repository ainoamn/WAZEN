/** Shared void + ledger rebuild helpers for dashboard and Business API v1. */

import { prepareAudit } from "./audit";
import { ApiError } from "./security";

export async function reconcileMemberLedgers(db: D1Database, spaceIds: string[]) {
  if (!spaceIds.length) return;
  const placeholders = spaceIds.map(() => "?").join(",");
  await db
    .prepare(
      `UPDATE members SET
        paid_minor = COALESCE((
          SELECT SUM(t.amount_minor) FROM transactions t
          WHERE t.member_id = members.id AND t.space_id = members.space_id AND t.status = 'approved'
            AND (
              (t.kind = 'contribution' AND t.allocation IN ('mandatory', 'general', 'advance'))
              OR (t.kind = 'income' AND t.allocation IN ('mandatory', 'general', 'advance'))
            )
        ), 0),
        extra_minor = COALESCE((
          SELECT SUM(
            CASE
              WHEN t.kind = 'contribution' AND t.allocation = 'personal_reserve' THEN t.amount_minor
              WHEN t.kind = 'reimbursement' AND t.allocation = 'personal_reserve' THEN -t.amount_minor
              ELSE 0
            END
          ) FROM transactions t
          WHERE t.member_id = members.id AND t.space_id = members.space_id AND t.status = 'approved'
        ), 0),
        addon_minor = COALESCE((
          SELECT SUM(t.amount_minor) FROM transactions t
          WHERE t.member_id = members.id AND t.space_id = members.space_id AND t.status = 'approved'
            AND t.allocation = 'extra'
            AND (
              t.kind = 'expense'
              OR (t.kind = 'income' AND t.description_ar = 'تسوية حصة مصروف للصندوق')
            )
        ), 0)
       WHERE space_id IN (${placeholders})`,
    )
    .bind(...spaceIds)
    .run();
}

export async function writeApprovedCashBalance(db: D1Database, spaceId: string) {
  const row = await db.prepare(`SELECT COALESCE(SUM(CASE
    WHEN COALESCE(allocation,'general') = 'personal_reserve' THEN 0
    WHEN kind IN ('income','contribution') THEN amount_minor
    WHEN kind = 'expense' THEN -amount_minor
    ELSE 0
  END), 0) AS balance FROM transactions WHERE space_id=? AND status='approved'`).bind(spaceId).first<{ balance: number }>();
  await db.prepare("UPDATE spaces SET balance_minor=? WHERE id=?").bind(Number(row?.balance ?? 0), spaceId).run();
}

export type VoidableTransaction = {
  id: string;
  space_id: string;
  member_id: string | null;
  kind: string;
  allocation: string;
  amount_minor: number;
  status: string;
  occurred_at?: string;
  description_ar?: string;
};

export async function voidApprovedTransaction(
  db: D1Database,
  txn: VoidableTransaction,
  actorUserId: string,
  options?: { recordStatus?: "voided" | "superseded"; closeOccurrence?: boolean; via?: string },
) {
  if (txn.status === "voided" || txn.status === "superseded") throw new ApiError(409, "ALREADY_VOIDED");
  if (txn.status !== "approved") throw new ApiError(409, "TRANSACTION_NOT_EDITABLE");
  const recordStatus = options?.recordStatus ?? "voided";
  const closeOccurrence = options?.closeOccurrence !== false;
  const amountMinor = Number(txn.amount_minor);
  const createdAt = new Date().toISOString();
  const voided = await db.prepare("UPDATE transactions SET status=? WHERE id=? AND status='approved'").bind(recordStatus, txn.id).run();
  if (!voided.meta.changes) throw new ApiError(409, "ALREADY_VOIDED");
  if (txn.allocation === "extra" && txn.occurred_at) {
    try {
      await db.prepare(`UPDATE transactions SET status=?
        WHERE space_id=? AND allocation='extra' AND amount_minor=? AND occurred_at=? AND status='approved' AND id<>?`)
        .bind(recordStatus, txn.space_id, amountMinor, txn.occurred_at, txn.id)
        .run();
      if (txn.member_id) {
        await db.prepare(`UPDATE settlements SET status='pending', settled_at=NULL
          WHERE space_id=? AND status='settled' AND amount_minor=?
            AND (from_member_id=? OR to_member_id=?)
            AND settled_at=?`)
          .bind(txn.space_id, amountMinor, txn.member_id, txn.member_id, txn.occurred_at)
          .run();
      }
    } catch { /* best-effort */ }
  }
  const statements: D1PreparedStatement[] = [
    prepareAudit(db, {
      userId: actorUserId,
      action: "transaction.voided",
      entityType: "transaction",
      entityId: txn.id,
      metadata: {
        spaceId: txn.space_id,
        kind: txn.kind,
        allocation: txn.allocation,
        amountMinor,
        via: options?.via ?? "dashboard",
      },
      createdAt,
    }),
  ];
  try {
    statements.push(db.prepare("UPDATE trip_expenses SET status='voided' WHERE transaction_id=?").bind(txn.id));
  } catch { /* optional */ }
  try {
    if (closeOccurrence) {
      const postedOccurrence = await db.prepare(`SELECT o.id, o.rule_id, o.actual_minor, r.kind
        FROM personal_occurrences o JOIN personal_rules r ON r.id=o.rule_id
        WHERE o.transaction_id=?`)
        .bind(txn.id)
        .first<{ id: string; rule_id: string; actual_minor: number | null; kind: string }>();
      const occurrence = postedOccurrence ?? await db.prepare(`SELECT o.id, o.rule_id, o.actual_minor, r.kind
        FROM personal_occurrences o JOIN personal_rules r ON r.id=o.rule_id
        WHERE o.space_id=? AND o.status='posted' AND COALESCE(o.actual_minor, o.expected_minor)=?`)
        .bind(txn.space_id, amountMinor)
        .first<{ id: string; rule_id: string; actual_minor: number | null; kind: string }>();
      if (occurrence) {
        const postedMinor = Number(occurrence.actual_minor ?? txn.amount_minor);
        statements.push(db.prepare("UPDATE personal_occurrences SET status='pending', actual_minor=NULL, transaction_id=NULL WHERE id=?").bind(occurrence.id));
        if (occurrence.kind === "expense") {
          statements.push(db.prepare("UPDATE personal_rules SET paid_minor = MAX(0, paid_minor - ?) WHERE id=?").bind(postedMinor, occurrence.rule_id));
        }
      }
    }
  } catch { /* best-effort */ }
  try {
    await db.batch(statements);
  } catch { /* audit must not block void */ }
  try {
    await writeApprovedCashBalance(db, txn.space_id);
  } catch { /* best-effort */ }
  try {
    await reconcileMemberLedgers(db, [txn.space_id]);
  } catch { /* best-effort */ }
}
