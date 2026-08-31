/** Create / refresh a space invite and deliver via email + WhatsApp/SMS when configured. */

import { prepareAudit } from "./audit";
import { sha256, normalizeEmail } from "./auth";
import { flushOutboxByIds, isEmailProviderConfigured } from "./email-provider";
import {
  enqueueMessage,
  flushMessageOutboxByIds,
  isSmsProviderConfigured,
  isWhatsAppCloudConfigured,
} from "./messaging-provider";
import { toWhatsAppNumber } from "./phone";
import { ApiError } from "./security";

export type InviteDelivery = {
  email: "queued" | "sent" | "deferred" | "skipped";
  whatsapp: "queued" | "sent" | "deferred" | "skipped";
  sms: "queued" | "sent" | "deferred" | "skipped";
};

/** Legacy single status for older UI: prefers email, then messaging. */
export function summarizeInviteDelivery(channels: InviteDelivery): "queued" | "sent" | "deferred" {
  const order = [channels.email, channels.whatsapp, channels.sms] as const;
  if (order.some((item) => item === "sent")) return "sent";
  if (order.some((item) => item === "queued")) return "queued";
  if (order.some((item) => item === "deferred")) return "deferred";
  return "deferred";
}

export async function sendSpaceMemberInvite(input: {
  db: D1Database;
  spaceId: string;
  email: string;
  phone?: string | null;
  role?: "member" | "treasurer" | "manager" | "supervisor" | "auditor" | "viewer";
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

  const space = await input.db.prepare("SELECT name_ar,name_en FROM spaces WHERE id=? LIMIT 1")
    .bind(input.spaceId)
    .first<{ name_ar: string | null; name_en: string | null }>();
  const spaceName = space?.name_ar || space?.name_en || "وازن";

  let phone = input.phone?.trim() ? (toWhatsAppNumber(input.phone) || input.phone.trim()) : "";
  if (!phone) {
    const memberPhone = await input.db.prepare(
      "SELECT phone FROM members WHERE space_id=? AND email=? COLLATE NOCASE AND status='active' LIMIT 1",
    ).bind(input.spaceId, email).first<{ phone: string | null }>();
    phone = memberPhone?.phone ? (toWhatsAppNumber(memberPhone.phone) || memberPhone.phone) : "";
  }

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
      metadata: {
        spaceId: input.spaceId,
        email,
        role,
        via: input.via ?? "dashboard",
        phone: phone || null,
        messaging: Boolean(phone),
      },
      createdAt,
    }),
  ]);

  const channels: InviteDelivery = {
    email: "deferred",
    whatsapp: "skipped",
    sms: "skipped",
  };

  const messagePayload = {
    inviter: input.inviterDisplayName,
    spaceName,
    link,
    locale: "ar" as const,
  };

  if (isEmailProviderConfigured()) {
    if (input.flush !== false) {
      const result = await flushOutboxByIds(input.db, [outboxId]).catch(() => null);
      channels.email = result && result.sent > 0 ? "sent" : "queued";
    } else {
      channels.email = "queued";
    }
  } else {
    channels.email = "deferred";
  }

  if (phone && isWhatsAppCloudConfigured()) {
    const waId = await enqueueMessage(input.db, {
      channel: "whatsapp",
      recipient: phone,
      template: "member_invitation",
      payload: messagePayload,
      createdAt,
    });
    if (waId) {
      channels.whatsapp = "queued";
      if (input.flush !== false) {
        const flushed = await flushMessageOutboxByIds(input.db, [waId]).catch(() => null);
        channels.whatsapp = flushed && flushed.sent > 0 ? "sent" : "queued";
      }
    }
  } else if (phone) {
    channels.whatsapp = "deferred";
  }

  if (phone && isSmsProviderConfigured()) {
    const smsId = await enqueueMessage(input.db, {
      channel: "sms",
      recipient: phone,
      template: "member_invitation",
      payload: messagePayload,
      createdAt,
    });
    if (smsId) {
      channels.sms = "queued";
      if (input.flush !== false) {
        const flushed = await flushMessageOutboxByIds(input.db, [smsId]).catch(() => null);
        channels.sms = flushed && flushed.sent > 0 ? "sent" : "queued";
      }
    }
  } else if (phone) {
    channels.sms = "deferred";
  }

  let notifiedUserId: string | null = null;
  try {
    const { notifyExistingUserOfInvite } = await import("./pending-invites");
    const notified = await notifyExistingUserOfInvite({
      db: input.db,
      email,
      invitationId,
      spaceId: input.spaceId,
      inviterDisplayName: input.inviterDisplayName,
    });
    notifiedUserId = notified.notifiedUserId;
  } catch { /* in-app notify is best-effort */ }

  return {
    invitationId,
    email,
    role,
    expiresAt,
    link,
    outboxId,
    phone: phone || null,
    channels,
    delivery: summarizeInviteDelivery(channels),
    notifiedUserId,
  };
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
    "SELECT id,space_id,user_id,email,phone,role,status FROM members WHERE id=? LIMIT 1",
  ).bind(input.memberId).first<{
    id: string;
    space_id: string;
    user_id: string | null;
    email: string | null;
    phone: string | null;
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
    phone: member.phone,
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
