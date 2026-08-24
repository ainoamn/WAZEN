/** Business API v1 — update member role or soft-deactivate. */

import type { RequestUser } from "../db/runtime";
import { prepareAudit } from "./audit";
import { ApiError } from "./security";

export type V1MemberPatchInput = {
  role?: "member" | "treasurer" | "manager" | "auditor" | "viewer";
  status?: "active" | "inactive";
  displayName?: string;
};

export async function patchV1Member(
  db: D1Database,
  user: RequestUser,
  space: { id: string; owner_user_id: string },
  memberId: string,
  input: V1MemberPatchInput,
) {
  if (!input.role && !input.status && input.displayName === undefined) {
    throw new ApiError(400, "INVALID_MEMBER_PATCH");
  }

  const member = await db.prepare(
    "SELECT id,display_name,role,status,user_id FROM members WHERE id=? AND space_id=?",
  ).bind(memberId, space.id).first<{
    id: string; display_name: string; role: string; status: string; user_id: string | null;
  }>();
  if (!member) throw new ApiError(404, "MEMBER_NOT_FOUND");

  // Do not demote/remove the space owner membership row if linked to owner.
  if (member.user_id && member.user_id === space.owner_user_id && input.status === "inactive") {
    throw new ApiError(403, "OWNER_MEMBER_LOCKED");
  }

  const displayName = input.displayName?.trim();
  if (displayName !== undefined && (displayName.length < 2 || displayName.length > 80)) {
    throw new ApiError(400, "INVALID_MEMBER");
  }

  const nextRole = input.role ?? member.role;
  const nextStatus = input.status ?? member.status;
  const nextName = displayName ?? member.display_name;
  const createdAt = new Date().toISOString();

  await db.batch([
    db.prepare("UPDATE members SET display_name=?, role=?, status=? WHERE id=? AND space_id=?")
      .bind(nextName, nextRole, nextStatus, memberId, space.id),
    prepareAudit(db, {
      userId: user.id,
      action: "member.updated",
      entityType: "member",
      entityId: memberId,
      metadata: {
        spaceId: space.id,
        role: nextRole,
        status: nextStatus,
        displayName: nextName,
        via: "api.v1",
      },
      createdAt,
    }),
  ]);

  if (nextStatus === "inactive") {
    await db.prepare(`
      UPDATE spaces SET goal_minor = COALESCE((SELECT SUM(due_minor) FROM members WHERE space_id=? AND status='active'), 0)
      WHERE id=?
    `).bind(space.id, space.id).run().catch(() => {});
  }

  return {
    id: memberId,
    spaceId: space.id,
    displayName: nextName,
    role: nextRole,
    status: nextStatus,
  };
}
