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
