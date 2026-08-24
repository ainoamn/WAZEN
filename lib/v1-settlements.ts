/** Business API v1 — settlements list + settle. */

import type { RequestUser } from "../db/runtime";
import { prepareAudit } from "./audit";
import { ApiError } from "./security";
import { formatMoneyMinor } from "./money";

export async function listV1Settlements(
  db: D1Database,
  space: { id: string; currency: string },
  options?: { status?: string; limit?: number },
) {
  const limit = Math.min(200, Math.max(1, options?.limit ?? 50));
  const currency = space.currency || "OMR";
  const status = options?.status?.trim();
  const rows = status
    ? await db.prepare(`
        SELECT id, from_member_id, to_member_id, amount_minor, status, expense_id, created_at, settled_at
        FROM settlements WHERE space_id=? AND status=? ORDER BY created_at DESC LIMIT ?
      `).bind(space.id, status, limit).all<{
        id: string; from_member_id: string; to_member_id: string; amount_minor: number;
        status: string; expense_id: string | null; created_at: string; settled_at: string | null;
      }>()
    : await db.prepare(`
        SELECT id, from_member_id, to_member_id, amount_minor, status, expense_id, created_at, settled_at
        FROM settlements WHERE space_id=? ORDER BY created_at DESC LIMIT ?
      `).bind(space.id, limit).all<{
        id: string; from_member_id: string; to_member_id: string; amount_minor: number;
        status: string; expense_id: string | null; created_at: string; settled_at: string | null;
      }>();

  return (rows.results ?? []).map((row) => ({
    id: row.id,
    fromMemberId: row.from_member_id,
    toMemberId: row.to_member_id,
    amountMinor: Number(row.amount_minor) || 0,
    amountLabel: formatMoneyMinor(Number(row.amount_minor) || 0, currency, "en"),
    status: row.status,
    expenseId: row.expense_id,
    createdAt: row.created_at,
    settledAt: row.settled_at,
  }));
}

export async function settleV1Settlement(
  db: D1Database,
  user: RequestUser,
  settlementId: string,
  options?: { idempotencyKey?: string },
) {
  const settlement = await db.prepare(`
    SELECT st.id,st.space_id,st.from_member_id,st.to_member_id,st.amount_minor,st.expense_id,s.balance_minor,s.owner_user_id,s.currency
    FROM settlements st JOIN spaces s ON s.id=st.space_id
    WHERE st.id=? AND st.status='pending'
  `).bind(settlementId).first<{
    id: string; space_id: string; from_member_id: string; to_member_id: string; amount_minor: number;
    expense_id: string | null; balance_minor: number; owner_user_id: string; currency: string;
  }>();
  if (!settlement) throw new ApiError(404, "SETTLEMENT_NOT_FOUND");

  const { assertOwnerPlanQuota } = await import("../services/admin/billing-service");
  await assertOwnerPlanQuota(db, settlement.owner_user_id, "transaction", 2);

  const fromFund = String(settlement.from_member_id).startsWith("space:");
  const toFund = String(settlement.to_member_id).startsWith("space:");
  const createdAt = new Date().toISOString();
  const amountMinor = Number(settlement.amount_minor) || 0;

  if (toFund) {
    const payTxn = crypto.randomUUID();
    const payEntry = crypto.randomUUID();
    const desc = "تسوية حصة مصروف للصندوق";
    await db.batch([
      db.prepare("UPDATE settlements SET status='settled',settled_at=? WHERE id=? AND status='pending'")
        .bind(createdAt, settlement.id),
      db.prepare("UPDATE spaces SET balance_minor = balance_minor + ? WHERE id=?")
        .bind(amountMinor, settlement.space_id),
      db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,'extra',?,?,?,'approved',?,?)")
        .bind(payTxn, settlement.space_id, user.id, settlement.from_member_id, "income", amountMinor, desc, desc, createdAt, createdAt),
      db.prepare("UPDATE members SET addon_minor = COALESCE(addon_minor,0) + ? WHERE id=?")
        .bind(amountMinor, settlement.from_member_id),
      db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
        .bind(payEntry, settlement.space_id, payTxn, user.id, desc, createdAt, createdAt),
      db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), payEntry, "asset:cash", settlement.from_member_id, amountMinor, 0, createdAt),
      db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), payEntry, "income:contribution", settlement.from_member_id, 0, amountMinor, createdAt),
      prepareAudit(db, {
        userId: user.id,
        action: "expense.share_paid_to_fund",
        entityType: "settlement",
        entityId: settlement.id,
        metadata: { amountMinor, via: "api.v1" },
        createdAt,
      }),
    ]);
  } else if (fromFund) {
    if (Number(settlement.balance_minor) < amountMinor) throw new ApiError(409, "INSUFFICIENT_FUNDS");
    const entryId = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [
      db.prepare("UPDATE settlements SET status='settled',settled_at=? WHERE id=? AND status='pending'")
        .bind(createdAt, settlement.id),
      db.prepare("UPDATE spaces SET balance_minor=balance_minor-? WHERE id=?")
        .bind(amountMinor, settlement.space_id),
      db.prepare("INSERT INTO journal_entries (id,space_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,'Member reimbursement settled','posted',?,?)")
        .bind(entryId, settlement.space_id, user.id, createdAt, createdAt),
      db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), entryId, "liability:member_payable", settlement.to_member_id, amountMinor, 0, createdAt),
      db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), entryId, "asset:cash", settlement.to_member_id, 0, amountMinor, createdAt),
      prepareAudit(db, {
        userId: user.id,
        action: "trip.reimbursement_settled",
        entityType: "settlement",
        entityId: settlement.id,
        metadata: { amountMinor, via: "api.v1" },
        createdAt,
      }),
    ];
    if (options?.idempotencyKey) {
      statements.unshift(
        db.prepare("INSERT INTO financial_operation_claims (operation_type,resource_id,idempotency_key,created_at) VALUES ('trip_settlement',?,?,?)")
          .bind(settlement.id, options.idempotencyKey, createdAt),
      );
    }
    await db.batch(statements);
  } else {
    const names = await db.prepare("SELECT id,display_name FROM members WHERE id IN (?,?)")
      .bind(settlement.from_member_id, settlement.to_member_id)
      .all<{ id: string; display_name: string }>();
    const fromName = names.results?.find((row) => row.id === settlement.from_member_id)?.display_name ?? "عضو";
    const toName = names.results?.find((row) => row.id === settlement.to_member_id)?.display_name ?? "عضو";
    const expense = settlement.expense_id
      ? await db.prepare("SELECT description FROM trip_expenses WHERE id=?").bind(settlement.expense_id).first<{ description: string }>()
      : null;
    const reason = expense?.description || "مصروف جماعي";
    const descFrom = `مبلغ إضافي · تسوية حصة «${reason}» إلى ${toName}`;
    const descTo = `استرداد مبلغ إضافي · تسوية حصة «${reason}» من ${fromName}`;
    const fromTxn = crypto.randomUUID();
    const toTxn = crypto.randomUUID();
    await db.batch([
      db.prepare("UPDATE settlements SET status='settled',settled_at=? WHERE id=? AND status='pending'")
        .bind(createdAt, settlement.id),
      db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,'extra',?,?,?,'approved',?,?)")
        .bind(fromTxn, settlement.space_id, user.id, settlement.from_member_id, "expense", amountMinor, descFrom, descFrom, createdAt, createdAt),
      db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,'extra',?,?,?,'approved',?,?)")
        .bind(toTxn, settlement.space_id, user.id, settlement.to_member_id, "income", amountMinor, descTo, descTo, createdAt, createdAt),
      db.prepare("UPDATE members SET addon_minor = COALESCE(addon_minor,0) + ? WHERE id=?")
        .bind(amountMinor, settlement.from_member_id),
      prepareAudit(db, {
        userId: user.id,
        action: "member.settlement_recorded",
        entityType: "settlement",
        entityId: settlement.id,
        metadata: {
          fromMemberId: settlement.from_member_id,
          toMemberId: settlement.to_member_id,
          amountMinor,
          reason,
          via: "api.v1",
        },
        createdAt,
      }),
    ]);
  }

  return {
    id: settlement.id,
    spaceId: settlement.space_id,
    status: "settled" as const,
    amountMinor,
    amountLabel: formatMoneyMinor(amountMinor, settlement.currency || "OMR", "en"),
    settledAt: createdAt,
    ownerUserId: settlement.owner_user_id,
  };
}
