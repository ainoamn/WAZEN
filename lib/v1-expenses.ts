/** Business API v1 — list / create / void trip/group expenses. */

import type { RequestUser } from "../db/runtime";
import { prepareAudit } from "./audit";
import { coveringPeriod } from "./accounting-periods";
import { ApiError } from "./security";
import { formatMoneyMinor, parseMoneyToMinor } from "./money";
import { splitEvenly, minimizeSettlements } from "./finance";
import { voidApprovedTransaction, writeApprovedCashBalance } from "./ledger-void";

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

export type V1CreateExpenseInput = {
  amount: string | number;
  description: string;
  paidFrom?: "common_fund" | "member";
  paidByMemberId?: string;
  occurredAt?: string;
};

export async function createV1Expense(
  db: D1Database,
  user: RequestUser,
  space: { id: string; currency: string; owner_user_id: string; type: string },
  input: V1CreateExpenseInput,
) {
  if (!["household", "trip", "society", "group"].includes(space.type)) {
    throw new ApiError(400, "INVALID_WALLET_TYPE");
  }
  const { assertOwnerPlanQuota } = await import("../services/admin/billing-service");
  await assertOwnerPlanQuota(db, space.owner_user_id, "transaction", 1);

  const members = await db.prepare("SELECT id FROM members WHERE space_id=? AND status='active' ORDER BY joined_at")
    .bind(space.id).all<{ id: string }>();
  if (!members.results?.length) throw new ApiError(400, "NO_ACTIVE_MEMBERS");

  let amountMinor: number;
  try {
    amountMinor = parseMoneyToMinor(input.amount, space.currency);
  } catch {
    throw new ApiError(400, "INVALID_AMOUNT");
  }
  if (amountMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT");

  const description = input.description.trim();
  if (description.length < 2 || description.length > 300) throw new ApiError(400, "INVALID_TRIP_EXPENSE");

  const paidFrom = input.paidFrom ?? "member";
  const paidByMemberId = paidFrom === "member"
    ? input.paidByMemberId
    : (input.paidByMemberId ?? members.results[0]?.id);
  if (paidFrom === "member" && (!paidByMemberId || !members.results.some((m) => m.id === paidByMemberId))) {
    throw new ApiError(400, "INVALID_PAYER");
  }
  const fundPayerId = paidFrom === "common_fund" ? members.results[0]!.id : paidByMemberId!;

  const createdAt = new Date().toISOString();
  const occurredAt = input.occurredAt ?? createdAt;
  if (Number.isNaN(Date.parse(occurredAt))) throw new ApiError(400, "INVALID_OCCURRED_AT");

  const periods = await db.prepare("SELECT id,space_id,starts_at,ends_at,closed_at,status FROM accounting_periods WHERE space_id=?")
    .bind(space.id).all<{ id: string; space_id: string; starts_at: string; ends_at?: string | null; closed_at?: string | null; status: string }>();
  if (coveringPeriod(periods.results ?? [], occurredAt)?.status === "closed") {
    throw new ApiError(409, "PERIOD_CLOSED");
  }

  const splits = splitEvenly(amountMinor, members.results.map((m) => m.id));
  const expenseId = crypto.randomUUID();
  const transactionId = crypto.randomUUID();
  const entryId = crypto.randomUUID();

  const statements: D1PreparedStatement[] = [
    db.prepare("INSERT INTO trip_expenses (id,space_id,paid_by_member_id,amount_minor,description,occurred_at,created_by,created_at,transaction_id,status,paid_from) VALUES (?,?,?,?,?,?,?,?,?,'posted',?)")
      .bind(expenseId, space.id, fundPayerId, amountMinor, description, occurredAt, user.id, createdAt, transactionId, paidFrom),
  ];

  if (paidFrom === "common_fund") {
    statements.push(
      db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,'general',?,?,?,'approved',?,?)")
        .bind(transactionId, space.id, user.id, null, "expense", amountMinor, description, description, occurredAt, createdAt),
      db.prepare("UPDATE spaces SET balance_minor = balance_minor - ? WHERE id = ?").bind(amountMinor, space.id),
      db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
        .bind(entryId, space.id, transactionId, user.id, description, occurredAt, createdAt),
      db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), entryId, "expense:group", null, amountMinor, 0, createdAt),
      db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), entryId, "asset:cash", null, 0, amountMinor, createdAt),
    );
  } else {
    statements.push(
      db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,'general',?,?,?,'approved',?,?)")
        .bind(transactionId, space.id, user.id, paidByMemberId, "reimbursement", amountMinor, description, description, occurredAt, createdAt),
      db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
        .bind(entryId, space.id, transactionId, user.id, description, occurredAt, createdAt),
      db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), entryId, "expense:trip", paidByMemberId, amountMinor, 0, createdAt),
      db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), entryId, "liability:member_payable", paidByMemberId, 0, amountMinor, createdAt),
    );
    const balances = members.results.map((member) => {
      const share = splits.find((item) => item.memberId === member.id)?.shareMinor ?? 0;
      const paid = member.id === paidByMemberId ? amountMinor : 0;
      return { memberId: member.id, balanceMinor: paid - share };
    });
    for (const settlement of minimizeSettlements(balances)) {
      statements.push(
        db.prepare("INSERT INTO settlements (id,space_id,from_member_id,to_member_id,amount_minor,status,created_at,expense_id) VALUES (?,?,?,?,?,'pending',?,?)")
          .bind(crypto.randomUUID(), space.id, settlement.fromMemberId, settlement.toMemberId, settlement.amountMinor, createdAt, expenseId),
      );
    }
  }

  for (const split of splits) {
    statements.push(
      db.prepare("INSERT INTO expense_splits (id,expense_id,member_id,share_minor) VALUES (?,?,?,?)")
        .bind(crypto.randomUUID(), expenseId, split.memberId, split.shareMinor),
    );
  }
  statements.push(prepareAudit(db, {
    userId: user.id,
    action: "trip.expense_created",
    entityType: "trip_expense",
    entityId: expenseId,
    metadata: { spaceId: space.id, amountMinor, paidFrom, paidByMemberId: paidFrom === "member" ? paidByMemberId : null, via: "api.v1" },
    createdAt,
  }));

  await db.batch(statements);
  try { await writeApprovedCashBalance(db, space.id); } catch { /* best-effort */ }

  return {
    id: expenseId,
    spaceId: space.id,
    transactionId,
    amountMinor,
    amountLabel: formatMoneyMinor(amountMinor, space.currency || "OMR", "en"),
    description,
    paidFrom,
    paidByMemberId: fundPayerId,
    occurredAt,
    status: "posted" as const,
    splits: splits.map((s) => ({ memberId: s.memberId, shareMinor: s.shareMinor })),
  };
}

export async function voidV1Expense(
  db: D1Database,
  user: RequestUser,
  space: { id: string },
  expenseId: string,
) {
  const expense = await db.prepare("SELECT * FROM trip_expenses WHERE id=? AND space_id=?")
    .bind(expenseId, space.id)
    .first<{
      id: string; space_id: string; transaction_id?: string | null; description: string;
      amount_minor: number; created_at: string; occurred_at?: string | null; status?: string | null;
    }>();
  if (!expense) throw new ApiError(404, "EXPENSE_NOT_FOUND");
  if ((expense.status ?? "posted") === "voided") throw new ApiError(409, "ALREADY_VOIDED");

  const occurredAt = expense.occurred_at || expense.created_at;
  const periods = await db.prepare("SELECT id,space_id,starts_at,ends_at,closed_at,status FROM accounting_periods WHERE space_id=?")
    .bind(space.id).all<{ id: string; space_id: string; starts_at: string; ends_at?: string | null; closed_at?: string | null; status: string }>();
  if (coveringPeriod(periods.results ?? [], occurredAt)?.status === "closed") {
    throw new ApiError(409, "PERIOD_CLOSED");
  }

  const linkedTxn = expense.transaction_id
    ? await db.prepare("SELECT * FROM transactions WHERE id=?").bind(expense.transaction_id).first<{
      id: string; space_id: string; member_id: string | null; kind: string; allocation: string;
      amount_minor: number; status: string; occurred_at: string; description_ar: string;
    }>()
    : await db.prepare("SELECT * FROM transactions WHERE space_id=? AND description_ar=? AND amount_minor=? AND status='approved' ORDER BY occurred_at DESC LIMIT 1")
      .bind(expense.space_id, expense.description, expense.amount_minor).first<{
        id: string; space_id: string; member_id: string | null; kind: string; allocation: string;
        amount_minor: number; status: string; occurred_at: string; description_ar: string;
      }>();

  if (linkedTxn && linkedTxn.status === "approved") {
    await voidApprovedTransaction(db, linkedTxn, user.id, { via: "api.v1" });
  }

  const createdAt = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE trip_expenses SET status='voided' WHERE id=?").bind(expense.id),
    db.prepare("UPDATE settlements SET status='voided' WHERE expense_id=? AND status='pending'").bind(expense.id),
    prepareAudit(db, {
      userId: user.id,
      action: "trip.expense_voided",
      entityType: "trip_expense",
      entityId: expense.id,
      metadata: { spaceId: expense.space_id, via: "api.v1" },
      createdAt,
    }),
  ]);
  try { await writeApprovedCashBalance(db, space.id); } catch { /* best-effort */ }

  return { id: expense.id, spaceId: space.id, status: "voided" as const, voidedAt: createdAt };
}
