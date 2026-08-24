/** Business API v1 — record a contribution payment with mandatory/surplus split. */

import type { RequestUser } from "../db/runtime";
import { prepareAudit } from "./audit";
import { ApiError } from "./security";
import { parseMoneyToMinor } from "./money";
import { splitContributionPayment, type ExtraPolicy } from "./finance";

export type V1ContributionInput = {
  memberId: string;
  amount: string | number;
  description?: string;
  extraPolicy?: ExtraPolicy;
  occurredAt?: string;
};

export async function recordV1Contribution(
  db: D1Database,
  user: RequestUser,
  space: { id: string; currency: string; owner_user_id: string; type: string },
  input: V1ContributionInput,
) {
  if (!["household", "trip", "society", "group"].includes(space.type)) {
    throw new ApiError(400, "INVALID_WALLET_TYPE");
  }
  const { assertOwnerPlanQuota } = await import("../services/admin/billing-service");
  await assertOwnerPlanQuota(db, space.owner_user_id, "transaction", 2);

  const member = await db.prepare(
    "SELECT id,display_name,due_minor,paid_minor,extra_minor FROM members WHERE id=? AND space_id=? AND status='active'",
  ).bind(input.memberId, space.id).first<{
    id: string; display_name: string; due_minor: number; paid_minor: number; extra_minor: number;
  }>();
  if (!member) throw new ApiError(400, "INVALID_MEMBER");

  const plan = await db.prepare(
    "SELECT amount_minor FROM contribution_plans WHERE space_id=? ORDER BY starts_at LIMIT 1",
  ).bind(space.id).first<{ amount_minor: number }>();
  if (!plan) throw new ApiError(400, "CONTRIBUTION_PLAN_REQUIRED");

  let amountMinor: number;
  try {
    amountMinor = parseMoneyToMinor(input.amount, space.currency);
  } catch {
    throw new ApiError(400, "INVALID_AMOUNT");
  }
  if (amountMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT");

  const remainingDueMinor = Math.max(0, Number(member.due_minor) - Number(member.paid_minor));
  const policy = (input.extraPolicy ?? "advance_credit") as ExtraPolicy;
  let split;
  try {
    split = splitContributionPayment(amountMinor, Number(plan.amount_minor), {
      remainingDueMinor,
      extraPolicy: policy,
    });
  } catch {
    throw new ApiError(400, "INVALID_CONTRIBUTION_SPLIT");
  }

  const createdAt = new Date().toISOString();
  const occurredAt = input.occurredAt ?? createdAt;
  if (Number.isNaN(Date.parse(occurredAt))) throw new ApiError(400, "INVALID_OCCURRED_AT");
  const baseDescription = input.description?.trim() || `مساهمة ${member.display_name}`;
  const transactionIds: string[] = [];
  const statements: D1PreparedStatement[] = [];

  if (split.mandatoryMinor > 0) {
    const transactionId = crypto.randomUUID();
    const entryId = crypto.randomUUID();
    transactionIds.push(transactionId);
    const description = `${baseDescription} · إلزامي`;
    statements.push(
      db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,'mandatory',?,?,?,'approved',?,?)")
        .bind(transactionId, space.id, user.id, member.id, "contribution", split.mandatoryMinor, description, description, occurredAt, createdAt),
      db.prepare("UPDATE spaces SET balance_minor = balance_minor + ? WHERE id = ?").bind(split.mandatoryMinor, space.id),
      db.prepare("UPDATE members SET paid_minor = paid_minor + ? WHERE id = ? AND space_id = ?")
        .bind(split.mandatoryMinor, member.id, space.id),
      db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
        .bind(entryId, space.id, transactionId, user.id, description, occurredAt, createdAt),
      db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), entryId, "asset:cash", member.id, split.mandatoryMinor, 0, createdAt),
      db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), entryId, "income:contribution", member.id, 0, split.mandatoryMinor, createdAt),
    );
  }

  if (split.surplusMinor > 0 && policy === "personal_reserve") {
    const transactionId = crypto.randomUUID();
    const entryId = crypto.randomUUID();
    transactionIds.push(transactionId);
    const description = `${baseDescription} · فائض شخصي`;
    statements.push(
      db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,'personal_reserve',?,?,?,'approved',?,?)")
        .bind(transactionId, space.id, user.id, member.id, "contribution", split.surplusMinor, description, description, occurredAt, createdAt),
      db.prepare("UPDATE members SET extra_minor = extra_minor + ? WHERE id = ? AND space_id = ?")
        .bind(split.surplusMinor, member.id, space.id),
      db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
        .bind(entryId, space.id, transactionId, user.id, description, occurredAt, createdAt),
      db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), entryId, "asset:cash", member.id, split.surplusMinor, 0, createdAt),
      db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), entryId, "liability:member_reserve", member.id, 0, split.surplusMinor, createdAt),
    );
  } else if (split.surplusMinor > 0) {
    const transactionId = crypto.randomUUID();
    const entryId = crypto.randomUUID();
    transactionIds.push(transactionId);
    const allocation = policy === "advance_credit" ? "advance" : "general";
    const description = `${baseDescription} · ${policy === "advance_credit" ? "مقدم" : "تطوع للصندوق"}`;
    statements.push(
      db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?,?,'approved',?,?)")
        .bind(transactionId, space.id, user.id, member.id, "contribution", allocation, split.surplusMinor, description, description, occurredAt, createdAt),
      db.prepare("UPDATE spaces SET balance_minor = balance_minor + ? WHERE id = ?").bind(split.surplusMinor, space.id),
      db.prepare("UPDATE members SET paid_minor = paid_minor + ? WHERE id = ? AND space_id = ?")
        .bind(split.surplusMinor, member.id, space.id),
      db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
        .bind(entryId, space.id, transactionId, user.id, description, occurredAt, createdAt),
      db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), entryId, "asset:cash", member.id, split.surplusMinor, 0, createdAt),
      db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), entryId, "income:contribution", member.id, 0, split.surplusMinor, createdAt),
    );
  }

  if (!statements.length) throw new ApiError(400, "INVALID_CONTRIBUTION_PAYMENT");

  statements.push(prepareAudit(db, {
    userId: user.id,
    action: "contribution.recorded",
    entityType: "member",
    entityId: member.id,
    metadata: {
      spaceId: space.id,
      amountMinor,
      mandatoryMinor: split.mandatoryMinor,
      surplusMinor: split.surplusMinor,
      policy,
      transactionIds,
      via: "api.v1",
    },
    createdAt,
  }));
  await db.batch(statements);

  return {
    memberId: member.id,
    amountMinor,
    mandatoryMinor: split.mandatoryMinor,
    surplusMinor: split.surplusMinor,
    extraPolicy: policy,
    transactionIds,
  };
}
