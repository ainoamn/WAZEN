/** Shared void + ledger rebuild helpers for dashboard and Business API v1. */

import { prepareAudit } from "./audit";
import { ApiError } from "./security";
import { rebuildSpaceTripSettlements } from "./trip-settlements";

/** Member-to-member settlement rows (`postPeerMemberSettlement`) move cash outside the fund: never fund income or «مدفوع». */
const NOT_PEER_TRANSFER_SQL = (alias: string) =>
  `COALESCE(${alias}description_ar,'') NOT LIKE 'تحويل مسجّل:%' AND COALESCE(${alias}description_ar,'') NOT LIKE 'استلام تحويل:%'`;

const PEER_TRANSFER_SQL = (alias: string) =>
  `(COALESCE(${alias}description_ar,'') LIKE 'تحويل مسجّل:%' OR COALESCE(${alias}description_ar,'') LIKE 'استلام تحويل:%')`;

export function isPeerTransferDescription(descriptionAr?: string | null) {
  const text = String(descriptionAr ?? "");
  return text.startsWith("تحويل مسجّل:") || text.startsWith("استلام تحويل:");
}

/**
 * Cancelling either half of a posted member-to-member transfer cancels the whole transfer:
 * the sibling row is voided and the settlement returns to pending so trip balances are re-netted.
 */
async function revertPeerTransfer(db: D1Database, txn: VoidableTransaction, recordStatus: string) {
  if (!txn.occurred_at || !txn.member_id) return;
  const amountMinor = Number(txn.amount_minor);
  await db.prepare(`UPDATE transactions SET status=?
    WHERE space_id=? AND status='approved' AND amount_minor=? AND occurred_at=? AND id<>?
      AND ${PEER_TRANSFER_SQL("")}`)
    .bind(recordStatus, txn.space_id, amountMinor, txn.occurred_at, txn.id)
    .run();
  await db.prepare(`UPDATE settlements SET status='pending', settled_at=NULL
    WHERE space_id=? AND status='settled' AND amount_minor=? AND settled_at=?
      AND (from_member_id=? OR to_member_id=?)
      AND from_member_id NOT LIKE 'space:%' AND to_member_id NOT LIKE 'space:%'`)
    .bind(txn.space_id, amountMinor, txn.occurred_at, txn.member_id, txn.member_id)
    .run();
  await rebuildSpaceTripSettlements(db, txn.space_id);
}

/** Heal transfers voided before `revertPeerTransfer` existed: settlement stuck «settled» while its transfer rows are voided. */
export async function repairVoidedPeerSettlements(db: D1Database, spaceIds: string[]) {
  if (!spaceIds.length) return;
  const placeholders = spaceIds.map(() => "?").join(",");
  const stuck = await db.prepare(`SELECT s.id, s.space_id, s.amount_minor, s.settled_at
    FROM settlements s
    WHERE s.space_id IN (${placeholders})
      AND s.status='settled' AND s.settled_at IS NOT NULL
      AND s.from_member_id NOT LIKE 'space:%' AND s.to_member_id NOT LIKE 'space:%'
      AND EXISTS (
        SELECT 1 FROM transactions t
        WHERE t.space_id=s.space_id AND t.status IN ('voided','superseded')
          AND t.amount_minor=s.amount_minor AND t.occurred_at=s.settled_at
          AND t.member_id IN (s.from_member_id, s.to_member_id)
          AND ${PEER_TRANSFER_SQL("t.")}
      )`).bind(...spaceIds).all<{ id: string; space_id: string; amount_minor: number; settled_at: string }>();
  const touched = new Set<string>();
  for (const row of stuck.results ?? []) {
    await db.prepare(`UPDATE transactions SET status='voided'
      WHERE space_id=? AND status='approved' AND amount_minor=? AND occurred_at=? AND ${PEER_TRANSFER_SQL("")}`)
      .bind(row.space_id, Number(row.amount_minor), row.settled_at)
      .run();
    await db.prepare("UPDATE settlements SET status='pending', settled_at=NULL WHERE id=? AND status='settled'").bind(row.id).run();
    touched.add(row.space_id);
  }
  for (const spaceId of touched) {
    await rebuildSpaceTripSettlements(db, spaceId);
    await writeApprovedCashBalance(db, spaceId);
    await reconcileMemberLedgers(db, [spaceId]);
  }
}

export async function reconcileMemberLedgers(db: D1Database, spaceIds: string[]) {
  if (!spaceIds.length) return;
  const placeholders = spaceIds.map(() => "?").join(",");
  await db
    .prepare(
      `UPDATE members SET
        paid_minor = COALESCE((
          SELECT SUM(t.amount_minor) FROM transactions t
          WHERE t.member_id = members.id AND t.space_id = members.space_id AND t.status = 'approved'
            AND ${NOT_PEER_TRANSFER_SQL("t.")}
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
  END), 0) AS balance FROM transactions WHERE space_id=? AND status='approved' AND ${NOT_PEER_TRANSFER_SQL("")}`).bind(spaceId).first<{ balance: number }>();
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
  if (isPeerTransferDescription(txn.description_ar)) {
    try {
      await revertPeerTransfer(db, txn, recordStatus);
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
