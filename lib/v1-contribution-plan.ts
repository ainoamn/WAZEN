/** Business API v1 — contribution plan get/update. */

import type { RequestUser } from "../db/runtime";
import { prepareAudit } from "./audit";
import { ApiError } from "./security";
import { formatMoneyMinor, multiplyMinor, parseMoneyToMinor } from "./money";
import { buildInstallmentSchedule } from "./installments";
import type { ExtraPolicy } from "./finance";

export async function getV1ContributionPlan(
  db: D1Database,
  space: { id: string; currency: string; goal_minor?: number },
) {
  const plan = await db.prepare(`
    SELECT id, amount_minor, interval, due_day, extra_policy, duration_months, starts_at
    FROM contribution_plans WHERE space_id=? ORDER BY starts_at LIMIT 1
  `).bind(space.id).first<{
    id: string; amount_minor: number; interval: string; due_day: number;
    extra_policy: string; duration_months: number; starts_at: string;
  }>();
  if (!plan) return null;
  const currency = space.currency || "OMR";
  const amountMinor = Number(plan.amount_minor) || 0;
  return {
    id: plan.id,
    spaceId: space.id,
    amountMinor,
    amountLabel: formatMoneyMinor(amountMinor, currency, "en"),
    interval: plan.interval,
    dueDay: Number(plan.due_day) || 1,
    extraPolicy: plan.extra_policy,
    durationMonths: Number(plan.duration_months) || 12,
    startsAt: plan.starts_at,
  };
}

export type V1ContributionPlanUpdate = {
  monthlyContribution?: string | number;
  durationMonths?: number;
  dueDay?: number;
  extraPolicy?: ExtraPolicy;
  startsAt?: string;
};

async function rebuildInstallmentsForPlan(
  db: D1Database,
  spaceId: string,
  plan: { amount_minor: number; duration_months: number; starts_at: string },
  createdAt: string,
) {
  if (Number(plan.amount_minor) <= 0) return;
  const members = await db.prepare(
    "SELECT id, paid_minor FROM members WHERE space_id=? AND status='active'",
  ).bind(spaceId).all<{ id: string; paid_minor: number }>();
  await db.prepare("DELETE FROM member_installments WHERE space_id=?").bind(spaceId).run();
  const statements: D1PreparedStatement[] = [];
  for (const member of members.results ?? []) {
    const schedule = buildInstallmentSchedule({
      memberId: member.id,
      spaceId,
      startAt: plan.starts_at || createdAt,
      durationMonths: Number(plan.duration_months) || 12,
      amountMinor: Number(plan.amount_minor),
      paidMinor: Number(member.paid_minor),
    });
    for (const row of schedule.rows) {
      statements.push(
        db.prepare("INSERT OR IGNORE INTO member_installments (id,member_id,space_id,period_index,period_key,due_at,amount_minor,paid_minor,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
          .bind(row.id, member.id, spaceId, row.period_index, row.period_key, row.due_at, row.amount_minor, row.paid_minor, row.status, createdAt),
      );
    }
    const dueMinor = multiplyMinor(Number(plan.amount_minor), Number(plan.duration_months) || 12);
    statements.push(db.prepare("UPDATE members SET due_minor=? WHERE id=? AND space_id=?").bind(dueMinor, member.id, spaceId));
  }
  statements.push(
    db.prepare(`UPDATE spaces SET goal_minor = COALESCE((SELECT SUM(due_minor) FROM members WHERE space_id=? AND status='active'), 0) WHERE id=?`)
      .bind(spaceId, spaceId),
  );
  if (statements.length) await db.batch(statements);
}

export async function updateV1ContributionPlan(
  db: D1Database,
  user: RequestUser,
  space: { id: string; currency: string; type: string },
  input: V1ContributionPlanUpdate,
) {
  if (!["household", "trip", "society", "group"].includes(space.type)) {
    throw new ApiError(400, "INVALID_WALLET_TYPE");
  }
  if (
    input.monthlyContribution === undefined
    && input.durationMonths === undefined
    && input.dueDay === undefined
    && input.extraPolicy === undefined
    && input.startsAt === undefined
  ) {
    throw new ApiError(400, "INVALID_CONTRIBUTION_PLAN");
  }

  let plan = await db.prepare("SELECT id,amount_minor,duration_months,starts_at,due_day,extra_policy FROM contribution_plans WHERE space_id=? LIMIT 1")
    .bind(space.id).first<{
      id: string; amount_minor: number; duration_months: number; starts_at: string; due_day: number; extra_policy: string;
    }>();

  const createdAt = new Date().toISOString();
  let amountMinor = Number(plan?.amount_minor ?? 0);
  if (input.monthlyContribution !== undefined && input.monthlyContribution !== "") {
    try {
      amountMinor = parseMoneyToMinor(input.monthlyContribution, space.currency);
    } catch {
      throw new ApiError(400, "INVALID_AMOUNT");
    }
    if (amountMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT");
  }
  const durationMonths = Math.min(120, Math.max(1, Number(input.durationMonths ?? plan?.duration_months ?? 12) || 12));
  const dueDay = Math.min(28, Math.max(1, Number(input.dueDay ?? plan?.due_day ?? 1) || 1));
  const extraPolicy = input.extraPolicy ?? (plan?.extra_policy as ExtraPolicy) ?? "personal_reserve";
  if (!["personal_reserve", "voluntary_to_fund", "advance_credit"].includes(extraPolicy)) {
    throw new ApiError(400, "INVALID_EXTRA_POLICY");
  }
  const startsAt = input.startsAt ?? plan?.starts_at ?? createdAt;
  if (Number.isNaN(Date.parse(startsAt))) throw new ApiError(400, "INVALID_STARTS_AT");

  if (!plan) {
    const id = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO contribution_plans (id,space_id,amount_minor,interval,due_day,extra_policy,duration_months,starts_at)
      VALUES (?,?,?,'monthly',?,?,?,?)
    `).bind(id, space.id, amountMinor, dueDay, extraPolicy, durationMonths, startsAt).run();
    plan = { id, amount_minor: amountMinor, duration_months: durationMonths, starts_at: startsAt, due_day: dueDay, extra_policy: extraPolicy };
  } else {
    await db.prepare(`
      UPDATE contribution_plans SET amount_minor=?, due_day=?, extra_policy=?, duration_months=?, starts_at=? WHERE id=?
    `).bind(amountMinor, dueDay, extraPolicy, durationMonths, startsAt, plan.id).run();
  }

  await rebuildInstallmentsForPlan(db, space.id, {
    amount_minor: amountMinor,
    duration_months: durationMonths,
    starts_at: startsAt,
  }, createdAt);

  await prepareAudit(db, {
    userId: user.id,
    action: "contribution_plan.updated",
    entityType: "contribution_plan",
    entityId: plan.id,
    metadata: { spaceId: space.id, amountMinor, durationMonths, dueDay, extraPolicy, via: "api.v1" },
    createdAt,
  }).run();

  return getV1ContributionPlan(db, { id: space.id, currency: space.currency });
}
