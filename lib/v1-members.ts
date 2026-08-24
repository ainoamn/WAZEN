/** Business API v1 — create a wallet member. */

import type { RequestUser } from "../db/runtime";
import { prepareAudit } from "./audit";
import { ApiError } from "./security";
import { multiplyMinor, parseMoneyToMinor } from "./money";
import { isLikelyPhone, toWhatsAppNumber } from "./phone";

export type V1CreateMemberInput = {
  displayName: string;
  email?: string | null;
  phone?: string | null;
  role?: "member" | "treasurer" | "manager" | "auditor" | "viewer";
  monthlyContribution?: string | number;
  durationMonths?: number;
};

export async function createV1Member(
  db: D1Database,
  user: RequestUser,
  space: { id: string; type: string; currency: string; owner_user_id: string },
  input: V1CreateMemberInput,
) {
  if (!["household", "trip", "society", "group"].includes(space.type)) {
    throw new ApiError(400, "INVALID_WALLET_TYPE");
  }
  const displayName = input.displayName.trim();
  if (displayName.length < 2 || displayName.length > 80) throw new ApiError(400, "INVALID_MEMBER");
  const phoneRaw = input.phone?.trim() || "";
  if (phoneRaw && !isLikelyPhone(phoneRaw)) throw new ApiError(400, "INVALID_PHONE");

  const { getActivePlanEntitlements } = await import("../services/admin/billing-service");
  const entitlements = await getActivePlanEntitlements(db, space.owner_user_id, { skipSideEffects: true, skipUsage: true });
  const count = await db.prepare("SELECT COUNT(*) AS count FROM members WHERE space_id=? AND status='active'")
    .bind(space.id).first<{ count: number }>();
  if (Number(count?.count ?? 0) >= entitlements.memberLimit) throw new ApiError(403, "PLAN_MEMBER_LIMIT");

  const contribution = await db.prepare(
    "SELECT amount_minor,duration_months,starts_at FROM contribution_plans WHERE space_id=? LIMIT 1",
  ).bind(space.id).first<{ amount_minor: number; duration_months: number; starts_at: string }>();

  let monthlyMinor = Number(contribution?.amount_minor ?? 0);
  if (input.monthlyContribution !== undefined && input.monthlyContribution !== "") {
    try {
      monthlyMinor = parseMoneyToMinor(input.monthlyContribution, space.currency);
    } catch {
      throw new ApiError(400, "INVALID_AMOUNT");
    }
  }
  const durationMonths = Math.min(120, Math.max(1, Number(input.durationMonths ?? contribution?.duration_months ?? 12) || 12));
  const dueMinor = multiplyMinor(monthlyMinor, durationMonths);
  const role = input.role ?? "member";
  const phone = phoneRaw ? (toWhatsAppNumber(phoneRaw) || phoneRaw) : null;
  const email = input.email?.trim() || null;
  const memberId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await db.batch([
    db.prepare(
      "INSERT INTO members (id,space_id,user_id,display_name,email,phone,role,status,due_minor,paid_minor,extra_minor,avatar,joined_at) VALUES (?,?,NULL,?,?,?,?,'active',?,0,0,'#0f766e',?)",
    ).bind(memberId, space.id, displayName, email, phone, role, dueMinor, createdAt),
    prepareAudit(db, {
      userId: user.id,
      action: "member.created",
      entityType: "member",
      entityId: memberId,
      metadata: { spaceId: space.id, role, durationMonths, monthlyMinor, via: "api.v1" },
      createdAt,
    }),
    db.prepare(
      `UPDATE spaces SET goal_minor = COALESCE((SELECT SUM(due_minor) FROM members WHERE space_id=? AND status='active'), 0) WHERE id=?`,
    ).bind(space.id, space.id),
  ]);

  return {
    id: memberId,
    spaceId: space.id,
    displayName,
    email,
    phone,
    role,
    status: "active" as const,
    dueMinor,
    paidMinor: 0,
    extraMinor: 0,
    joinedAt: createdAt,
  };
}
