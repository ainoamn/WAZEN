/** Business API v1 — smart pay preview and apply. */

import type { RequestUser } from "../db/runtime";
import { prepareAudit } from "./audit";
import { splitContributionPayment } from "./finance";
import { paymentInstallmentStatements } from "./installment-payments";
import { allocateOldestFirst, remainingInstallmentMinor, type InstallmentLike } from "./installments";
import { parseMoneyToMinor } from "./money";
import { planHasFeature } from "./plan-features";
import { ApiError } from "./security";

async function loadMemberAndPlan(db: D1Database, spaceId: string, memberId: string) {
  const member = await db.prepare(
    "SELECT id,space_id,display_name,due_minor,paid_minor,extra_minor FROM members WHERE id=? AND space_id=? AND status='active'",
  ).bind(memberId, spaceId).first<{
    id: string; space_id: string; display_name: string;
    due_minor: number; paid_minor: number; extra_minor: number;
  }>();
  if (!member) throw new ApiError(400, "INVALID_MEMBER");
  const plan = await db.prepare(
    "SELECT amount_minor,duration_months,starts_at FROM contribution_plans WHERE space_id=? ORDER BY starts_at LIMIT 1",
  ).bind(spaceId).first<{ amount_minor: number; duration_months: number; starts_at: string }>();
  return { member, plan };
}

export async function previewV1MemberPay(
  db: D1Database,
  space: { id: string; currency: string; owner_user_id: string },
  memberId: string,
  input: { amount: string | number; selectedIds?: string[] },
) {
  const { getActivePlanEntitlements } = await import("../services/admin/billing-service");
  const entitlements = await getActivePlanEntitlements(db, space.owner_user_id, {
    skipSideEffects: true,
    skipUsage: true,
  });
  if (!planHasFeature(entitlements.features, "smart_accountant")) {
    throw new ApiError(403, "PLAN_FEATURE_REQUIRED");
  }

  const { member, plan } = await loadMemberAndPlan(db, space.id, memberId);
  let amountMinor: number;
  try {
    amountMinor = parseMoneyToMinor(input.amount, space.currency);
  } catch {
    throw new ApiError(400, "INVALID_AMOUNT");
  }
  if (amountMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT");

  const remainingDueMinor = Math.max(0, Number(member.due_minor) - Number(member.paid_minor));
  let split;
  try {
    split = splitContributionPayment(amountMinor, Number(plan?.amount_minor ?? remainingDueMinor), {
      remainingDueMinor,
      extraPolicy: "advance_credit",
    });
  } catch {
    throw new ApiError(400, "INVALID_CONTRIBUTION_SPLIT");
  }

  let installments = (await db.prepare(
    "SELECT id,period_index,period_key,amount_minor,paid_minor,status FROM member_installments WHERE member_id=? ORDER BY period_index",
  ).bind(member.id).all<InstallmentLike>()).results ?? [];

  if (!installments.length && plan && Number(plan.amount_minor) > 0) {
    const { buildInstallmentSchedule } = await import("./installments");
    installments = buildInstallmentSchedule({
      memberId: member.id,
      spaceId: member.space_id,
      startAt: plan.starts_at || new Date().toISOString(),
      durationMonths: Number(plan.duration_months) || 12,
      amountMinor: Number(plan.amount_minor),
      paidMinor: Number(member.paid_minor),
    }).rows;
  }

  const allocated = split.mandatoryMinor > 0 && installments.length
    ? allocateOldestFirst(installments, split.mandatoryMinor, input.selectedIds)
    : { allocations: [], appliedMinor: 0, leftoverMinor: split.mandatoryMinor };

  return {
    memberId: member.id,
    amountMinor,
    mandatoryMinor: split.mandatoryMinor,
    surplusMinor: split.surplusMinor,
    remainingDueMinor,
    openInstallments: installments
      .filter((row) => remainingInstallmentMinor(row) > 0)
      .map((row) => ({
        id: row.id,
        periodIndex: row.period_index,
        periodKey: row.period_key,
        amountMinor: Number(row.amount_minor),
        paidMinor: Number(row.paid_minor),
        remainingMinor: remainingInstallmentMinor(row),
        status: row.status,
      })),
    allocations: allocated.allocations.map((item) => ({
      installmentId: item.installmentId,
      periodKey: item.periodKey,
      periodIndex: item.periodIndex,
      amountMinor: item.amountMinor,
    })),
    appliedMinor: allocated.appliedMinor,
    leftoverMinor: allocated.leftoverMinor,
  };
}

export async function applyV1SmartPay(
  db: D1Database,
  user: RequestUser,
  space: { id: string; currency: string; owner_user_id: string; type: string },
  memberId: string,
  input: { amount: string | number; selectedIds?: string[]; description?: string },
) {
  if (!["household", "trip", "society", "group"].includes(space.type)) {
    throw new ApiError(400, "INVALID_WALLET_TYPE");
  }
  const { getActivePlanEntitlements, assertOwnerPlanQuota } = await import("../services/admin/billing-service");
  const entitlements = await getActivePlanEntitlements(db, space.owner_user_id, {
    skipSideEffects: true,
    skipUsage: true,
  });
  if (!planHasFeature(entitlements.features, "smart_accountant")) {
    throw new ApiError(403, "PLAN_FEATURE_REQUIRED");
  }
  await assertOwnerPlanQuota(db, space.owner_user_id, "transaction", 2);

  const { member, plan } = await loadMemberAndPlan(db, space.id, memberId);
  let amountMinor: number;
  try {
    amountMinor = parseMoneyToMinor(input.amount, space.currency);
  } catch {
    throw new ApiError(400, "INVALID_AMOUNT");
  }
  if (amountMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT");

  const remainingDueMinor = Math.max(0, Number(member.due_minor) - Number(member.paid_minor));
  let split;
  try {
    split = splitContributionPayment(amountMinor, Number(plan?.amount_minor ?? remainingDueMinor), {
      remainingDueMinor,
      extraPolicy: "advance_credit",
    });
  } catch {
    throw new ApiError(400, "INVALID_CONTRIBUTION_SPLIT");
  }

  const createdAt = new Date().toISOString();
  const description = input.description?.trim() || `محاسب ذكي · ${member.display_name}`;
  const statements: D1PreparedStatement[] = [];
  const transactionIds: string[] = [];
  let allocations: Array<{ installmentId: string; periodKey: string; amountMinor: number }> = [];
  let appliedMandatory = 0;

  if (split.mandatoryMinor > 0) {
    const installmentWork = await paymentInstallmentStatements(
      db, member, plan, split.mandatoryMinor, createdAt, input.selectedIds,
    );
    const applied = installmentWork.allocated.appliedMinor || split.mandatoryMinor;
    appliedMandatory = applied;
    allocations = installmentWork.allocated.allocations.map((item) => ({
      installmentId: item.installmentId,
      periodKey: item.periodKey,
      amountMinor: item.amountMinor,
    }));
    const transactionId = crypto.randomUUID();
    transactionIds.push(transactionId);
    const entryId = crypto.randomUUID();
    const months = installmentWork.allocated.allocations.map((item) => item.periodKey).join(", ");
    const lineDescription = `${description} · سداد ${months || "مطالبات"}`;
    statements.push(
      ...installmentWork.statements,
      db.prepare("INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)")
        .bind(transactionId, space.id, user.id, member.id, "contribution", "mandatory", applied, lineDescription, lineDescription, createdAt, createdAt),
      db.prepare("UPDATE spaces SET balance_minor = balance_minor + ? WHERE id = ?").bind(applied, space.id),
      db.prepare("UPDATE members SET paid_minor = paid_minor + ? WHERE id = ? AND space_id = ?")
        .bind(applied, member.id, space.id),
      db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
        .bind(entryId, space.id, transactionId, user.id, lineDescription, createdAt, createdAt),
      db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), entryId, "asset:cash", member.id, applied, 0, createdAt),
      db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), entryId, "income:contribution", member.id, 0, applied, createdAt),
    );
  }

  if (split.surplusMinor > 0) {
    const transactionId = crypto.randomUUID();
    transactionIds.push(transactionId);
    const entryId = crypto.randomUUID();
    const lineDescription = `${description} · مقدّم`;
    statements.push(
      db.prepare("INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)")
        .bind(transactionId, space.id, user.id, member.id, "contribution", "advance", split.surplusMinor, lineDescription, lineDescription, createdAt, createdAt),
      db.prepare("UPDATE spaces SET balance_minor = balance_minor + ? WHERE id = ?").bind(split.surplusMinor, space.id),
      db.prepare("UPDATE members SET extra_minor = extra_minor + ? WHERE id = ? AND space_id = ?")
        .bind(split.surplusMinor, member.id, space.id),
      db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
        .bind(entryId, space.id, transactionId, user.id, lineDescription, createdAt, createdAt),
      db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), entryId, "asset:cash", member.id, split.surplusMinor, 0, createdAt),
      db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), entryId, "liability:advance", member.id, 0, split.surplusMinor, createdAt),
    );
  }

  if (!statements.length) throw new ApiError(400, "EMPTY_PAYMENT");
  statements.push(prepareAudit(db, {
    userId: user.id,
    action: "smart_pay.applied",
    entityType: "member",
    entityId: member.id,
    metadata: {
      spaceId: space.id,
      amountMinor,
      mandatoryMinor: appliedMandatory,
      surplusMinor: split.surplusMinor,
      transactionIds,
      via: "api.v1",
    },
    createdAt,
  }));
  await db.batch(statements);

  return {
    memberId: member.id,
    spaceId: space.id,
    amountMinor,
    mandatoryMinor: appliedMandatory,
    surplusMinor: split.surplusMinor,
    allocations,
    transactionIds,
    appliedAt: createdAt,
  };
}
