/** Business API v1 — withdraw personal surplus (extra_minor) with treasurer permission. */

import type { RequestUser } from "../db/runtime";
import { prepareAudit } from "./audit";
import { ApiError } from "./security";
import { parseMoneyToMinor } from "./money";

export type V1SurplusWithdrawInput = {
  memberId: string;
  amount: string | number;
  description?: string;
};

export async function withdrawV1Surplus(
  db: D1Database,
  user: RequestUser,
  space: { id: string; currency: string; owner_user_id: string },
  input: V1SurplusWithdrawInput,
) {
  const { assertOwnerPlanQuota } = await import("../services/admin/billing-service");
  await assertOwnerPlanQuota(db, space.owner_user_id, "transaction", 1);

  const member = await db.prepare(
    "SELECT id,display_name,extra_minor FROM members WHERE id=? AND space_id=? AND status='active'",
  ).bind(input.memberId, space.id).first<{ id: string; display_name: string; extra_minor: number }>();
  if (!member) throw new ApiError(400, "INVALID_MEMBER");

  let amountMinor: number;
  try {
    amountMinor = parseMoneyToMinor(input.amount, space.currency);
  } catch {
    throw new ApiError(400, "INVALID_AMOUNT");
  }
  if (amountMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT");
  if (Number(member.extra_minor) < amountMinor) throw new ApiError(409, "INSUFFICIENT_PERSONAL_RESERVE");

  const transactionId = crypto.randomUUID();
  const entryId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const description = input.description?.trim() || `استرداد فائض · ${member.display_name}`;

  await db.batch([
    db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,'personal_reserve',?,?,?,'approved',?,?)")
      .bind(transactionId, space.id, user.id, member.id, "reimbursement", amountMinor, description, description, createdAt, createdAt),
    db.prepare("UPDATE members SET extra_minor = extra_minor - ? WHERE id = ? AND space_id = ?")
      .bind(amountMinor, member.id, space.id),
    db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
      .bind(entryId, space.id, transactionId, user.id, description, createdAt, createdAt),
    db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), entryId, "liability:member_reserve", member.id, amountMinor, 0, createdAt),
    db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), entryId, "asset:cash", member.id, 0, amountMinor, createdAt),
    prepareAudit(db, {
      userId: user.id,
      action: "surplus.withdrawn",
      entityType: "member",
      entityId: member.id,
      metadata: { spaceId: space.id, amountMinor, transactionId, via: "api.v1" },
      createdAt,
    }),
  ]);

  return {
    transactionId,
    memberId: member.id,
    amountMinor,
    remainingExtraMinor: Number(member.extra_minor) - amountMinor,
    description,
  };
}
