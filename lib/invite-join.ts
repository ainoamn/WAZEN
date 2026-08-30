/** Public invite peek + join (register + accept in one step). */

import { createSession, hashPassword, normalizeEmail, sha256, sessionHeaders } from "./auth";
import { ensureDefaultTenant } from "./authorization";
import { writeAudit, prepareAudit } from "./audit";
import { ensureBootstrapPlatformRole } from "./platform-role-bootstrap";
import { isLikelyPhone, toWhatsAppNumber } from "./phone";
import { multiplyMinor } from "./money";
import { ApiError } from "./security";
import { assertOwnerPlanQuota } from "../services/admin/billing-service";

export type InvitePeek = {
  email: string;
  status: string;
  expiresAt: string;
  spaceNameAr: string | null;
  spaceNameEn: string | null;
};

async function loadInviteByToken(db: D1Database, token: string) {
  if (token.length < 40) throw new ApiError(400, "INVALID_INVITATION");
  const tokenHash = await sha256(token);
  const invitation = await db.prepare(
    `SELECT i.id,i.space_id,i.email,i.role,i.status,i.expires_at,s.name_ar,s.name_en,s.owner_user_id
     FROM invites i
     LEFT JOIN spaces s ON s.id=i.space_id
     WHERE i.token=? LIMIT 1`,
  ).bind(tokenHash).first<{
    id: string;
    space_id: string;
    email: string;
    role: string;
    status: string;
    expires_at: string;
    name_ar: string | null;
    name_en: string | null;
    owner_user_id: string | null;
  }>();
  if (!invitation) throw new ApiError(404, "INVITATION_NOT_FOUND");
  return invitation;
}

export function assertInviteAcceptable(invitation: { status: string; expires_at: string }) {
  if (invitation.status === "accepted") throw new ApiError(409, "INVITATION_ALREADY_USED");
  if (invitation.status !== "pending") throw new ApiError(410, "INVITATION_CANCELLED");
  if (new Date(invitation.expires_at).getTime() <= Date.now()) throw new ApiError(410, "INVITATION_EXPIRED");
}

export async function peekInvite(db: D1Database, token: string): Promise<InvitePeek> {
  const invitation = await loadInviteByToken(db, token);
  assertInviteAcceptable(invitation);
  return {
    email: normalizeEmail(invitation.email),
    status: invitation.status,
    expiresAt: invitation.expires_at,
    spaceNameAr: invitation.name_ar,
    spaceNameEn: invitation.name_en,
  };
}

export async function joinInvite(input: {
  db: D1Database;
  request: Request;
  token: string;
  displayName: string;
  phone: string;
  password?: string;
  existingUserId?: string | null;
  existingUserEmail?: string | null;
}) {
  const invitation = await loadInviteByToken(input.db, input.token);
  assertInviteAcceptable(invitation);
  const inviteEmail = normalizeEmail(invitation.email);
  const displayName = input.displayName.trim();
  if (displayName.length < 2 || displayName.length > 80) throw new ApiError(400, "INVALID_PROFILE");
  const phoneRaw = String(input.phone ?? "").trim();
  if (phoneRaw && !isLikelyPhone(phoneRaw)) throw new ApiError(400, "INVALID_PHONE");
  const phone = phoneRaw ? (toWhatsAppNumber(phoneRaw) || phoneRaw) : null;
  const createdAt = new Date().toISOString();

  let userId = input.existingUserId ?? "";
  if (userId) {
    if (normalizeEmail(input.existingUserEmail ?? "") !== inviteEmail) {
      throw new ApiError(403, "INVITE_EMAIL_MISMATCH");
    }
  } else {
    const existing = await input.db.prepare("SELECT id FROM users WHERE email=? COLLATE NOCASE LIMIT 1")
      .bind(inviteEmail).first<{ id: string }>();
    if (existing) throw new ApiError(409, "EMAIL_ALREADY_USED");

    const password = String(input.password ?? "");
    if (password.length < 12 || password.length > 128) throw new ApiError(400, "INVALID_PASSWORD");
    if (!phoneRaw || !phone) throw new ApiError(400, "INVALID_PHONE");

    userId = crypto.randomUUID();
    const passwordData = await hashPassword(password);
    await input.db.batch([
      input.db.prepare("INSERT INTO users (id,email,display_name,locale,currency,created_at) VALUES (?,?,?,'ar','OMR',?)")
        .bind(userId, inviteEmail, displayName, createdAt),
      input.db.prepare("INSERT INTO customer_profiles (user_id,status,country,last_seen_at,created_at) VALUES (?,'active','OM',?,?)")
        .bind(userId, createdAt, createdAt),
      input.db.prepare(
        "INSERT INTO auth_credentials (user_id,password_hash,password_salt,password_iterations,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
      ).bind(userId, passwordData.hash, passwordData.salt, passwordData.iterations, createdAt, createdAt, createdAt),
    ]);
    await ensureBootstrapPlatformRole(input.db, userId, inviteEmail, createdAt);
    await ensureDefaultTenant(input.db, { id: userId, displayName });
    await writeAudit(input.db, { userId, action: "auth.registered_via_invite", entityType: "user", entityId: userId, createdAt });
  }

  if (invitation.owner_user_id) {
    const alreadyLinked = await input.db.prepare(
      "SELECT id FROM members WHERE space_id=? AND user_id=? AND status='active'",
    ).bind(invitation.space_id, userId).first();
    if (!alreadyLinked) {
      await assertOwnerPlanQuota(input.db, invitation.owner_user_id, "user", 1);
    }
  }

  const ledgerMember = await input.db.prepare(
    "SELECT id FROM members WHERE space_id=? AND email=? COLLATE NOCASE AND (user_id IS NULL OR user_id=?) LIMIT 1",
  ).bind(invitation.space_id, inviteEmail, userId).first<{ id: string }>();
  const contribution = await input.db.prepare(
    "SELECT amount_minor,duration_months FROM contribution_plans WHERE space_id=? LIMIT 1",
  ).bind(invitation.space_id).first<{ amount_minor: number; duration_months: number }>();
  const dueMinor = multiplyMinor(Number(contribution?.amount_minor ?? 0), Number(contribution?.duration_months ?? 0));

  const memberStatement = ledgerMember
    ? input.db.prepare(
      "UPDATE members SET user_id=?,display_name=?,email=?,phone=COALESCE(?,phone),role=?,status='active' WHERE id=?",
    ).bind(userId, displayName, inviteEmail, phone, invitation.role, ledgerMember.id)
    : input.db.prepare(
      "INSERT INTO members (id,space_id,user_id,display_name,email,phone,role,status,due_minor,paid_minor,extra_minor,avatar,joined_at) VALUES (?,?,?,?,?,?,?,'active',?,0,0,'#0f766e',?)",
    ).bind(crypto.randomUUID(), invitation.space_id, userId, displayName, inviteEmail, phone, invitation.role, dueMinor, createdAt);

  await input.db.batch([
    memberStatement,
    input.db.prepare("UPDATE users SET display_name=? WHERE id=?").bind(displayName, userId),
    input.db.prepare("UPDATE invites SET status='accepted' WHERE id=?").bind(invitation.id),
    prepareAudit(input.db, {
      userId,
      action: "member.invite_accepted",
      entityType: "invite",
      entityId: invitation.id,
      metadata: { spaceId: invitation.space_id, via: "joinInvite" },
      createdAt,
    }),
  ]);

  const session = await createSession(input.db, userId, input.request);
  return {
    ok: true as const,
    spaceId: invitation.space_id,
    userId,
    email: inviteEmail,
    headers: sessionHeaders(session),
  };
}
