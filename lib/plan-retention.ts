/** Plan downgrade / expiry retention: 15-day user grace, 60-day admin archive. */

import { prepareAudit } from "./audit";
import { parsePlanFeatures, planAllowsSpaceType, resolveEntitlements } from "./plan-features";
import { ApiError } from "./api-error";
import {
  ADMIN_ARCHIVE_DAYS,
  USER_GRACE_DAYS,
  archivePurgeAt,
  graceEndsAt,
  spaceInUserGrace,
  userGraceWarningCopy,
} from "./plan-retention-rules";

export {
  ADMIN_ARCHIVE_DAYS,
  USER_GRACE_DAYS,
  archivePurgeAt,
  graceEndsAt,
  spaceInUserGrace,
  userGraceWarningCopy,
} from "./plan-retention-rules";

const DAY_MS = 86_400_000;

let retentionReady = false;

export async function ensurePlanRetentionSchema(db: D1Database) {
  if (retentionReady) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS plan_retention_archives (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    original_space_id TEXT NOT NULL,
    space_type TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    reason TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    archived_at TEXT NOT NULL,
    purge_after TEXT NOT NULL,
    restored_at TEXT,
    restored_by TEXT,
    purged_at TEXT
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_plan_retention_owner ON plan_retention_archives(owner_user_id, archived_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_plan_retention_purge ON plan_retention_archives(purge_after, purged_at)").run();
  const columns = await db.prepare("PRAGMA table_info(spaces)").all<{ name: string }>();
  const names = new Set((columns.results ?? []).map((column) => column.name));
  const addColumn = async (name: string, ddl: string) => {
    if (names.has(name)) return;
    try {
      await db.prepare(`ALTER TABLE spaces ADD COLUMN ${name} ${ddl}`).run();
    } catch (error) {
      const refreshed = await db.prepare("PRAGMA table_info(spaces)").all<{ name: string }>();
      if (!(refreshed.results ?? []).some((column) => column.name === name)) throw error;
    }
  };
  await addColumn("status", "TEXT NOT NULL DEFAULT 'active'");
  await addColumn("grace_until", "TEXT");
  try {
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_spaces_grace_until ON spaces(grace_until)").run();
  } catch { /* optional */ }
  retentionReady = true;
}

export function filterSpacesForPlanAccess<T extends { type: string; grace_until?: string | null; status?: string | null }>(
  spaces: T[] | null | undefined,
  features: string[],
  now = Date.now(),
) {
  return (spaces ?? []).filter((space) => {
    if ((space.status ?? "active") === "retention_held") return false;
    if (planAllowsSpaceType(features, space.type)) return true;
    return spaceInUserGrace(space, now);
  });
}

export async function readUserGraceSummary(db: D1Database, userId: string) {
  try {
    await ensurePlanRetentionSchema(db);
  } catch {
    return null;
  }
  const now = new Date().toISOString();
  let rows: { results: Array<{ id: string; type: string; grace_until: string }> };
  try {
    rows = await db.prepare(
      `SELECT id, type, grace_until FROM spaces
       WHERE owner_user_id=? AND grace_until IS NOT NULL AND grace_until>? AND COALESCE(status,'active') NOT IN ('retention_held')
       ORDER BY grace_until ASC`,
    ).bind(userId, now).all<{ id: string; type: string; grace_until: string }>();
  } catch {
    return null;
  }
  if (!rows.results.length) return null;
  const earliest = rows.results[0].grace_until;
  return {
    graceEndsAt: earliest,
    spaceCount: rows.results.length,
    spaceIds: rows.results.map((row) => row.id),
    spaceTypes: [...new Set(rows.results.map((row) => row.type))],
  };
}

async function loadUserPlanFeatures(db: D1Database, userId: string) {
  const row = await db.prepare(
    `SELECT p.features_json, p.wallet_limit, p.member_limit, p.transaction_limit, p.record_limit, p.user_limit,
            p.daily_transaction_limit, p.monthly_transaction_limit, p.print_limit, s.status,
            s.features_grant_json, s.features_deny_json, s.wallet_limit_override, s.member_limit_override,
            s.transaction_limit_override, s.record_limit_override, s.user_limit_override
     FROM subscriptions s JOIN plans p ON p.id=s.plan_id
     WHERE s.user_id=? AND s.status IN ('active','trialing')
     ORDER BY s.created_at DESC LIMIT 1`,
  ).bind(userId).first<{
    features_json: string;
    wallet_limit: number;
    member_limit: number;
    transaction_limit: number | null;
    record_limit: number | null;
    user_limit: number | null;
    daily_transaction_limit: number | null;
    monthly_transaction_limit: number | null;
    print_limit: number | null;
    status: string;
    features_grant_json?: string;
    features_deny_json?: string;
    wallet_limit_override?: number | null;
    member_limit_override?: number | null;
    transaction_limit_override?: number | null;
    record_limit_override?: number | null;
    user_limit_override?: number | null;
  }>();
  if (!row) return ["personal"];
  return resolveEntitlements({
    planFeatures: parsePlanFeatures(row.features_json),
    grant: parsePlanFeatures(row.features_grant_json),
    deny: parsePlanFeatures(row.features_deny_json),
    walletLimit: Number(row.wallet_limit ?? 1),
    memberLimit: Number(row.member_limit ?? 2),
    transactionLimit: Number(row.transaction_limit ?? 0),
    recordLimit: Number(row.record_limit ?? 0),
    userLimit: Number(row.user_limit ?? 1),
    dailyTransactionLimit: Number(row.daily_transaction_limit ?? 0),
    monthlyTransactionLimit: Number(row.monthly_transaction_limit ?? 0),
    printLimit: Number(row.print_limit ?? 0),
    walletLimitOverride: row.wallet_limit_override,
    memberLimitOverride: row.member_limit_override,
    transactionLimitOverride: row.transaction_limit_override,
    recordLimitOverride: row.record_limit_override,
    userLimitOverride: row.user_limit_override,
    status: row.status,
  }).features;
}

/** Mark out-of-plan owned wallets for a 15-day user-visible grace window. Clears grace on types now allowed. */
export async function startGraceForOutOfPlanSpaces(
  db: D1Database,
  userId: string,
  features: string[],
  reason: "downgrade" | "expiry" | "upgrade" | "admin",
) {
  await ensurePlanRetentionSchema(db);
  const now = new Date().toISOString();
  const ends = graceEndsAt(now);
  const spaces = await db.prepare(
    "SELECT id, type, grace_until, status FROM spaces WHERE owner_user_id=? AND COALESCE(status,'active') NOT IN ('retention_held')",
  ).bind(userId).all<{ id: string; type: string; grace_until: string | null; status: string | null }>();

  const statements: D1PreparedStatement[] = [];
  let marked = 0;
  let cleared = 0;
  for (const space of spaces.results) {
    if (planAllowsSpaceType(features, space.type)) {
      if (space.grace_until) {
        statements.push(db.prepare("UPDATE spaces SET grace_until=NULL WHERE id=?").bind(space.id));
        cleared += 1;
      }
      continue;
    }
    if (space.grace_until && new Date(space.grace_until).getTime() > Date.now()) continue;
    statements.push(db.prepare("UPDATE spaces SET grace_until=? WHERE id=?").bind(ends, space.id));
    marked += 1;
  }
  if (marked) {
    statements.push(
      prepareAudit(db, {
        userId,
        action: "subscription.retention_grace_started",
        entityType: "subscription",
        entityId: userId,
        metadata: { reason, graceEndsAt: ends, spaceCount: marked, userVisibleDays: USER_GRACE_DAYS },
        createdAt: now,
      }),
    );
  }
  if (statements.length) await db.batch(statements);
  return { marked, cleared, graceEndsAt: marked ? ends : null };
}

/** Sync grace markers from the user's current effective plan features. */
export async function syncRetentionForUser(
  db: D1Database,
  userId: string,
  reason: "downgrade" | "expiry" | "upgrade" | "admin",
) {
  const features = await loadUserPlanFeatures(db, userId);
  return startGraceForOutOfPlanSpaces(db, userId, features, reason);
}

/** Paid plans past period end (and not awaiting a due pending change) fall back to starter + grace. */
export async function expireLapsedPaidSubscriptions(db: D1Database, userId?: string) {
  const { ensurePendingPlanColumns } = await import("./plan-change");
  await ensurePendingPlanColumns(db);
  await ensurePlanRetentionSchema(db);
  const now = new Date().toISOString();
  const query = userId
    ? db.prepare(
      `SELECT s.id, s.user_id FROM subscriptions s
       JOIN plans p ON p.id=s.plan_id
       WHERE s.user_id=? AND s.status IN ('active','trialing') AND s.current_period_end<=?
         AND COALESCE(p.monthly_minor,0)>0
         AND (s.pending_plan_id IS NULL OR s.pending_effective_at IS NULL OR s.pending_effective_at>?)
       LIMIT 40`,
    ).bind(userId, now, now)
    : db.prepare(
      `SELECT s.id, s.user_id FROM subscriptions s
       JOIN plans p ON p.id=s.plan_id
       WHERE s.status IN ('active','trialing') AND s.current_period_end<=?
         AND COALESCE(p.monthly_minor,0)>0
         AND (s.pending_plan_id IS NULL OR s.pending_effective_at IS NULL OR s.pending_effective_at>?)
       LIMIT 40`,
    ).bind(now, now);
  const due = await query.all<{ id: string; user_id: string }>();
  let expired = 0;
  for (const row of due.results) {
    const starter = await db.prepare("SELECT id FROM plans WHERE id='starter' AND is_active=1").first();
    if (!starter) break;
    const periodEnd = new Date(Date.now() + 30 * DAY_MS).toISOString();
    await db.batch([
      db.prepare(
        `UPDATE subscriptions SET plan_id='starter', status='active', billing_cycle='monthly',
          current_period_start=?, current_period_end=?,
          pending_plan_id=NULL, pending_billing_cycle=NULL, pending_effective_at=NULL, updated_at=?
         WHERE id=?`,
      ).bind(now, periodEnd, now, row.id),
      prepareAudit(db, {
        userId: row.user_id,
        action: "subscription.expired_to_starter",
        entityType: "subscription",
        entityId: row.id,
        metadata: { reason: "period_ended" },
        createdAt: now,
      }),
    ]);
    await syncRetentionForUser(db, row.user_id, "expiry");
    expired += 1;
  }
  return { expired };
}

async function snapshotSpace(db: D1Database, spaceId: string) {
  const space = await db.prepare("SELECT * FROM spaces WHERE id=?").bind(spaceId).first<Record<string, unknown>>();
  if (!space) return null;
  const [
    members,
    transactions,
    plans,
    installments,
    turns,
    configs,
    expenses,
    splits,
    settlements,
    periods,
    personalAccounts,
    personalRules,
    personalOccurrences,
    payoutAccounts,
    familyEvents,
  ] = await Promise.all([
    db.prepare("SELECT * FROM members WHERE space_id=?").bind(spaceId).all(),
    db.prepare("SELECT * FROM transactions WHERE space_id=? ORDER BY occurred_at DESC LIMIT 2000").bind(spaceId).all(),
    db.prepare("SELECT * FROM contribution_plans WHERE space_id=?").bind(spaceId).all(),
    db.prepare("SELECT * FROM member_installments WHERE space_id=?").bind(spaceId).all(),
    db.prepare("SELECT * FROM circle_turns WHERE space_id=?").bind(spaceId).all(),
    db.prepare("SELECT * FROM circle_configs WHERE space_id=?").bind(spaceId).all(),
    db.prepare("SELECT * FROM trip_expenses WHERE space_id=?").bind(spaceId).all(),
    db.prepare("SELECT es.* FROM expense_splits es JOIN trip_expenses te ON te.id=es.expense_id WHERE te.space_id=?").bind(spaceId).all(),
    db.prepare("SELECT * FROM settlements WHERE space_id=?").bind(spaceId).all(),
    db.prepare("SELECT * FROM accounting_periods WHERE space_id=?").bind(spaceId).all(),
    db.prepare("SELECT * FROM personal_accounts WHERE space_id=?").bind(spaceId).all(),
    db.prepare("SELECT * FROM personal_rules WHERE space_id=?").bind(spaceId).all(),
    db.prepare("SELECT * FROM personal_occurrences WHERE space_id=?").bind(spaceId).all(),
    db.prepare("SELECT * FROM space_payout_accounts WHERE space_id=?").bind(spaceId).all(),
    db.prepare("SELECT * FROM family_events WHERE space_id=?").bind(spaceId).all(),
  ]);
  return {
    space,
    members: members.results,
    transactions: transactions.results,
    plans: plans.results,
    installments: installments.results,
    circleTurns: turns.results,
    circleConfigs: configs.results,
    tripExpenses: expenses.results,
    expenseSplits: splits.results,
    settlements: settlements.results,
    periods: periods.results,
    personalAccounts: personalAccounts.results,
    personalRules: personalRules.results,
    personalOccurrences: personalOccurrences.results,
    payoutAccounts: payoutAccounts.results,
    familyEvents: familyEvents.results,
  };
}

async function deleteSpaceFromUserAccount(db: D1Database, spaceId: string, actorUserId: string) {
  const createdAt = new Date().toISOString();
  await db.batch([
    db.prepare("DELETE FROM space_bank_links WHERE hub_space_id=? OR linked_space_id=?").bind(spaceId, spaceId),
    db.prepare("DELETE FROM space_links WHERE hub_space_id=? OR linked_space_id=?").bind(spaceId, spaceId),
    db.prepare("DELETE FROM journal_lines WHERE entry_id IN (SELECT id FROM journal_entries WHERE space_id=?)").bind(spaceId),
    db.prepare("DELETE FROM journal_entries WHERE space_id=?").bind(spaceId),
    db.prepare("DELETE FROM expense_splits WHERE expense_id IN (SELECT id FROM trip_expenses WHERE space_id=?)").bind(spaceId),
    db.prepare("DELETE FROM settlements WHERE space_id=?").bind(spaceId),
    db.prepare("DELETE FROM trip_expenses WHERE space_id=?").bind(spaceId),
    db.prepare("DELETE FROM family_events WHERE space_id=?").bind(spaceId),
    db.prepare("DELETE FROM space_payout_accounts WHERE space_id=?").bind(spaceId),
    db.prepare("DELETE FROM personal_occurrences WHERE space_id=?").bind(spaceId),
    db.prepare("DELETE FROM personal_rules WHERE space_id=?").bind(spaceId),
    db.prepare("DELETE FROM personal_accounts WHERE space_id=?").bind(spaceId),
    db.prepare("DELETE FROM transactions WHERE space_id=?").bind(spaceId),
    db.prepare("DELETE FROM circle_turns WHERE space_id=?").bind(spaceId),
    db.prepare("DELETE FROM circle_configs WHERE space_id=?").bind(spaceId),
    db.prepare("DELETE FROM member_installments WHERE space_id=?").bind(spaceId),
    db.prepare("DELETE FROM members WHERE space_id=?").bind(spaceId),
    db.prepare("DELETE FROM invites WHERE space_id=?").bind(spaceId),
    db.prepare("DELETE FROM period_ledger_events WHERE space_id=?").bind(spaceId),
    db.prepare("DELETE FROM accounting_periods WHERE space_id=?").bind(spaceId),
    db.prepare("DELETE FROM contribution_plans WHERE space_id=?").bind(spaceId),
    db.prepare("UPDATE documents SET space_id=NULL WHERE space_id=?").bind(spaceId),
    db.prepare("DELETE FROM tenant_resources WHERE resource_type='space' AND resource_id=?").bind(spaceId),
    prepareAudit(db, {
      userId: actorUserId,
      action: "wallet.retention_removed",
      entityType: "space",
      entityId: spaceId,
      metadata: { userVisibleDays: USER_GRACE_DAYS, adminArchiveDays: ADMIN_ARCHIVE_DAYS },
      createdAt,
    }),
    db.prepare("DELETE FROM spaces WHERE id=?").bind(spaceId),
  ]);
}

/** After grace ends: remove from user account and keep an admin-only archive for 60 days. */
export async function archiveExpiredGraceSpaces(db: D1Database, userId?: string) {
  await ensurePlanRetentionSchema(db);
  const now = new Date().toISOString();
  const query = userId
    ? db.prepare(
      `SELECT id, owner_user_id, type, name_ar, name_en FROM spaces
       WHERE owner_user_id=? AND grace_until IS NOT NULL AND grace_until<=? AND COALESCE(status,'active') NOT IN ('retention_held')
       LIMIT 40`,
    ).bind(userId, now)
    : db.prepare(
      `SELECT id, owner_user_id, type, name_ar, name_en FROM spaces
       WHERE grace_until IS NOT NULL AND grace_until<=? AND COALESCE(status,'active') NOT IN ('retention_held')
       LIMIT 40`,
    ).bind(now);
  const due = await query.all<{ id: string; owner_user_id: string; type: string; name_ar: string; name_en: string }>();
  let archived = 0;
  for (const space of due.results) {
    const snapshot = await snapshotSpace(db, space.id);
    if (!snapshot) continue;
    const archiveId = crypto.randomUUID();
    const purgeAfter = archivePurgeAt(now);
    await db.prepare(
      `INSERT INTO plan_retention_archives (
        id, owner_user_id, original_space_id, space_type, name_ar, name_en, reason, snapshot_json, archived_at, purge_after
      ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      archiveId,
      space.owner_user_id,
      space.id,
      space.type,
      space.name_ar,
      space.name_en,
      "grace_expired",
      JSON.stringify(snapshot),
      now,
      purgeAfter,
    ).run();
    await deleteSpaceFromUserAccount(db, space.id, space.owner_user_id);
    archived += 1;
  }
  return { archived };
}

/** Admin-only: permanently drop archives past the 60-day window. */
export async function purgeExpiredRetentionArchives(db: D1Database) {
  await ensurePlanRetentionSchema(db);
  const now = new Date().toISOString();
  const rows = await db.prepare(
    "SELECT id FROM plan_retention_archives WHERE purged_at IS NULL AND restored_at IS NULL AND purge_after<=? LIMIT 50",
  ).bind(now).all<{ id: string }>();
  if (!rows.results.length) return { purged: 0 };
  await db.batch(
    rows.results.map((row) =>
      db.prepare("UPDATE plan_retention_archives SET purged_at=?, snapshot_json='{}' WHERE id=?").bind(now, row.id),
    ),
  );
  return { purged: rows.results.length };
}

export async function listRetentionArchivesForUser(db: D1Database, userId: string) {
  await ensurePlanRetentionSchema(db);
  const rows = await db.prepare(
    `SELECT id, original_space_id, space_type, name_ar, name_en, reason, archived_at, purge_after, restored_at, restored_by, purged_at
     FROM plan_retention_archives WHERE owner_user_id=? ORDER BY archived_at DESC LIMIT 100`,
  ).bind(userId).all();
  return rows.results.map((row) => ({
    ...row,
    restorable: !row.restored_at && !row.purged_at && String(row.purge_after) > new Date().toISOString(),
    adminOnlyNote: "paid_restore_within_60_days",
  }));
}

export async function restoreRetentionArchive(db: D1Database, archiveId: string, actorUserId: string) {
  await ensurePlanRetentionSchema(db);
  const row = await db.prepare(
    "SELECT * FROM plan_retention_archives WHERE id=?",
  ).bind(archiveId).first<{
    id: string;
    owner_user_id: string;
    original_space_id: string;
    snapshot_json: string;
    restored_at: string | null;
    purged_at: string | null;
    purge_after: string;
  }>();
  if (!row) throw new ApiError(404, "RETENTION_ARCHIVE_NOT_FOUND");
  if (row.restored_at) throw new ApiError(409, "RETENTION_ALREADY_RESTORED");
  if (row.purged_at || row.purge_after <= new Date().toISOString()) throw new ApiError(410, "RETENTION_ARCHIVE_EXPIRED");

  let snapshot: { space: Record<string, unknown>; members?: Record<string, unknown>[]; plans?: Record<string, unknown>[] };
  try {
    snapshot = JSON.parse(row.snapshot_json) as typeof snapshot;
  } catch {
    throw new ApiError(500, "RETENTION_SNAPSHOT_INVALID");
  }
  const space = snapshot.space;
  if (!space?.id) throw new ApiError(500, "RETENTION_SNAPSHOT_INVALID");
  const existing = await db.prepare("SELECT id FROM spaces WHERE id=?").bind(String(space.id)).first();
  if (existing) throw new ApiError(409, "SPACE_ID_EXISTS");

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO spaces (id,owner_user_id,name_ar,name_en,type,currency,balance_minor,goal_minor,accent,created_at,starts_at,status,grace_until)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL)`,
    ).bind(
      String(space.id),
      String(space.owner_user_id ?? row.owner_user_id),
      String(space.name_ar ?? ""),
      String(space.name_en ?? ""),
      String(space.type ?? "personal"),
      String(space.currency ?? "OMR"),
      Number(space.balance_minor ?? 0),
      Number(space.goal_minor ?? 0),
      String(space.accent ?? "emerald"),
      String(space.created_at ?? now),
      space.starts_at == null ? null : String(space.starts_at),
      "active",
    ),
  ];
  for (const member of snapshot.members ?? []) {
    statements.push(
      db.prepare(
        `INSERT INTO members (id,space_id,user_id,display_name,email,phone,role,status,due_minor,paid_minor,extra_minor,avatar,joined_at,addon_minor)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        String(member.id),
        String(member.space_id ?? space.id),
        member.user_id == null ? null : String(member.user_id),
        String(member.display_name ?? ""),
        member.email == null ? null : String(member.email),
        member.phone == null ? null : String(member.phone),
        String(member.role ?? "member"),
        String(member.status ?? "active"),
        Number(member.due_minor ?? 0),
        Number(member.paid_minor ?? 0),
        Number(member.extra_minor ?? 0),
        String(member.avatar ?? "#0f766e"),
        String(member.joined_at ?? now),
        Number(member.addon_minor ?? 0),
      ),
    );
  }
  for (const plan of snapshot.plans ?? []) {
    statements.push(
      db.prepare(
        `INSERT INTO contribution_plans (id,space_id,amount_minor,interval,due_day,extra_policy,duration_months,starts_at)
         VALUES (?,?,?,?,?,?,?,?)`,
      ).bind(
        String(plan.id),
        String(plan.space_id ?? space.id),
        Number(plan.amount_minor ?? 0),
        String(plan.interval ?? "monthly"),
        Number(plan.due_day ?? 1),
        String(plan.extra_policy ?? "personal_reserve"),
        Number(plan.duration_months ?? 12),
        String(plan.starts_at ?? now),
      ),
    );
  }
  statements.push(
    db.prepare("UPDATE plan_retention_archives SET restored_at=?, restored_by=? WHERE id=?").bind(now, actorUserId, archiveId),
    prepareAudit(db, {
      userId: actorUserId,
      action: "wallet.retention_restored",
      entityType: "space",
      entityId: String(space.id),
      metadata: { archiveId, ownerUserId: row.owner_user_id, paidRestore: true },
      createdAt: now,
    }),
  );
  await db.batch(statements);
  return { ok: true, spaceId: String(space.id) };
}
