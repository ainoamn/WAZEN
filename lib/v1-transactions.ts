/** Business API v1 — create a simple income/expense/contribution on a wallet. */

import type { RequestUser } from "../db/runtime";
import { prepareAudit } from "./audit";
import { coveringPeriod } from "./accounting-periods";
import { ApiError } from "./security";
import { formatMoneyMinor, parseMoneyToMinor } from "./money";
import { reconcileMemberLedgers, writeApprovedCashBalance } from "./ledger-void";

function transactionBalanceDelta(kind: string, allocation: string, amountMinor: number) {
  if (allocation === "personal_reserve") return 0;
  if (["income", "contribution"].includes(kind)) return amountMinor;
  if (kind === "expense") return -amountMinor;
  return 0;
}

export type V1CreateTransactionInput = {
  kind: "income" | "expense" | "contribution";
  description: string;
  amount: string | number;
  memberId?: string | null;
  occurredAt?: string;
};

export async function createV1Transaction(
  db: D1Database,
  user: RequestUser,
  space: { id: string; type: string; currency: string; balance_minor: number; owner_user_id: string },
  input: V1CreateTransactionInput,
) {
  const { assertOwnerPlanQuota } = await import("../services/admin/billing-service");
  await assertOwnerPlanQuota(db, space.owner_user_id, "transaction", 1);

  let kind = input.kind;
  const memberId = input.memberId?.trim() || null;
  const description = input.description.trim();
  if (description.length < 2 || description.length > 300) throw new ApiError(400, "INVALID_TRANSACTION");

  if (memberId && kind === "income" && ["household", "trip", "society", "group"].includes(space.type)) {
    kind = "contribution";
  }
  if (kind === "contribution" && !memberId && ["household", "trip", "society", "group"].includes(space.type)) {
    throw new ApiError(400, "MEMBER_REQUIRED");
  }

  let amountMinor: number;
  try {
    amountMinor = parseMoneyToMinor(input.amount, space.currency);
  } catch {
    throw new ApiError(400, "INVALID_AMOUNT");
  }
  if (amountMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT");

  if (memberId) {
    const member = await db.prepare("SELECT id FROM members WHERE id=? AND space_id=? AND status='active'")
      .bind(memberId, space.id).first();
    if (!member) throw new ApiError(400, "INVALID_MEMBER");
  }

  const createdAt = new Date().toISOString();
  const occurredAt = input.occurredAt ?? createdAt;
  if (Number.isNaN(Date.parse(occurredAt))) throw new ApiError(400, "INVALID_OCCURRED_AT");

  const periods = await db.prepare("SELECT id,space_id,starts_at,ends_at,closed_at,status FROM accounting_periods WHERE space_id=?")
    .bind(space.id).all<{ id: string; space_id: string; starts_at: string; ends_at?: string | null; closed_at?: string | null; status: string }>();
  const period = coveringPeriod(periods.results ?? [], occurredAt);
  if (period?.status === "closed") throw new ApiError(409, "PERIOD_CLOSED");

  const positive = kind === "income" || kind === "contribution";
  const balanceDelta = positive ? amountMinor : -amountMinor;
  if (space.type === "personal" && balanceDelta < 0 && Number(space.balance_minor) + balanceDelta < 0) {
    throw new ApiError(409, "INSUFFICIENT_FUNDS");
  }

  const transactionId = crypto.randomUUID();
  const entryId = crypto.randomUUID();
  const allocation = kind === "contribution" ? "mandatory" : "general";
  const debitAccount = balanceDelta >= 0 ? "asset:cash" : "expense:general";
  const creditAccount = balanceDelta >= 0 ? "income:general" : "asset:cash";

  const statements: D1PreparedStatement[] = [
    db.prepare("INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)")
      .bind(transactionId, space.id, user.id, memberId, kind, allocation, amountMinor, description, description, occurredAt, createdAt),
    db.prepare("UPDATE spaces SET balance_minor = balance_minor + ? WHERE id = ?").bind(balanceDelta, space.id),
    db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
      .bind(entryId, space.id, transactionId, user.id, description, occurredAt, createdAt),
    db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), entryId, debitAccount, memberId, amountMinor, 0, createdAt),
    db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), entryId, creditAccount, memberId, 0, amountMinor, createdAt),
  ];
  if (memberId && (kind === "contribution" || kind === "income")) {
    statements.push(
      db.prepare("UPDATE members SET paid_minor = paid_minor + ? WHERE id = ? AND space_id = ?")
        .bind(amountMinor, memberId, space.id),
    );
  }
  statements.push(prepareAudit(db, {
    userId: user.id,
    action: "transaction.created",
    entityType: "transaction",
    entityId: transactionId,
    metadata: { spaceId: space.id, kind, allocation, amountMinor, memberId, via: "api.v1" },
    createdAt,
  }));
  statements.push(
    db.prepare(`INSERT INTO period_ledger_events (id,space_id,period_id,user_id,actor_name,action,entity_type,entity_id,summary_ar,summary_en,metadata_json,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(),
        space.id,
        period?.id ?? null,
        user.id,
        user.displayName,
        "transaction.created",
        "transaction",
        transactionId,
        `${user.displayName} أضاف حركة عبر API: ${description}`,
        `${user.displayName} added transaction via API: ${description}`,
        JSON.stringify({ kind, amountMinor, via: "api.v1" }),
        createdAt,
      ),
  );
  await db.batch(statements);

  return {
    id: transactionId,
    spaceId: space.id,
    kind,
    allocation,
    amountMinor,
    descriptionAr: description,
    descriptionEn: description,
    memberId,
    status: "approved" as const,
    occurredAt,
    createdAt,
  };
}

export async function getV1Transaction(
  db: D1Database,
  space: { id: string; currency: string },
  transactionId: string,
) {
  const txn = await db.prepare(`
    SELECT id, kind, allocation, amount_minor, description_ar, description_en, member_id, status, occurred_at, created_at
    FROM transactions WHERE id=? AND space_id=? AND COALESCE(status,'approved')<>'superseded'
  `).bind(transactionId, space.id).first<{
    id: string; kind: string; allocation: string; amount_minor: number;
    description_ar: string; description_en: string; member_id: string | null;
    status: string | null; occurred_at: string; created_at: string;
  }>();
  if (!txn) throw new ApiError(404, "TRANSACTION_NOT_FOUND");
  const currency = space.currency || "OMR";
  return {
    id: txn.id,
    spaceId: space.id,
    kind: txn.kind,
    allocation: txn.allocation,
    amountMinor: Number(txn.amount_minor) || 0,
    amountLabel: formatMoneyMinor(Number(txn.amount_minor) || 0, currency, "en"),
    descriptionAr: txn.description_ar,
    descriptionEn: txn.description_en,
    memberId: txn.member_id,
    status: txn.status ?? "approved",
    occurredAt: txn.occurred_at,
    createdAt: txn.created_at,
  };
}

export async function listV1TransactionRevisions(
  db: D1Database,
  spaceId: string,
  transactionId: string,
) {
  const txn = await db.prepare("SELECT id FROM transactions WHERE id=? AND space_id=?")
    .bind(transactionId, spaceId).first<{ id: string }>();
  if (!txn) throw new ApiError(404, "TRANSACTION_NOT_FOUND");
  const rows = await db.prepare(`
    SELECT id, transaction_id, edited_by, editor_name, edited_at,
      kind, allocation, amount_minor, member_id, description_ar, description_en, occurred_at, status
    FROM transaction_revisions WHERE transaction_id=? ORDER BY edited_at DESC
  `).bind(txn.id).all<{
    id: string; transaction_id: string; edited_by: string; editor_name: string; edited_at: string;
    kind: string; allocation: string; amount_minor: number; member_id: string | null;
    description_ar: string; description_en: string; occurred_at: string; status: string;
  }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    transactionId: row.transaction_id,
    editedBy: row.edited_by,
    editorName: row.editor_name,
    editedAt: row.edited_at,
    kind: row.kind,
    allocation: row.allocation,
    amountMinor: Number(row.amount_minor) || 0,
    memberId: row.member_id,
    descriptionAr: row.description_ar,
    descriptionEn: row.description_en,
    occurredAt: row.occurred_at,
    status: row.status,
  }));
}

export type V1UpdateTransactionInput = {
  description: string;
  amount: string | number;
  memberId?: string | null;
  kind?: "expense" | "income" | "contribution" | "reimbursement";
  allocation?: "general" | "mandatory" | "personal_reserve";
  occurredAt?: string;
};

export async function updateV1Transaction(
  db: D1Database,
  user: RequestUser,
  space: { id: string; type: string; currency: string; balance_minor: number },
  transactionId: string,
  input: V1UpdateTransactionInput,
) {
  const existing = await db.prepare("SELECT * FROM transactions WHERE id=? AND space_id=?")
    .bind(transactionId, space.id)
    .first<{
      id: string; space_id: string; member_id: string | null; kind: string; allocation: string;
      amount_minor: number; description_ar: string; description_en: string; occurred_at: string;
      status: string; edit_count?: number | null;
    }>();
  if (!existing) throw new ApiError(404, "TRANSACTION_NOT_FOUND");
  if (existing.status !== "approved") throw new ApiError(409, "TRANSACTION_NOT_EDITABLE");

  const occurredAt = input.occurredAt ?? existing.occurred_at;
  if (Number.isNaN(Date.parse(occurredAt))) throw new ApiError(400, "INVALID_OCCURRED_AT");
  const periods = await db.prepare("SELECT id,space_id,starts_at,ends_at,closed_at,status FROM accounting_periods WHERE space_id=?")
    .bind(space.id).all<{ id: string; space_id: string; starts_at: string; ends_at?: string | null; closed_at?: string | null; status: string }>();
  if (coveringPeriod(periods.results ?? [], existing.occurred_at)?.status === "closed") {
    throw new ApiError(409, "PERIOD_CLOSED");
  }
  if (occurredAt !== existing.occurred_at && coveringPeriod(periods.results ?? [], occurredAt)?.status === "closed") {
    throw new ApiError(409, "PERIOD_CLOSED");
  }

  let kind = input.kind ?? existing.kind;
  let allocation = input.allocation ?? existing.allocation;
  const memberId = input.memberId === undefined ? existing.member_id : input.memberId;
  if (memberId && kind === "income" && ["household", "trip", "society", "group"].includes(space.type)) {
    kind = "contribution";
  }
  if (kind === "contribution" && allocation === "general") allocation = "mandatory";

  let amountMinor: number;
  try {
    amountMinor = parseMoneyToMinor(input.amount, space.currency);
  } catch {
    throw new ApiError(400, "INVALID_AMOUNT");
  }
  if (amountMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT");
  if (memberId) {
    const member = await db.prepare("SELECT id FROM members WHERE id=? AND space_id=? AND status='active'")
      .bind(memberId, space.id).first();
    if (!member) throw new ApiError(400, "INVALID_MEMBER");
  }

  const oldDelta = transactionBalanceDelta(existing.kind, existing.allocation, Number(existing.amount_minor));
  const newDelta = transactionBalanceDelta(kind, allocation, amountMinor);
  const refreshed = await db.prepare("SELECT balance_minor FROM spaces WHERE id=?")
    .bind(space.id).first<{ balance_minor: number }>();
  if (space.type === "personal" && Number(refreshed?.balance_minor ?? 0) - oldDelta + newDelta < 0) {
    throw new ApiError(409, "INSUFFICIENT_FUNDS");
  }

  const description = input.description.trim();
  if (description.length < 2 || description.length > 300) throw new ApiError(400, "INVALID_TRANSACTION");

  const editedAt = new Date().toISOString();
  const revisionId = crypto.randomUUID();
  const editCount = Number(existing.edit_count ?? 0) + 1;
  const reserveWithdrawal = allocation === "personal_reserve" && kind === "reimbursement";
  const debitAccount = reserveWithdrawal
    ? "liability:member_reserve"
    : newDelta >= 0 ? "asset:cash" : (kind === "reimbursement" ? "liability:member_payable" : "expense:general");
  const creditAccount = reserveWithdrawal
    ? "asset:cash"
    : newDelta >= 0
      ? (allocation === "personal_reserve" ? "liability:member_reserve" : "income:general")
      : "asset:cash";

  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO transaction_revisions (
      id, transaction_id, edited_by, editor_name, edited_at,
      kind, allocation, amount_minor, member_id, description_ar, description_en, occurred_at, status
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      revisionId,
      existing.id,
      user.id,
      user.displayName,
      editedAt,
      existing.kind,
      existing.allocation,
      Number(existing.amount_minor),
      existing.member_id,
      existing.description_ar,
      existing.description_en,
      existing.occurred_at,
      existing.status,
    ),
    db.prepare(`UPDATE transactions SET
      member_id=?, kind=?, allocation=?, amount_minor=?,
      description_ar=?, description_en=?, occurred_at=?,
      modified_at=?, edit_count=?
      WHERE id=? AND status='approved'`)
      .bind(memberId, kind, allocation, amountMinor, description, description, occurredAt, editedAt, editCount, existing.id),
    prepareAudit(db, {
      userId: user.id,
      action: "transaction.updated",
      entityType: "transaction",
      entityId: existing.id,
      metadata: {
        revisionId,
        spaceId: space.id,
        kind,
        allocation,
        amountMinor,
        memberId,
        beforeAmount: existing.amount_minor,
        via: "api.v1",
      },
      createdAt: editedAt,
    }),
  ];

  const journal = await db.prepare("SELECT id FROM journal_entries WHERE transaction_id=? ORDER BY created_at DESC LIMIT 1")
    .bind(existing.id).first<{ id: string }>();
  if (journal) {
    statements.push(db.prepare("UPDATE journal_entries SET description=?, occurred_at=? WHERE id=?")
      .bind(description, occurredAt, journal.id));
    statements.push(db.prepare("DELETE FROM journal_lines WHERE entry_id=?").bind(journal.id));
    statements.push(db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), journal.id, debitAccount, memberId, amountMinor, 0, editedAt));
    statements.push(db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), journal.id, creditAccount, memberId, 0, amountMinor, editedAt));
  }

  await db.batch(statements);
  try { await writeApprovedCashBalance(db, space.id); } catch { /* best-effort */ }
  try { await reconcileMemberLedgers(db, [space.id]); } catch { /* best-effort */ }

  return getV1Transaction(db, space, existing.id);
}
