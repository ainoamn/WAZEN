/** Pending wallet invites for already-registered users (in-app accept + alerts). */

import { normalizeEmail } from "./auth";
import { prepareAudit, writeAudit } from "./audit";
import { multiplyMinor } from "./money";
import { ApiError } from "./security";
import { assertOwnerPlanQuota } from "../services/admin/billing-service";
import { upsertUserNotifications } from "./user-notifications";

export type PendingInviteRow = {
  id: string;
  spaceId: string;
  role: string;
  email: string;
  expiresAt: string;
  spaceNameAr: string | null;
  spaceNameEn: string | null;
  inviterName: string | null;
};

export async function listPendingInvitesForEmail(db: D1Database, email: string): Promise<PendingInviteRow[]> {
  const normalized = normalizeEmail(email);
  if (!normalized) return [];
  const now = new Date().toISOString();
  const rows = await db.prepare(
    `SELECT i.id, i.space_id, i.role, i.email, i.expires_at, s.name_ar, s.name_en, u.display_name AS inviter_name
     FROM invites i
     LEFT JOIN spaces s ON s.id = i.space_id
     LEFT JOIN users u ON u.id = i.created_by
     WHERE i.status='pending' AND i.email=? COLLATE NOCASE AND i.expires_at>?
     ORDER BY i.created_at DESC
     LIMIT 12`,
  ).bind(normalized, now).all<{
    id: string;
    space_id: string;
    role: string;
    email: string;
    expires_at: string;
    name_ar: string | null;
    name_en: string | null;
    inviter_name: string | null;
  }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    spaceId: row.space_id,
    role: row.role,
    email: normalizeEmail(row.email),
    expiresAt: row.expires_at,
    spaceNameAr: row.name_ar,
    spaceNameEn: row.name_en,
    inviterName: row.inviter_name,
  }));
}

export function pendingInvitesAsWorkspaceAlerts(invites: PendingInviteRow[]) {
  return invites.map((invite) => {
    const nameAr = invite.spaceNameAr || "محفظة مشتركة";
    const nameEn = invite.spaceNameEn || "a shared wallet";
    const whoAr = invite.inviterName ? ` من ${invite.inviterName}` : "";
    const whoEn = invite.inviterName ? ` from ${invite.inviterName}` : "";
    return {
      id: `invite:${invite.id}`,
      severity: "warning" as const,
      href: `/home?acceptInvite=${encodeURIComponent(invite.id)}`,
      inviteId: invite.id,
      ar: `دعوة للانضمام إلى «${nameAr}»${whoAr} — وافق من الشاشة الرئيسية أو الإشعارات.`,
      en: `Invitation to join “${nameEn}”${whoEn} — accept from Home or notifications.`,
    };
  });
}

/** Notify an existing Wazen account about a new wallet invite (bell + top banner via GET). */
export async function notifyExistingUserOfInvite(input: {
  db: D1Database;
  email: string;
  invitationId: string;
  spaceId: string;
  inviterDisplayName: string;
}) {
  const normalized = normalizeEmail(input.email);
  if (!normalized) return { notifiedUserId: null as string | null };
  const invitee = await input.db.prepare(
    "SELECT id FROM users WHERE email=? COLLATE NOCASE LIMIT 1",
  ).bind(normalized).first<{ id: string }>();
  if (!invitee) return { notifiedUserId: null as string | null };

  const space = await input.db.prepare(
    "SELECT name_ar, name_en FROM spaces WHERE id=? LIMIT 1",
  ).bind(input.spaceId).first<{ name_ar: string; name_en: string }>();
  const nameAr = space?.name_ar || "محفظة مشتركة";
  const nameEn = space?.name_en || "a shared wallet";
  const inviter = input.inviterDisplayName.trim() || "Wazen";

  await upsertUserNotifications(input.db, invitee.id, [{
    id: `invite:${input.invitationId}`,
    severity: "warning",
    href: `/home?acceptInvite=${encodeURIComponent(input.invitationId)}`,
    ar: `دعوة من ${inviter} للانضمام إلى «${nameAr}». وافق من الشاشة الرئيسية أو جرس الإشعارات.`,
    en: `Invite from ${inviter} to join “${nameEn}”. Accept from Home or the notification bell.`,
  }]);

  return { notifiedUserId: invitee.id };
}

/**
 * Accept a pending invite while logged in (same email). Links the ledger member and unlocks the wallet.
 */
export async function acceptPendingInviteForUser(input: {
  db: D1Database;
  userId: string;
  userEmail: string;
  displayName: string;
  inviteId: string;
}) {
  const invite = await input.db.prepare(
    `SELECT i.id, i.space_id, i.email, i.role, i.status, i.expires_at, s.owner_user_id
     FROM invites i
     LEFT JOIN spaces s ON s.id = i.space_id
     WHERE i.id=? LIMIT 1`,
  ).bind(input.inviteId).first<{
    id: string;
    space_id: string;
    email: string;
    role: string;
    status: string;
    expires_at: string;
    owner_user_id: string | null;
  }>();
  if (!invite) throw new ApiError(404, "INVITATION_NOT_FOUND");
  if (invite.status === "accepted") throw new ApiError(409, "INVITATION_ALREADY_USED");
  if (invite.status !== "pending") throw new ApiError(410, "INVITATION_CANCELLED");
  if (new Date(invite.expires_at).getTime() <= Date.now()) throw new ApiError(410, "INVITATION_EXPIRED");
  if (normalizeEmail(invite.email) !== normalizeEmail(input.userEmail)) {
    throw new ApiError(403, "INVITE_EMAIL_MISMATCH");
  }

  const createdAt = new Date().toISOString();
  const alreadyLinked = await input.db.prepare(
    "SELECT id FROM members WHERE space_id=? AND user_id=? AND status='active' LIMIT 1",
  ).bind(invite.space_id, input.userId).first();
  if (invite.owner_user_id && !alreadyLinked) {
    await assertOwnerPlanQuota(input.db, invite.owner_user_id, "user", 1);
  }

  const inviteEmail = normalizeEmail(invite.email);
  const ledgerMember = await input.db.prepare(
    "SELECT id FROM members WHERE space_id=? AND email=? COLLATE NOCASE AND (user_id IS NULL OR user_id=?) LIMIT 1",
  ).bind(invite.space_id, inviteEmail, input.userId).first<{ id: string }>();
  const contribution = await input.db.prepare(
    "SELECT amount_minor,duration_months FROM contribution_plans WHERE space_id=? LIMIT 1",
  ).bind(invite.space_id).first<{ amount_minor: number; duration_months: number }>();
  const dueMinor = multiplyMinor(Number(contribution?.amount_minor ?? 0), Number(contribution?.duration_months ?? 0));
  const displayName = input.displayName.trim() || inviteEmail.split("@")[0] || "Member";

  const memberStatement = ledgerMember
    ? input.db.prepare(
      "UPDATE members SET user_id=?,display_name=?,email=?,role=?,status='active' WHERE id=?",
    ).bind(input.userId, displayName, inviteEmail, invite.role, ledgerMember.id)
    : input.db.prepare(
      "INSERT INTO members (id,space_id,user_id,display_name,email,phone,role,status,due_minor,paid_minor,extra_minor,avatar,joined_at) VALUES (?,?,?,?,?,NULL,?,'active',?,0,0,'#0f766e',?)",
    ).bind(crypto.randomUUID(), invite.space_id, input.userId, displayName, inviteEmail, invite.role, dueMinor, createdAt);

  await input.db.batch([
    memberStatement,
    input.db.prepare("UPDATE invites SET status='accepted' WHERE id=? AND status='pending'").bind(invite.id),
    prepareAudit(input.db, {
      userId: input.userId,
      action: "member.invite_accepted",
      entityType: "invite",
      entityId: invite.id,
      metadata: { spaceId: invite.space_id, via: "acceptPendingInvite" },
      createdAt,
    }),
  ]);

  try {
    await input.db.prepare(
      "UPDATE user_notifications SET read_at=? WHERE user_id=? AND dedupe_key=? AND read_at IS NULL",
    ).bind(createdAt, input.userId, `invite:${invite.id}`).run();
  } catch { /* optional */ }

  await writeAudit(input.db, {
    userId: input.userId,
    action: "member.invite_accepted_in_app",
    entityType: "invite",
    entityId: invite.id,
    metadata: { spaceId: invite.space_id },
    createdAt,
  }).catch(() => {});

  return { ok: true as const, spaceId: invite.space_id, inviteId: invite.id };
}
