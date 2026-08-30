/** Soft-archive or hard-remove a space member from the dashboard. */

import { prepareAudit } from "./audit";
import { ApiError } from "./security";

export type MemberRemovalResult = {
  memberId: string;
  spaceId: string;
  mode: "archived" | "removed";
};

async function memberHasContributionHistory(db: D1Database, memberId: string, spaceId: string) {
  const member = await db.prepare(
    "SELECT paid_minor,extra_minor,COALESCE(addon_minor,0) AS addon_minor FROM members WHERE id=? AND space_id=?",
  ).bind(memberId, spaceId).first<{ paid_minor: number; extra_minor: number; addon_minor: number }>();
  if (!member) return false;
  if (Number(member.paid_minor) > 0 || Number(member.extra_minor) > 0 || Number(member.addon_minor) > 0) return true;

  const txn = await db.prepare(
    "SELECT id FROM transactions WHERE space_id=? AND member_id=? LIMIT 1",
  ).bind(spaceId, memberId).first();
  if (txn) return true;

  const split = await db.prepare(
    "SELECT id FROM expense_splits WHERE member_id=? LIMIT 1",
  ).bind(memberId).first().catch(() => null);
  if (split) return true;

  const settlement = await db.prepare(
    "SELECT id FROM settlements WHERE space_id=? AND (from_member_id=? OR to_member_id=?) LIMIT 1",
  ).bind(spaceId, memberId, memberId).first().catch(() => null);
  if (settlement) return true;

  const paidInstallment = await db.prepare(
    "SELECT id FROM member_installments WHERE member_id=? AND paid_minor>0 LIMIT 1",
  ).bind(memberId).first();
  return Boolean(paidInstallment);
}

/** Cancel unpaid future installments so archived members accrue no new arrears. */
export async function cancelFutureMemberInstallments(db: D1Database, memberId: string, asOf = new Date()) {
  const asOfIso = asOf.toISOString();
  await db.prepare(
    `DELETE FROM member_installments
     WHERE member_id=? AND paid_minor=0 AND status IN ('unpaid','partial') AND due_at>?`,
  ).bind(memberId, asOfIso).run();

  const remaining = await db.prepare(
    "SELECT COALESCE(SUM(amount_minor),0) AS due FROM member_installments WHERE member_id=?",
  ).bind(memberId).first<{ due: number }>();
  const paid = await db.prepare(
    "SELECT paid_minor FROM members WHERE id=?",
  ).bind(memberId).first<{ paid_minor: number }>();
  const dueMinor = Math.max(Number(remaining?.due ?? 0), Number(paid?.paid_minor ?? 0));
  await db.prepare("UPDATE members SET due_minor=? WHERE id=?").bind(dueMinor, memberId).run();
}

export async function archiveOrRemoveSpaceMember(input: {
  db: D1Database;
  actorUserId: string;
  space: { id: string; owner_user_id: string };
  memberId: string;
  /** Force archive even with no history; force remove only if no history. */
  prefer?: "archive" | "remove" | "auto";
}): Promise<MemberRemovalResult> {
  const member = await input.db.prepare(
    "SELECT id,space_id,user_id,role,status,display_name,paid_minor FROM members WHERE id=? AND space_id=? LIMIT 1",
  ).bind(input.memberId, input.space.id).first<{
    id: string;
    space_id: string;
    user_id: string | null;
    role: string;
    status: string;
    display_name: string;
    paid_minor: number;
  }>();
  if (!member) throw new ApiError(404, "MEMBER_NOT_FOUND");
  if (member.user_id && member.user_id === input.space.owner_user_id) {
    throw new ApiError(403, "OWNER_MEMBER_LOCKED");
  }
  if (member.role === "owner") throw new ApiError(403, "OWNER_MEMBER_LOCKED");

  const prefer = input.prefer ?? "auto";
  const hasHistory = await memberHasContributionHistory(input.db, member.id, input.space.id);
  const createdAt = new Date().toISOString();

  if (prefer === "remove" && hasHistory) {
    throw new ApiError(409, "MEMBER_HAS_HISTORY");
  }

  const archive = prefer === "archive" || (prefer === "auto" && hasHistory);

  if (archive) {
    await input.db.batch([
      input.db.prepare("UPDATE members SET status='inactive' WHERE id=? AND space_id=?")
        .bind(member.id, input.space.id),
      prepareAudit(input.db, {
        userId: input.actorUserId,
        action: "member.archived",
        entityType: "member",
        entityId: member.id,
        metadata: { spaceId: input.space.id, displayName: member.display_name, via: "dashboard" },
        createdAt,
      }),
    ]);
    await cancelFutureMemberInstallments(input.db, member.id);
    await input.db.prepare(
      `UPDATE spaces SET goal_minor = COALESCE((SELECT SUM(due_minor) FROM members WHERE space_id=? AND status='active'), 0) WHERE id=?`,
    ).bind(input.space.id, input.space.id).run();
    return { memberId: member.id, spaceId: input.space.id, mode: "archived" };
  }

  await input.db.batch([
    input.db.prepare("DELETE FROM member_installments WHERE member_id=?").bind(member.id),
    input.db.prepare("DELETE FROM members WHERE id=? AND space_id=?").bind(member.id, input.space.id),
    prepareAudit(input.db, {
      userId: input.actorUserId,
      action: "member.removed",
      entityType: "member",
      entityId: member.id,
      metadata: { spaceId: input.space.id, displayName: member.display_name, via: "dashboard" },
      createdAt,
    }),
  ]);
  await input.db.prepare(
    `UPDATE spaces SET goal_minor = COALESCE((SELECT SUM(due_minor) FROM members WHERE space_id=? AND status='active'), 0) WHERE id=?`,
  ).bind(input.space.id, input.space.id).run();
  return { memberId: member.id, spaceId: input.space.id, mode: "removed" };
}

export async function restoreArchivedMember(input: {
  db: D1Database;
  actorUserId: string;
  spaceId: string;
  memberId: string;
}) {
  const member = await input.db.prepare(
    "SELECT id,status,display_name FROM members WHERE id=? AND space_id=? LIMIT 1",
  ).bind(input.memberId, input.spaceId).first<{ id: string; status: string; display_name: string }>();
  if (!member) throw new ApiError(404, "MEMBER_NOT_FOUND");
  if (member.status === "active") return { memberId: member.id, spaceId: input.spaceId, mode: "active" as const };

  const createdAt = new Date().toISOString();
  await input.db.batch([
    input.db.prepare("UPDATE members SET status='active' WHERE id=? AND space_id=?")
      .bind(member.id, input.spaceId),
    prepareAudit(input.db, {
      userId: input.actorUserId,
      action: "member.restored",
      entityType: "member",
      entityId: member.id,
      metadata: { spaceId: input.spaceId, displayName: member.display_name, via: "dashboard" },
      createdAt,
    }),
  ]);
  await input.db.prepare(
    `UPDATE spaces SET goal_minor = COALESCE((SELECT SUM(due_minor) FROM members WHERE space_id=? AND status='active'), 0) WHERE id=?`,
  ).bind(input.spaceId, input.spaceId).run();
  return { memberId: member.id, spaceId: input.spaceId, mode: "active" as const };
}
