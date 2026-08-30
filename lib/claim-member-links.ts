/** Link ledger members after an invite was already accepted (repair only — never auto-accept). */

import { normalizeEmail } from "./auth";
import { listPendingInvitesForEmail, notifyExistingUserOfInvite } from "./pending-invites";

/**
 * Repair `members.user_id` for invites that are already accepted but not linked.
 * Pending invites stay pending until the user explicitly accepts (email link or in-app).
 * Also refreshes in-app notifications for outstanding pending invites.
 */
export async function claimMemberLinksByEmail(db: D1Database, userId: string, email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized || !userId) return { linkedMembers: 0, pendingNotified: 0 };

  const accepted = await db.prepare(
    `SELECT i.id, i.space_id, i.role
     FROM invites i
     WHERE i.status='accepted' AND i.email=? COLLATE NOCASE`,
  ).bind(normalized).all<{ id: string; space_id: string; role: string }>();

  const statements: D1PreparedStatement[] = [];
  let linkedMembers = 0;
  for (const invite of accepted.results ?? []) {
    const already = await db.prepare(
      "SELECT id FROM members WHERE space_id=? AND user_id=? AND status='active' LIMIT 1",
    ).bind(invite.space_id, userId).first();
    if (already) continue;

    const byEmail = await db.prepare(
      `SELECT m.id, m.user_id, u.email AS linked_email
       FROM members m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.space_id=? AND m.email=? COLLATE NOCASE AND m.status='active'
       LIMIT 1`,
    ).bind(invite.space_id, normalized).first<{ id: string; user_id: string | null; linked_email: string | null }>();

    if (byEmail) {
      if (byEmail.user_id === userId) continue;
      const linkedEmail = byEmail.linked_email ? normalizeEmail(byEmail.linked_email) : "";
      if (byEmail.user_id && linkedEmail === normalized && byEmail.user_id !== userId) continue;
      statements.push(db.prepare("UPDATE members SET user_id=? WHERE id=?").bind(userId, byEmail.id));
      linkedMembers += 1;
    }
  }

  if (statements.length) await db.batch(statements);

  // Keep bell / banner in sync for invites still awaiting explicit accept.
  const pending = await listPendingInvitesForEmail(db, normalized);
  let pendingNotified = 0;
  for (const invite of pending) {
    const result = await notifyExistingUserOfInvite({
      db,
      email: normalized,
      invitationId: invite.id,
      spaceId: invite.spaceId,
      inviterDisplayName: invite.inviterName || "Wazen",
    }).catch(() => ({ notifiedUserId: null as string | null }));
    if (result.notifiedUserId) pendingNotified += 1;
  }

  return { linkedMembers, pendingNotified };
}
