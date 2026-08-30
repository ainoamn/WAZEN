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
