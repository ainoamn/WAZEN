/** Business API v1 — list / create / void trip/group expenses. */

import type { RequestUser } from "../db/runtime";
import { prepareAudit } from "./audit";
import { coveringPeriod } from "./accounting-periods";
import { ApiError } from "./security";
import { currencyScale, formatMoneyMinor } from "./money";
import { resolveExpenseSplitMembers, splitEvenly, takeShareSlice, fundChargeFits } from "./finance";
import { hasComposeParts, planExpenseSplitsForApi, planPayerSplitForApi } from "./expense-split";
import { rebuildSpaceTripSettlements } from "./trip-settlements";
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
  amount?: string | number;
  description: string;
  paidFrom?: "common_fund" | "member" | "split";
  paidByMemberId?: string;
  fundAmount?: string | number;
  memberAmount?: string | number;
  splitMemberIds?: string[];
  sharedAmount?: string | number;
  sharedMemberIds?: string[];
  extraShares?: Array<{ memberId: string; amount: string | number }>;
  occurredAt?: string;
};

export async function createV1Expense(
  db: D1Database,
  user: RequestUser,
  space: { id: string; currency: string; owner_user_id: string; type: string; balance_minor?: number },
  input: V1CreateExpenseInput,
): Promise<{
  id: string;
  spaceId: string;
  transactionId: string;
  amountMinor: number;
  amountLabel: string;
  description: string;
  paidFrom: string;
  paidByMemberId: string;
  occurredAt: string;
  status: "posted";
  splits: Array<{ memberId: string; shareMinor: number }>;
}> {
  if (!["household", "trip", "society", "group"].includes(space.type)) {
    throw new ApiError(400, "INVALID_WALLET_TYPE");
  }
  const { assertOwnerPlanQuota } = await import("../services/admin/billing-service");
  await assertOwnerPlanQuota(db, space.owner_user_id, "transaction", 1);

  const members = await db.prepare("SELECT id FROM members WHERE space_id=? AND status='active' ORDER BY joined_at")
    .bind(space.id).all<{ id: string }>();
  if (!members.results?.length) throw new ApiError(400, "NO_ACTIVE_MEMBERS");

  const planned = planExpenseSplitsForApi({
    currency: space.currency,
    allowedIds: members.results.map((m) => m.id),
    amount: input.amount,
    sharedAmount: input.sharedAmount,
    sharedMemberIds: input.sharedMemberIds,
    extraShares: input.extraShares,
    splitMemberIds: input.splitMemberIds,
  });
  const amountMinor = planned.amountMinor;
  const splits = planned.splits;
  const fundCashMinor = Math.max(0, Number(space.balance_minor) || 0);
  if ((input.paidFrom ?? "member") === "common_fund" && !fundChargeFits(amountMinor, fundCashMinor)) {
    throw new ApiError(409, "FUND_SHORTFALL_REQUIRES_MEMBER");
  }

  if (input.paidFrom === "split") {
    const payerSplit = planPayerSplitForApi({
      currency: space.currency,
      totalMinor: amountMinor,
      fundAmount: input.fundAmount,
      memberAmount: input.memberAmount,
    });
    if (!fundChargeFits(payerSplit.fundMinor, fundCashMinor)) {
      throw new ApiError(409, "FUND_SHORTFALL_REQUIRES_MEMBER");
    }
    if (!input.paidByMemberId || !members.results.some((row) => row.id === input.paidByMemberId)) {
      throw new ApiError(400, "INVALID_PAYER");
    }
    const sliced = takeShareSlice(splits, payerSplit.fundMinor);
    const scale = 10 ** currencyScale(space.currency);
    const asAmount = (minor: number) => (minor / scale).toFixed(3);
    const toExtras = (rows: Array<{ memberId: string; shareMinor: number }>) =>
      rows.map((row) => ({ memberId: row.memberId, amount: asAmount(row.shareMinor) }));
    const shared = {
      description: input.description,
      occurredAt: input.occurredAt,
    };
    const fundExpense = await createV1Expense(db, user, space, {
      ...shared,
      paidFrom: "common_fund",
      amount: asAmount(payerSplit.fundMinor),
      extraShares: toExtras(sliced.taken),
    });
    await createV1Expense(db, user, space, {
      ...shared,
      paidFrom: "member",
      paidByMemberId: input.paidByMemberId,
      amount: asAmount(payerSplit.memberMinor),
      extraShares: toExtras(sliced.rest),
    });
    return fundExpense;
  }

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
    metadata: { spaceId: space.id, amountMinor, paidFrom, paidByMemberId: paidFrom === "member" ? paidByMemberId : null, splits, via: "api.v1" },
    createdAt,
  }));

  await db.batch(statements);
  try { await writeApprovedCashBalance(db, space.id); } catch { /* best-effort */ }
  await rebuildSpaceTripSettlements(db, space.id, user.id);

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
  await rebuildSpaceTripSettlements(db, space.id, user.id);

  return { id: expense.id, spaceId: space.id, status: "voided" as const, voidedAt: createdAt };
}

type TripExpenseRecord = {
  id: string;
  space_id: string;
  paid_by_member_id: string;
  amount_minor: number;
  description: string;
  occurred_at?: string | null;
  created_at: string;
  transaction_id?: string | null;
  status?: string | null;
  paid_from?: string | null;
};

async function rebuildV1ExpenseShares(
  db: D1Database,
  userId: string,
  expense: TripExpenseRecord,
  next: { amountMinor: number; description: string; paidByMemberId: string; paidFrom?: "common_fund" | "member" },
  options?: { skipNet?: boolean; splitMemberIds?: string[]; forceAllMembers?: boolean; splits?: Array<{ memberId: string; shareMinor: number }> },
) {
  if ((expense.status ?? "posted") === "voided") throw new ApiError(409, "EXPENSE_VOIDED");
  const settled = await db.prepare("SELECT COUNT(*) AS count FROM settlements WHERE expense_id=? AND status='settled'")
    .bind(expense.id).first<{ count: number }>();
  if (Number(settled?.count ?? 0) > 0) throw new ApiError(409, "EXPENSE_ALREADY_SETTLED");

  const members = await db.prepare("SELECT id FROM members WHERE space_id=? AND status='active' ORDER BY joined_at")
    .bind(expense.space_id).all<{ id: string }>();
  if (!members.results?.length) throw new ApiError(400, "NO_ACTIVE_MEMBERS");

  const linked = expense.transaction_id
    ? await db.prepare("SELECT * FROM transactions WHERE id=?").bind(expense.transaction_id).first<{
      id: string; kind: string; status: string; amount_minor: number;
    }>()
    : null;
  const paidFromFund = next.paidFrom
    ? next.paidFrom === "common_fund"
    : (linked?.kind === "expense" || expense.paid_from === "common_fund");
  const nextPaidFrom = paidFromFund ? "common_fund" : "member";
  if (!paidFromFund && !members.results.some((member) => member.id === next.paidByMemberId)) {
    throw new ApiError(400, "INVALID_PAYER");
  }
  const payerId = paidFromFund
    ? (members.results.some((member) => member.id === expense.paid_by_member_id) ? expense.paid_by_member_id : members.results[0].id)
    : next.paidByMemberId;

  const allowedIds = members.results.map((member) => member.id);
  let amountMinor = next.amountMinor;
  let splits: Array<{ memberId: string; shareMinor: number }>;
  if (options?.splits?.length) {
    const allowed = new Set(allowedIds);
    if (options.splits.some((row) => !allowed.has(row.memberId) || !Number.isSafeInteger(row.shareMinor) || row.shareMinor <= 0)) {
      throw new ApiError(400, "INVALID_SPLIT");
    }
    splits = options.splits;
    amountMinor = splits.reduce((sum, row) => sum + row.shareMinor, 0);
  } else {
    const existingSplits = options?.forceAllMembers || options?.splitMemberIds
      ? []
      : (await db.prepare("SELECT member_id FROM expense_splits WHERE expense_id=?").bind(expense.id).all<{ member_id: string }>()).results?.map((row) => row.member_id) ?? [];
    const splitMemberIds = options?.forceAllMembers
      ? allowedIds
      : (() => {
        try {
          return resolveExpenseSplitMembers({
            requestedIds: options?.splitMemberIds,
            existingIds: existingSplits,
            fallbackIds: allowedIds,
          });
        } catch {
          throw new ApiError(400, "INVALID_SPLIT");
        }
      })();
    splits = splitEvenly(amountMinor, splitMemberIds);
  }
  const journalEntry = linked
    ? await db.prepare("SELECT id FROM journal_entries WHERE transaction_id=?").bind(linked.id).first<{ id: string }>()
    : null;
  const createdAt = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db.prepare("UPDATE trip_expenses SET paid_by_member_id=?, amount_minor=?, description=?, paid_from=? WHERE id=?")
      .bind(payerId, amountMinor, next.description, nextPaidFrom, expense.id),
    db.prepare("DELETE FROM expense_splits WHERE expense_id=?").bind(expense.id),
    db.prepare("UPDATE settlements SET status='voided' WHERE expense_id=? AND status='pending'").bind(expense.id),
  ];
  if (linked && linked.status === "approved") {
    statements.push(
      db.prepare("UPDATE transactions SET amount_minor=?, description_ar=?, description_en=?, member_id=?, kind=? WHERE id=?")
        .bind(amountMinor, next.description, next.description, paidFromFund ? null : payerId, paidFromFund ? "expense" : "reimbursement", linked.id),
    );
  }
  if (journalEntry) {
    statements.push(db.prepare("DELETE FROM journal_lines WHERE entry_id=?").bind(journalEntry.id));
    statements.push(db.prepare("UPDATE journal_entries SET description=? WHERE id=?").bind(next.description, journalEntry.id));
    if (paidFromFund) {
      statements.push(
        db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), journalEntry.id, "expense:group", null, amountMinor, 0, createdAt),
        db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), journalEntry.id, "asset:cash", null, 0, amountMinor, createdAt),
      );
    } else {
      statements.push(
        db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), journalEntry.id, "expense:trip", payerId, amountMinor, 0, createdAt),
        db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), journalEntry.id, "liability:member_payable", payerId, 0, amountMinor, createdAt),
      );
    }
  }
  for (const split of splits) {
    statements.push(
      db.prepare("INSERT INTO expense_splits (id,expense_id,member_id,share_minor) VALUES (?,?,?,?)")
        .bind(crypto.randomUUID(), expense.id, split.memberId, split.shareMinor),
    );
  }
  statements.push(prepareAudit(db, {
    userId,
    action: "trip.expense_resplit",
    entityType: "trip_expense",
    entityId: expense.id,
    metadata: {
      amountMinor,
      paidFrom: nextPaidFrom,
      paidByMemberId: paidFromFund ? null : payerId,
      memberCount: splits.length,
      splitMemberIds: splits.map((row) => row.memberId),
      via: "api.v1",
    },
    createdAt,
  }));
  await db.batch(statements);
  try { await writeApprovedCashBalance(db, expense.space_id); } catch { /* best-effort */ }
  if (!options?.skipNet) await rebuildSpaceTripSettlements(db, expense.space_id, userId);
}

export async function updateV1Expense(
  db: D1Database,
  user: RequestUser,
  space: { id: string; currency: string },
  expenseId: string,
  input: {
    amount?: string | number;
    description?: string;
    paidByMemberId?: string;
    paidFrom?: "common_fund" | "member";
    splitMemberIds?: string[];
    sharedAmount?: string | number;
    sharedMemberIds?: string[];
    extraShares?: Array<{ memberId: string; amount: string | number }>;
  },
) {
  const expense = await db.prepare("SELECT * FROM trip_expenses WHERE id=? AND space_id=?")
    .bind(expenseId, space.id).first<TripExpenseRecord>();
  if (!expense) throw new ApiError(404, "EXPENSE_NOT_FOUND");

  const occurredAt = expense.occurred_at || expense.created_at;
  const periods = await db.prepare("SELECT id,space_id,starts_at,ends_at,closed_at,status FROM accounting_periods WHERE space_id=?")
    .bind(space.id).all<{ id: string; space_id: string; starts_at: string; ends_at?: string | null; closed_at?: string | null; status: string }>();
  if (coveringPeriod(periods.results ?? [], occurredAt)?.status === "closed") {
    throw new ApiError(409, "PERIOD_CLOSED");
  }

  const members = await db.prepare("SELECT id FROM members WHERE space_id=? AND status='active' ORDER BY joined_at")
    .bind(expense.space_id).all<{ id: string }>();
  const existingSplitIds = (await db.prepare("SELECT member_id FROM expense_splits WHERE expense_id=?").bind(expense.id).all<{ member_id: string }>()).results?.map((row) => row.member_id) ?? [];
  const planned = planExpenseSplitsForApi({
    currency: space.currency,
    allowedIds: (members.results ?? []).map((row) => row.id),
    amount: hasComposeParts(input)
      ? input.amount
      : (input.amount ?? Number(expense.amount_minor) / (10 ** currencyScale(space.currency))),
    sharedAmount: input.sharedAmount,
    sharedMemberIds: input.sharedMemberIds,
    extraShares: input.extraShares,
    splitMemberIds: input.splitMemberIds,
    existingIds: existingSplitIds,
  });
  const description = (input.description ?? expense.description).trim();
  if (description.length < 2) throw new ApiError(400, "INVALID_TRIP_EXPENSE");
  const cashRow = await db.prepare("SELECT balance_minor FROM spaces WHERE id=?").bind(space.id).first<{ balance_minor: number }>();
  const existingFundMinor = expense.paid_from === "common_fund" ? Number(expense.amount_minor) || 0 : 0;
  const fundCashMinor = Math.max(0, (Number(cashRow?.balance_minor) || 0) + existingFundMinor);
  const nextPaidFrom = input.paidFrom ?? (expense.paid_from === "common_fund" ? "common_fund" : "member");
  if (nextPaidFrom === "common_fund" && !fundChargeFits(planned.amountMinor, fundCashMinor)) {
    throw new ApiError(409, "FUND_SHORTFALL_REQUIRES_MEMBER");
  }

  await rebuildV1ExpenseShares(db, user.id, expense, {
    amountMinor: planned.amountMinor,
    description,
    paidByMemberId: input.paidByMemberId ?? expense.paid_by_member_id,
    paidFrom: input.paidFrom,
  }, { splits: planned.splits });

  const expenses = await listV1Expenses(db, space, { limit: 200 });
  return expenses.find((row) => row.id === expenseId) ?? { id: expenseId, spaceId: space.id };
}

export async function resplitV1Expenses(
  db: D1Database,
  user: RequestUser,
  space: { id: string },
  expenseId?: string,
) {
  const expenses = expenseId
    ? await db.prepare("SELECT * FROM trip_expenses WHERE id=? AND space_id=?")
      .bind(expenseId, space.id).all<TripExpenseRecord>()
    : await db.prepare("SELECT * FROM trip_expenses WHERE space_id=? AND COALESCE(status,'posted')<>'voided' ORDER BY occurred_at")
      .bind(space.id).all<TripExpenseRecord>();
  if (!expenses.results?.length) throw new ApiError(404, "EXPENSE_NOT_FOUND");

  let updated = 0;
  let skipped = 0;
  for (const expense of expenses.results) {
    const settled = await db.prepare("SELECT COUNT(*) AS count FROM settlements WHERE expense_id=? AND status='settled'")
      .bind(expense.id).first<{ count: number }>();
    if (Number(settled?.count ?? 0) > 0) {
      skipped += 1;
      continue;
    }
    await rebuildV1ExpenseShares(db, user.id, expense, {
      amountMinor: Number(expense.amount_minor),
      description: expense.description,
      paidByMemberId: expense.paid_by_member_id,
    }, { skipNet: true, forceAllMembers: true });
    updated += 1;
  }
  await rebuildSpaceTripSettlements(db, space.id, user.id);
  return { spaceId: space.id, updated, skipped };
}
