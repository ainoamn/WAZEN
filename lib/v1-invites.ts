/** Business API v1 — invite a member by email. */

import type { RequestUser } from "../db/runtime";
import { prepareAudit } from "./audit";
import { ApiError } from "./security";
import { sha256 } from "./auth";
import { normalizeEmail } from "./auth";

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

  const duplicate = await db.prepare(
    "SELECT id FROM invites WHERE space_id=? AND email=? COLLATE NOCASE AND status='pending' AND expires_at>?",
  ).bind(space.id, email, now).first();
  if (duplicate) throw new ApiError(409, "INVITATION_EXISTS");

  const invitationId = crypto.randomUUID();
  const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const createdAt = now;
  const link = `${input.origin.replace(/\/$/, "")}/invite?token=${encodeURIComponent(token)}`;

  await db.batch([
    db.prepare("INSERT INTO invites VALUES (?,?,?,?,?,'pending',?,?,?)")
      .bind(invitationId, space.id, email, role, tokenHash, expiresAt, user.id, createdAt),
    db.prepare("INSERT INTO email_outbox (id,recipient,template,payload_json,status,created_at) VALUES (?,?,?,?,'pending',?)")
      .bind(crypto.randomUUID(), email, "member_invitation", JSON.stringify({
        invitationId,
        inviter: user.displayName,
        link,
        via: "api.v1",
      }), createdAt),
    prepareAudit(db, {
      userId: user.id,
      action: "member.invited",
      entityType: "invite",
      entityId: invitationId,
      metadata: { spaceId: space.id, email, role, via: "api.v1" },
      createdAt,
    }),
  ]);

  return {
    id: invitationId,
    email,
    role,
    expiresAt,
    delivery: "queued" as const,
  };
}
