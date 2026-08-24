/** Business API v1 — create / update wallets (spaces). */

import type { RequestUser } from "../db/runtime";
import { prepareAudit } from "./audit";
import { ensureDefaultTenant } from "./authorization";
import { ApiError } from "./security";
import { formatMoneyMinor, multiplyMinor, parseMoneyToMinor, parseNonNegativeMoneyToMinor } from "./money";
import { filterSpacesByPlan } from "./plan-features";

function cleanId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

function parseStartDate(value?: string) {
  if (!value) return new Date().toISOString();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, "INVALID_START_DATE");
  return date.toISOString();
}

export type V1CreateSpaceInput = {
  name: string;
  type: "personal" | "household" | "trip" | "society" | "group";
  goal?: string | number;
  monthlyContribution?: string | number;
  durationMonths?: number;
  dueDay?: number;
  startsAt?: string;
};

export async function createV1Space(db: D1Database, user: RequestUser, input: V1CreateSpaceInput) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) throw new ApiError(400, "INVALID_WALLET");
  const type = input.type;

  const { getActivePlanEntitlements, planAllowsSpaceType } = await import("../services/admin/billing-service");
  const entitlements = await getActivePlanEntitlements(db, user.id);
  if (!planAllowsSpaceType(entitlements.features, type)) throw new ApiError(403, "PLAN_FEATURE_REQUIRED");

  const owned = await db.prepare("SELECT type FROM spaces WHERE owner_user_id=? AND COALESCE(status,'active') <> 'archived'")
    .bind(user.id).all<{ type: string }>();
  const count = filterSpacesByPlan(owned.results ?? [], entitlements.features).length;
  if (count >= entitlements.walletLimit) throw new ApiError(403, "PLAN_WALLET_LIMIT");

  const id = `${cleanId(user.id)}-${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  const startsAt = parseStartDate(input.startsAt);
  const profile = await db.prepare("SELECT currency FROM users WHERE id=?").bind(user.id).first<{ currency: string }>();
  const currency = profile?.currency ?? "OMR";

  let goalMinor: number;
  try {
    goalMinor = parseNonNegativeMoneyToMinor(input.goal ?? "0", currency);
  } catch {
    throw new ApiError(400, "INVALID_AMOUNT");
  }

  const isGroup = ["household", "trip", "society", "group"].includes(type);
  let contributionMinor = 0;
  const durationMonths = input.durationMonths ?? 12;
  if (isGroup && input.monthlyContribution !== undefined && input.monthlyContribution !== "") {
    try {
      contributionMinor = parseMoneyToMinor(input.monthlyContribution, currency);
    } catch {
      throw new ApiError(400, "INVALID_AMOUNT");
    }
    if (contributionMinor > 0) goalMinor = multiplyMinor(contributionMinor, durationMonths);
  }

  const tenantId = await ensureDefaultTenant(db, user);
  const statements: D1PreparedStatement[] = [
    db.prepare("INSERT INTO spaces (id,owner_user_id,name_ar,name_en,type,currency,balance_minor,goal_minor,accent,created_at,starts_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'emerald', ?, ?)")
      .bind(id, user.id, name, name, type, currency, goalMinor, createdAt, startsAt),
    db.prepare("INSERT INTO tenant_resources (tenant_id,resource_type,resource_id,created_at) VALUES (?,'space',?,?)")
      .bind(tenantId, id, createdAt),
    db.prepare("INSERT INTO accounting_periods (id,space_id,label,starts_at,status,created_at) VALUES (?,?,?,?,'open',?)")
      .bind(crypto.randomUUID(), id, name, startsAt, createdAt),
    prepareAudit(db, {
      userId: user.id,
      action: "wallet.created",
      entityType: "space",
      entityId: id,
      metadata: { type, currency, startsAt, via: "api.v1" },
      createdAt,
    }),
  ];
  if (isGroup && contributionMinor > 0) {
    const dueDay = Math.min(28, Math.max(1, Number(input.dueDay ?? 1) || 1));
    statements.push(
      db.prepare(`INSERT INTO contribution_plans (id,space_id,amount_minor,interval,due_day,extra_policy,duration_months,starts_at)
        VALUES (?, ?, ?, 'monthly', ?, 'personal_reserve', ?, ?)`)
        .bind(`${id}-plan`, id, contributionMinor, dueDay, durationMonths, startsAt),
    );
  }
  await db.batch(statements);

  return {
    id,
    nameAr: name,
    nameEn: name,
    type,
    currency,
    balanceMinor: 0,
    balanceLabel: formatMoneyMinor(0, currency, "en"),
    goalMinor,
    status: "active" as const,
    createdAt,
    startsAt,
  };
}

export type V1UpdateSpaceInput = {
  name?: string;
  goal?: string | number;
  monthlyContribution?: string | number;
  durationMonths?: number;
  startsAt?: string;
};

export async function updateV1Space(
  db: D1Database,
  user: RequestUser,
  space: { id: string; owner_user_id: string; type: string; currency: string },
  input: V1UpdateSpaceInput,
) {
  if (space.owner_user_id !== user.id && space.type === "personal") throw new ApiError(403, "FORBIDDEN");
  if (
    input.name === undefined
    && input.goal === undefined
    && input.monthlyContribution === undefined
    && input.durationMonths === undefined
    && input.startsAt === undefined
  ) {
    throw new ApiError(400, "INVALID_WALLET");
  }

  const name = input.name?.trim();
  if (name !== undefined && (name.length < 2 || name.length > 80)) throw new ApiError(400, "INVALID_WALLET");

  const startsAt = input.startsAt ? parseStartDate(input.startsAt) : undefined;
  let goalMinor: number | undefined;
  if (input.goal !== undefined) {
    try {
      goalMinor = parseNonNegativeMoneyToMinor(input.goal, space.currency);
    } catch {
      throw new ApiError(400, "INVALID_AMOUNT");
    }
  }
  let contributionMinor: number | undefined;
  if (input.monthlyContribution !== undefined && input.monthlyContribution !== "") {
    try {
      contributionMinor = parseMoneyToMinor(input.monthlyContribution, space.currency);
    } catch {
      throw new ApiError(400, "INVALID_AMOUNT");
    }
  }
  const durationMonths = input.durationMonths;
  if (contributionMinor !== undefined && durationMonths) {
    goalMinor = multiplyMinor(contributionMinor, durationMonths);
  }

  const createdAt = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  if (name) statements.push(db.prepare("UPDATE spaces SET name_ar=?, name_en=? WHERE id=?").bind(name, name, space.id));
  if (startsAt) statements.push(db.prepare("UPDATE spaces SET starts_at=? WHERE id=?").bind(startsAt, space.id));
  if (goalMinor !== undefined) statements.push(db.prepare("UPDATE spaces SET goal_minor=? WHERE id=?").bind(goalMinor, space.id));

  const plan = await db.prepare("SELECT id FROM contribution_plans WHERE space_id=?").bind(space.id).first<{ id: string }>();
  if (plan && (contributionMinor !== undefined || durationMonths || startsAt)) {
    if (contributionMinor !== undefined) {
      statements.push(db.prepare("UPDATE contribution_plans SET amount_minor=? WHERE id=?").bind(contributionMinor, plan.id));
    }
    if (durationMonths) {
      statements.push(db.prepare("UPDATE contribution_plans SET duration_months=? WHERE id=?").bind(durationMonths, plan.id));
    }
    if (startsAt) {
      statements.push(db.prepare("UPDATE contribution_plans SET starts_at=? WHERE id=?").bind(startsAt, plan.id));
    }
  }

  statements.push(prepareAudit(db, {
    userId: user.id,
    action: "wallet.updated",
    entityType: "space",
    entityId: space.id,
    metadata: { name: name ?? null, via: "api.v1" },
    createdAt,
  }));
  await db.batch(statements);

  const row = await db.prepare("SELECT id, name_ar, name_en, type, currency, balance_minor, goal_minor, status, created_at, starts_at FROM spaces WHERE id=?")
    .bind(space.id).first<{
      id: string; name_ar: string; name_en: string; type: string; currency: string;
      balance_minor: number; goal_minor: number; status: string | null; created_at: string; starts_at?: string | null;
    }>();
  if (!row) throw new ApiError(404, "WALLET_NOT_FOUND");
  const currency = row.currency || "OMR";
  return {
    id: row.id,
    nameAr: row.name_ar,
    nameEn: row.name_en,
    type: row.type,
    currency,
    balanceMinor: Number(row.balance_minor) || 0,
    balanceLabel: formatMoneyMinor(Number(row.balance_minor) || 0, currency, "en"),
    goalMinor: Number(row.goal_minor) || 0,
    status: row.status ?? "active",
    createdAt: row.created_at,
    startsAt: row.starts_at ?? null,
  };
}

export async function archiveV1Space(
  db: D1Database,
  user: RequestUser,
  space: { id: string; owner_user_id: string },
  archived = true,
) {
  if (space.owner_user_id !== user.id) throw new ApiError(403, "FORBIDDEN");
  const status = archived ? "archived" : "active";
  const createdAt = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE spaces SET status=? WHERE id=?").bind(status, space.id),
    prepareAudit(db, {
      userId: user.id,
      action: archived ? "wallet.archived" : "wallet.unarchived",
      entityType: "space",
      entityId: space.id,
      metadata: { status, via: "api.v1" },
      createdAt,
    }),
  ]);
  return { id: space.id, status, archivedAt: archived ? createdAt : null, updatedAt: createdAt };
}
