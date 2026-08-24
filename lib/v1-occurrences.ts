/** Business API v1 — personal rule occurrences (confirm/skip). */

import type { RequestUser } from "../db/runtime";
import { prepareAudit } from "./audit";
import { writeApprovedCashBalance } from "./ledger-void";
import { parseMoneyToMinor } from "./money";
import { accountLiveBalance } from "./personal-finance";
import { ApiError } from "./security";

async function rebuildPersonalSpaceBalance(db: D1Database, spaceId: string) {
  const accounts = await db.prepare(
    "SELECT id,opening_minor FROM personal_accounts WHERE space_id=? AND status='active'",
  ).bind(spaceId).all<{ id: string; opening_minor: number }>();
  if (!accounts.results?.length) {
    await writeApprovedCashBalance(db, spaceId);
    return;
  }
  const txns = (await db.prepare(
    "SELECT account_id,kind,amount_minor,status FROM transactions WHERE space_id=? AND status='approved'",
  ).bind(spaceId).all<{ account_id?: string | null; kind: string; amount_minor: number; status: string }>()).results ?? [];
  const unassigned = txns
    .filter((row) => !row.account_id)
    .reduce((sum, row) => {
      if (row.kind === "income" || row.kind === "contribution") return sum + Number(row.amount_minor);
      if (row.kind === "expense") return sum - Number(row.amount_minor);
      return sum;
    }, 0);
  const assigned = accounts.results.reduce(
    (sum, account) => sum + accountLiveBalance(Number(account.opening_minor), txns, account.id),
    0,
  );
  await db.prepare("UPDATE spaces SET balance_minor=? WHERE id=?")
    .bind(assigned + unassigned, spaceId).run();
}

export async function confirmV1PersonalOccurrence(
  db: D1Database,
  user: RequestUser,
  space: { id: string; owner_user_id: string; currency: string },
  occurrenceId: string,
  input: { amount?: string | number; accountId?: string | null },
) {
  const occurrence = await db.prepare(`
    SELECT o.*, r.name AS rule_name, r.kind AS rule_kind, r.amount_mode, r.total_minor
    FROM personal_occurrences o JOIN personal_rules r ON r.id=o.rule_id
    WHERE o.id=? AND o.space_id=?
  `).bind(occurrenceId, space.id).first<{
    id: string; rule_id: string; space_id: string; account_id: string | null;
    period_key: string; expected_minor: number; status: string;
    rule_name: string; rule_kind: string; amount_mode: string; total_minor: number;
  }>();
  if (!occurrence) throw new ApiError(404, "OCCURRENCE_NOT_FOUND");
  if (occurrence.status !== "pending") throw new ApiError(409, "OCCURRENCE_NOT_PENDING");

  const { assertOwnerPlanQuota } = await import("../services/admin/billing-service");
  await assertOwnerPlanQuota(db, space.owner_user_id, "transaction", 1);

  let amountMinor = Number(occurrence.expected_minor);
  try {
    if (input.amount !== undefined && input.amount !== "") {
      amountMinor = parseMoneyToMinor(input.amount, space.currency);
    }
  } catch {
    throw new ApiError(400, "INVALID_AMOUNT");
  }
  if (occurrence.amount_mode === "variable" && (input.amount === undefined || input.amount === "")) {
    throw new ApiError(400, "VARIABLE_AMOUNT_REQUIRED");
  }
  if (amountMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT");

  const accountId = input.accountId || occurrence.account_id
    || (await db.prepare(
      "SELECT id FROM personal_accounts WHERE space_id=? AND status='active' ORDER BY created_at LIMIT 1",
    ).bind(occurrence.space_id).first<{ id: string }>())?.id
    || null;
  if (accountId) {
    const account = await db.prepare(
      "SELECT id FROM personal_accounts WHERE id=? AND space_id=? AND status='active'",
    ).bind(accountId, occurrence.space_id).first();
    if (!account) throw new ApiError(400, "INVALID_ACCOUNT");
  }

  const createdAt = new Date().toISOString();
  const transactionId = crypto.randomUUID();
  const expectedMinor = Number(occurrence.expected_minor);
  const delta = amountMinor - expectedMinor;
  const deltaLabelAr = delta === 0 ? "مطابق" : delta > 0 ? `زيادة ${(delta / 1000).toFixed(3)}` : `نقص ${((-delta) / 1000).toFixed(3)}`;
  const deltaLabelEn = delta === 0 ? "matches" : delta > 0 ? `over ${(delta / 1000).toFixed(3)}` : `short ${((-delta) / 1000).toFixed(3)}`;
  const descriptionAr = `${occurrence.rule_name} · ${occurrence.period_key} · التزام ${(expectedMinor / 1000).toFixed(3)} · مدفوع ${(amountMinor / 1000).toFixed(3)} · ${deltaLabelAr}`;
  const descriptionEn = `${occurrence.rule_name} · ${occurrence.period_key} · due ${(expectedMinor / 1000).toFixed(3)} · paid ${(amountMinor / 1000).toFixed(3)} · ${deltaLabelEn}`;
  const kind = occurrence.rule_kind === "income" ? "income" : "expense";

  await db.batch([
    db.prepare("INSERT INTO transactions VALUES (?, ?, ?, NULL, ?, 'general', ?, ?, ?, 'approved', ?, ?)")
      .bind(transactionId, occurrence.space_id, user.id, kind, amountMinor, descriptionAr, descriptionEn, createdAt, createdAt),
    db.prepare("UPDATE transactions SET account_id=? WHERE id=?").bind(accountId, transactionId),
    db.prepare(
      "UPDATE personal_occurrences SET status='posted', actual_minor=?, account_id=?, transaction_id=? WHERE id=? AND status='pending'",
    ).bind(amountMinor, accountId, transactionId, occurrence.id),
    db.prepare("UPDATE personal_rules SET paid_minor = paid_minor + ? WHERE id=?")
      .bind(kind === "expense" ? amountMinor : 0, occurrence.rule_id),
    prepareAudit(db, {
      userId: user.id,
      action: "personal.occurrence_posted",
      entityType: "transaction",
      entityId: transactionId,
      metadata: { occurrenceId: occurrence.id, amountMinor, via: "api.v1" },
      createdAt,
    }),
  ]);
  try {
    await rebuildPersonalSpaceBalance(db, occurrence.space_id);
  } catch { /* best-effort */ }

  return {
    id: occurrence.id,
    spaceId: occurrence.space_id,
    ruleId: occurrence.rule_id,
    status: "posted" as const,
    amountMinor,
    accountId,
    transactionId,
    postedAt: createdAt,
  };
}

export async function skipV1PersonalOccurrence(
  db: D1Database,
  user: RequestUser,
  spaceId: string,
  occurrenceId: string,
) {
  const occurrence = await db.prepare(
    "SELECT id,space_id,status,rule_id FROM personal_occurrences WHERE id=? AND space_id=?",
  ).bind(occurrenceId, spaceId).first<{ id: string; space_id: string; status: string; rule_id: string }>();
  if (!occurrence) throw new ApiError(404, "OCCURRENCE_NOT_FOUND");
  if (occurrence.status !== "pending") throw new ApiError(409, "OCCURRENCE_NOT_PENDING");
  const createdAt = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE personal_occurrences SET status='skipped' WHERE id=? AND status='pending'")
      .bind(occurrence.id),
    prepareAudit(db, {
      userId: user.id,
      action: "personal.occurrence_skipped",
      entityType: "personal_occurrence",
      entityId: occurrence.id,
      metadata: { ruleId: occurrence.rule_id, via: "api.v1" },
      createdAt,
    }),
  ]);
  return {
    id: occurrence.id,
    spaceId: occurrence.space_id,
    ruleId: occurrence.rule_id,
    status: "skipped" as const,
    skippedAt: createdAt,
  };
}

export async function assignV1PersonalOccurrenceAccount(
  db: D1Database,
  user: RequestUser,
  spaceId: string,
  occurrenceId: string,
  accountId: string,
) {
  const occurrence = await db.prepare(
    "SELECT id,space_id,status,rule_id FROM personal_occurrences WHERE id=? AND space_id=?",
  ).bind(occurrenceId, spaceId).first<{ id: string; space_id: string; status: string; rule_id: string }>();
  if (!occurrence) throw new ApiError(404, "OCCURRENCE_NOT_FOUND");
  if (occurrence.status !== "pending") throw new ApiError(409, "OCCURRENCE_NOT_PENDING");
  const account = await db.prepare(
    "SELECT id FROM personal_accounts WHERE id=? AND space_id=? AND status='active'",
  ).bind(accountId, spaceId).first();
  if (!account) throw new ApiError(400, "INVALID_ACCOUNT");
  const createdAt = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE personal_occurrences SET account_id=? WHERE id=? AND status='pending'")
      .bind(accountId, occurrence.id),
    prepareAudit(db, {
      userId: user.id,
      action: "personal.occurrence_account",
      entityType: "personal_occurrence",
      entityId: occurrence.id,
      metadata: { accountId, via: "api.v1" },
      createdAt,
    }),
  ]);
  return {
    id: occurrence.id,
    spaceId: occurrence.space_id,
    ruleId: occurrence.rule_id,
    accountId,
    status: "pending" as const,
    updatedAt: createdAt,
  };
}

export async function deferV1PersonalOccurrence(
  db: D1Database,
  user: RequestUser,
  spaceId: string,
  occurrenceId: string,
  deferUntil: string,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deferUntil)) throw new ApiError(400, "INVALID_OCCURRENCE");
  const occurrence = await db.prepare(
    "SELECT id,rule_id,space_id,period_key,status FROM personal_occurrences WHERE id=? AND space_id=?",
  ).bind(occurrenceId, spaceId).first<{
    id: string; rule_id: string; space_id: string; period_key: string; status: string;
  }>();
  if (!occurrence) throw new ApiError(404, "OCCURRENCE_NOT_FOUND");
  if (occurrence.status !== "pending") throw new ApiError(409, "OCCURRENCE_NOT_PENDING");

  const dueAt = `${deferUntil}T12:00:00.000Z`;
  if (Number.isNaN(new Date(dueAt).getTime())) throw new ApiError(400, "INVALID_START_DATE");
  const { periodKeyFromDate } = await import("./installments");
  const targetKey = periodKeyFromDate(dueAt);
  const clash = await db.prepare(
    "SELECT id FROM personal_occurrences WHERE rule_id=? AND period_key=? AND id<>?",
  ).bind(occurrence.rule_id, targetKey, occurrence.id).first<{ id: string }>();

  const createdAt = new Date().toISOString();
  if (clash) {
    await db.prepare("UPDATE personal_occurrences SET due_at=? WHERE id=? AND status='pending'")
      .bind(dueAt, occurrence.id).run();
  } else {
    await db.prepare("UPDATE personal_occurrences SET period_key=?, due_at=? WHERE id=? AND status='pending'")
      .bind(targetKey, dueAt, occurrence.id).run();
  }
  await prepareAudit(db, {
    userId: user.id,
    action: "personal.occurrence_deferred",
    entityType: "personal_occurrence",
    entityId: occurrence.id,
    metadata: { deferUntil, periodKey: clash ? occurrence.period_key : targetKey, via: "api.v1" },
    createdAt,
  }).run();

  return {
    id: occurrence.id,
    spaceId: occurrence.space_id,
    ruleId: occurrence.rule_id,
    periodKey: clash ? occurrence.period_key : targetKey,
    dueAt,
    status: "pending" as const,
    deferredAt: createdAt,
  };
}

export async function queueV1PersonalOccurrence(
  db: D1Database,
  user: RequestUser,
  space: { id: string; currency: string },
  input: { ruleId: string; periodKey: string; amount?: string | number },
) {
  if (!/^\d{4}-\d{2}$/.test(input.periodKey)) throw new ApiError(400, "INVALID_OCCURRENCE");
  const rule = await db.prepare("SELECT * FROM personal_rules WHERE id=? AND space_id=?")
    .bind(input.ruleId, space.id).first<{
      id: string; space_id: string; account_id: string | null; amount_minor: number; due_day: number; status: string;
    }>();
  if (!rule) throw new ApiError(404, "RULE_NOT_FOUND");
  if (rule.status !== "active") throw new ApiError(409, "RULE_NOT_ACTIVE");

  let amountMinor = Number(rule.amount_minor);
  try {
    if (input.amount !== undefined && input.amount !== "") {
      amountMinor = parseMoneyToMinor(input.amount, space.currency);
    }
  } catch {
    throw new ApiError(400, "INVALID_AMOUNT");
  }
  if (amountMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT");

  const { dueAtForPeriod } = await import("./personal-finance");
  const createdAt = new Date().toISOString();
  const id = crypto.randomUUID();
  const dueAt = dueAtForPeriod(input.periodKey, Number(rule.due_day) || 1);
  const existing = await db.prepare(
    "SELECT id FROM personal_occurrences WHERE rule_id=? AND period_key=? LIMIT 1",
  ).bind(rule.id, input.periodKey).first<{ id: string }>();
  if (existing) throw new ApiError(409, "OCCURRENCE_EXISTS");

  await db.batch([
    db.prepare(
      "INSERT INTO personal_occurrences (id,rule_id,space_id,account_id,period_key,due_at,expected_minor,actual_minor,status,transaction_id,created_at) VALUES (?,?,?,?,?,?,?,NULL,'pending',NULL,?)",
    ).bind(id, rule.id, rule.space_id, rule.account_id, input.periodKey, dueAt, amountMinor, createdAt),
    prepareAudit(db, {
      userId: user.id,
      action: "personal.occurrence_queued",
      entityType: "personal_occurrence",
      entityId: id,
      metadata: { ruleId: rule.id, periodKey: input.periodKey, amountMinor, via: "api.v1" },
      createdAt,
    }),
  ]);

  return {
    id,
    spaceId: rule.space_id,
    ruleId: rule.id,
    accountId: rule.account_id,
    periodKey: input.periodKey,
    dueAt,
    expectedMinor: amountMinor,
    status: "pending" as const,
    createdAt,
  };
}
