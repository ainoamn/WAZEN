/** Create / refresh a space invite and optionally flush the invitation email immediately. */

import { prepareAudit } from "./audit";
import { sha256, normalizeEmail } from "./auth";
import { flushOutboxByIds, isEmailProviderConfigured } from "./email-provider";
import { ApiError } from "./security";

export async function sendSpaceMemberInvite(input: {
  db: D1Database;
  spaceId: string;
  email: string;
  role?: "member" | "treasurer" | "manager" | "auditor" | "viewer";
  inviterUserId: string;
  inviterDisplayName: string;
  origin: string;
  flush?: boolean;
  via?: string;
}) {
  const email = normalizeEmail(input.email);
  if (!email) throw new ApiError(400, "INVALID_INVITATION");
  const role = input.role ?? "member";
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const invitationId = crypto.randomUUID();
  const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const tokenHash = await sha256(token);
  const outboxId = crypto.randomUUID();
  const origin = input.origin.replace(/\/$/, "");
  const link = `${origin}/invite?token=${encodeURIComponent(token)}`;

  // Replace any outstanding invite for the same space+email so a fresh link is emailed.
  await input.db.prepare(
    "UPDATE invites SET status='cancelled' WHERE space_id=? AND email=? COLLATE NOCASE AND status='pending'",
  ).bind(input.spaceId, email).run();

  await input.db.batch([
    input.db.prepare(
      "INSERT INTO invites (id,space_id,email,role,token,status,expires_at,created_by,created_at) VALUES (?,?,?,?,?,'pending',?,?,?)",
    ).bind(invitationId, input.spaceId, email, role, tokenHash, expiresAt, input.inviterUserId, createdAt),
    input.db.prepare(
      "INSERT INTO email_outbox (id,recipient,template,payload_json,status,created_at) VALUES (?,?,?,?,'pending',?)",
    ).bind(
      outboxId,
      email,
      "member_invitation",
      JSON.stringify({
        invitationId,
        inviter: input.inviterDisplayName,
        displayName: input.inviterDisplayName,
        link,
        via: input.via ?? "dashboard",
      }),
      createdAt,
    ),
    prepareAudit(input.db, {
      userId: input.inviterUserId,
      action: "member.invited",
      entityType: "invite",
      entityId: invitationId,
      metadata: { spaceId: input.spaceId, email, role, via: input.via ?? "dashboard" },
      createdAt,
    }),
  ]);

  let delivery: "queued" | "sent" | "deferred" = "queued";
  if (input.flush !== false && isEmailProviderConfigured()) {
    const result = await flushOutboxByIds(input.db, [outboxId]).catch(() => null);
    delivery = result && result.sent > 0 ? "sent" : "queued";
  } else if (!isEmailProviderConfigured()) {
    delivery = "deferred";
  }

  return { invitationId, email, role, expiresAt, link, outboxId, delivery };
}

export const INVITE_RESEND_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/** Resend invite for a ledger member. Blocked after link/accept; max once per 6 hours. */
export async function resendSpaceMemberInvite(input: {
  db: D1Database;
  memberId: string;
  inviterUserId: string;
  inviterDisplayName: string;
  origin: string;
}) {
  const member = await input.db.prepare(
    "SELECT id,space_id,user_id,email,role,status FROM members WHERE id=? LIMIT 1",
  ).bind(input.memberId).first<{
    id: string;
    space_id: string;
    user_id: string | null;
    email: string | null;
    role: string;
    status: string;
  }>();
  if (!member || member.status !== "active") throw new ApiError(404, "MEMBER_NOT_FOUND");
  if (member.user_id) throw new ApiError(409, "INVITE_ALREADY_ACCEPTED");
  const email = normalizeEmail(member.email ?? "");
  if (!email) throw new ApiError(400, "INVITE_EMAIL_REQUIRED");

  const accepted = await input.db.prepare(
    "SELECT id FROM invites WHERE space_id=? AND email=? COLLATE NOCASE AND status='accepted' LIMIT 1",
  ).bind(member.space_id, email).first();
  if (accepted) throw new ApiError(409, "INVITE_ALREADY_ACCEPTED");

  const latest = await input.db.prepare(
    `SELECT created_at FROM invites
     WHERE space_id=? AND email=? COLLATE NOCASE
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(member.space_id, email).first<{ created_at: string }>();
  if (latest) {
    const sentAt = new Date(latest.created_at).getTime();
    if (Number.isFinite(sentAt) && Date.now() - sentAt < INVITE_RESEND_COOLDOWN_MS) {
      throw new ApiError(429, "INVITE_RESEND_COOLDOWN");
    }
  }

  const role = (["member", "treasurer", "manager", "auditor", "viewer"].includes(member.role)
    ? member.role
    : "member") as "member" | "treasurer" | "manager" | "auditor" | "viewer";

  const result = await sendSpaceMemberInvite({
    db: input.db,
    spaceId: member.space_id,
    email,
    role,
    inviterUserId: input.inviterUserId,
    inviterDisplayName: input.inviterDisplayName,
    origin: input.origin,
    flush: true,
    via: "dashboard.resendMemberInvite",
  });

  return {
    ...result,
    memberId: member.id,
    spaceId: member.space_id,
  };
}

export async function inviteResendNextEligibleAt(db: D1Database, spaceId: string, email: string) {
  const latest = await db.prepare(
    `SELECT created_at FROM invites
     WHERE space_id=? AND email=? COLLATE NOCASE
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(spaceId, normalizeEmail(email)).first<{ created_at: string }>();
  if (!latest) return null;
  return new Date(new Date(latest.created_at).getTime() + INVITE_RESEND_COOLDOWN_MS).toISOString();
}

