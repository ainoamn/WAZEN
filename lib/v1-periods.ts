/** Business API v1 — accounting periods list / close. */

import type { RequestUser } from "../db/runtime";
import { prepareAudit } from "./audit";
import { ApiError } from "./security";

export async function listV1Periods(db: D1Database, spaceId: string, options?: { limit?: number }) {
  const limit = Math.min(50, Math.max(1, options?.limit ?? 20));
  const rows = await db.prepare(`
    SELECT id, label, starts_at, ends_at, status, closed_at, created_at, closed_by, reopened_at
    FROM accounting_periods WHERE space_id=?
    ORDER BY starts_at DESC LIMIT ?
  `).bind(spaceId, limit).all<{
    id: string; label: string | null; starts_at: string; ends_at: string | null;
    status: string; closed_at: string | null; created_at: string; closed_by: string | null; reopened_at: string | null;
  }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    closedAt: row.closed_at,
    closedBy: row.closed_by,
    reopenedAt: row.reopened_at,
    createdAt: row.created_at,
  }));
}

async function assertMembersSettledForClose(db: D1Database, spaceId: string) {
  const asOf = new Date().toISOString();
  const members = await db.prepare(
    "SELECT id,due_minor,paid_minor FROM members WHERE space_id=? AND status='active'",
  ).bind(spaceId).all<{ id: string; due_minor: number; paid_minor: number }>();
  for (const member of members.results ?? []) {
    const inst = await db.prepare(
      "SELECT COUNT(*) AS count, COALESCE(SUM(CASE WHEN due_at <= ? THEN amount_minor ELSE 0 END), 0) AS accrued FROM member_installments WHERE member_id=?",
    ).bind(asOf, member.id).first<{ count: number; accrued: number }>();
    const accrued = Number(inst?.count ?? 0) > 0 ? Number(inst?.accrued ?? 0) : Number(member.due_minor);
    if (accrued > Number(member.paid_minor)) throw new ApiError(409, "PERIOD_UNSETTLED");
  }
  const pending = await db.prepare(
    "SELECT COUNT(*) AS count FROM settlements WHERE space_id=? AND status='pending'",
  ).bind(spaceId).first<{ count: number }>();
  if (Number(pending?.count ?? 0) > 0) throw new ApiError(409, "PERIOD_UNSETTLED");
}

export async function closeV1Period(
  db: D1Database,
  user: RequestUser,
  space: { id: string },
  options?: { label?: string },
) {
  await assertMembersSettledForClose(db, space.id);
  const createdAt = new Date().toISOString();
  const open = await db.prepare(
    "SELECT id,status FROM accounting_periods WHERE space_id=? AND status IN ('open','reopened') ORDER BY starts_at DESC LIMIT 1",
  ).bind(space.id).first<{ id: string; status: string }>();

  let periodId = open?.id;
  if (open) {
    await db.prepare(
      "UPDATE accounting_periods SET status='closed', ends_at=?, closed_at=?, closed_by=?, label=COALESCE(NULLIF(?,''), label) WHERE id=?",
    ).bind(createdAt, createdAt, user.id, options?.label ?? "", open.id).run();
  } else {
    periodId = crypto.randomUUID();
    const spaceRow = await db.prepare("SELECT name_ar,starts_at,created_at FROM spaces WHERE id=?")
      .bind(space.id).first<{ name_ar: string; starts_at?: string; created_at: string }>();
    await db.prepare(
      "INSERT INTO accounting_periods (id,space_id,label,starts_at,ends_at,status,closed_at,created_at,closed_by) VALUES (?,?,?,?,?,'closed',?,?,?)",
    ).bind(
      periodId,
      space.id,
      options?.label || `${spaceRow?.name_ar ?? "فترة"} · إغلاق`,
      spaceRow?.starts_at || spaceRow?.created_at || createdAt,
      createdAt,
      createdAt,
      createdAt,
      user.id,
    ).run();
  }

  await prepareAudit(db, {
    userId: user.id,
    action: "period.closed",
    entityType: "accounting_period",
    entityId: periodId ?? space.id,
    metadata: { spaceId: space.id, previousStatus: open?.status ?? "none", via: "api.v1" },
    createdAt,
  }).run();

  return {
    id: periodId ?? space.id,
    spaceId: space.id,
    status: "closed" as const,
    closedAt: createdAt,
  };
}

export async function reopenV1Period(
  db: D1Database,
  user: RequestUser,
  space: { id: string },
  periodId: string,
  options?: { reason?: string },
) {
  const period = await db.prepare(
    "SELECT id,status,label FROM accounting_periods WHERE id=? AND space_id=?",
  ).bind(periodId, space.id).first<{ id: string; status: string; label: string }>();
  if (!period) throw new ApiError(404, "PERIOD_NOT_FOUND");
  if (period.status !== "closed") throw new ApiError(409, "PERIOD_NOT_CLOSED");
  const createdAt = new Date().toISOString();
  await db.prepare(
    "UPDATE accounting_periods SET status='reopened', reopened_at=?, reopened_by=?, reopen_count=COALESCE(reopen_count,0)+1 WHERE id=?",
  ).bind(createdAt, user.id, period.id).run();
  await prepareAudit(db, {
    userId: user.id,
    action: "period.reopened",
    entityType: "accounting_period",
    entityId: period.id,
    metadata: { spaceId: space.id, reason: options?.reason ?? "", label: period.label, via: "api.v1" },
    createdAt,
  }).run();
  return {
    id: period.id,
    spaceId: space.id,
    status: "reopened" as const,
    reopenedAt: createdAt,
    label: period.label,
  };
}
