/** Business API v1 — invite a member by email. */

import type { RequestUser } from "../db/runtime";
import { ApiError } from "./security";
import { normalizeEmail } from "./auth";
import { sendSpaceMemberInvite } from "./member-invite";

export type V1InviteInput = {
  email: string;
  role?: "member" | "treasurer" | "manager" | "auditor" | "viewer";
  origin: string;
};

export async function createV1Invite(
  db: D1Database,
  user: RequestUser,
  space: { id: string; owner_user_id: string },
  input: V1InviteInput,
) {
  const email = normalizeEmail(input.email);
  const role = input.role ?? "member";
  const { getActivePlanEntitlements, assertOwnerPlanQuota } = await import("../services/admin/billing-service");
  const entitlements = await getActivePlanEntitlements(db, space.owner_user_id, { skipSideEffects: true, skipUsage: true });
  const now = new Date().toISOString();
  const memberCount = await db.prepare(`
    SELECT (SELECT COUNT(*) FROM members WHERE space_id=? AND status='active') +
      (SELECT COUNT(*) FROM invites WHERE space_id=? AND status='pending' AND expires_at>?) AS count
  `).bind(space.id, space.id, now).first<{ count: number }>();
  if (Number(memberCount?.count ?? 0) >= entitlements.memberLimit) throw new ApiError(403, "PLAN_MEMBER_LIMIT");

  const pending = await db.prepare(`
    SELECT COUNT(*) AS count FROM invites i JOIN spaces s ON s.id=i.space_id
    WHERE s.owner_user_id=? AND i.status='pending' AND i.expires_at>?
  `).bind(space.owner_user_id, now).first<{ count: number }>();
  await assertOwnerPlanQuota(db, space.owner_user_id, "user", 1 + Number(pending?.count ?? 0));

  const invitation = await sendSpaceMemberInvite({
    db,
    spaceId: space.id,
    email,
    role,
    inviterUserId: user.id,
    inviterDisplayName: user.displayName,
    origin: input.origin,
    flush: true,
    via: "api.v1",
  });

  return {
    id: invitation.invitationId,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    delivery: invitation.delivery,
  };
}
