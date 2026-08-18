import { z } from "zod";
import { ensureSchema, getRawDb, type RequestUser } from "../../../db/runtime";
import { authenticateRequest, clearCsrfCookie, clearSessionCookie, csrfCookie, issueCsrfToken } from "../../../lib/auth";
import { buildCircleOrder, minimizeSettlements, splitContributionPayment, splitEvenly, type CircleMode, type ExtraPolicy } from "../../../lib/finance";
import { ApiError, claimIdempotency, completeIdempotency, enforceCsrf, enforceWriteRequest, errorResponse, rateLimit, releaseIdempotency } from "../../../lib/security";
import { assertApiScope, authorizeSpace, ensureDefaultTenant, platformRoleOf } from "../../../lib/authorization";
import { prepareAudit } from "../../../lib/audit";
import { multiplyMinor, parseMoneyToMinor, parseNonNegativeMoneyToMinor } from "../../../lib/money";
import { allocateOldestFirst, buildInstallmentSchedule, installmentStatus, periodKeyFromDate, type InstallmentLike } from "../../../lib/installments";
import { coveringPeriod } from "../../../lib/accounting-periods";
import { isLikelyPhone, toWhatsAppNumber } from "../../../lib/phone";
import { accountLiveBalance, dueAtForPeriod, monthKeysForRule, occurrenceLedgerStatus } from "../../../lib/personal-finance";
import { forecastFamilyEvent, monthCountUntil } from "../../../lib/household-forecast";
import { filterSpacesByPlan } from "../../../lib/plan-features";
import { filterSpacesForPlanAccess } from "../../../lib/plan-retention";

type SpaceRow = {
  id: string;
  owner_user_id: string;
  name_ar: string;
  name_en: string;
  type: string;
  currency: string;
  balance_minor: number;
  goal_minor: number;
  accent: string;
  created_at: string;
  starts_at?: string | null;
  status?: string;
};

type MemberRow = {
  id: string;
  space_id: string;
  user_id: string | null;
  display_name: string;
  email: string | null;
  role: string;
  status: string;
  due_minor: number;
  paid_minor: number;
  extra_minor: number;
  addon_minor?: number;
  phone?: string | null;
  avatar: string;
  joined_at: string;
};

type InstallmentRow = InstallmentLike & { member_id: string; space_id: string; due_at: string };

type TransactionRow = {
  id: string;
  space_id: string;
  user_id: string;
  member_id: string | null;
  kind: string;
  allocation: string;
  amount_minor: number;
  description_ar: string;
  description_en: string;
  status: string;
  occurred_at: string;
  created_at: string;
  account_id?: string | null;
};

type PersonalOccurrenceRow = {
  id: string;
  rule_id: string;
  space_id: string;
  account_id?: string | null;
  period_key: string;
  due_at: string;
  expected_minor: number;
  actual_minor?: number | null;
  status: string;
  transaction_id?: string | null;
  created_at: string;
  rule_name?: string;
  rule_kind?: string;
  amount_mode?: string;
  total_minor?: number;
  rule_paid_minor?: number;
};

const now = () => new Date().toISOString();

async function guardOwnerTransactionQuota(db: D1Database, ownerUserId: string, extra = 1) {
  const { assertOwnerPlanQuota } = await import("../../../services/admin/billing-service");
  await assertOwnerPlanQuota(db, ownerUserId, "transaction", extra);
}

function cleanId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

function parseStartDate(value?: string) {
  if (!value) return now();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, "INVALID_START_DATE");
  return date.toISOString();
}

const optionalId = z.preprocess((value) => (value === "" || value == null ? undefined : value), z.string().min(1).max(120).optional());
const optionalAmount = z.preprocess((value) => (value === "" || value == null ? undefined : value), z.union([z.string(), z.number()]).optional());

type PeriodRow = {
  id: string;
  space_id: string;
  label: string;
  starts_at: string;
  ends_at?: string | null;
  closed_at?: string | null;
  status: string;
};

function preparePeriodLedgerEvent(db: D1Database, input: {
  spaceId: string;
  periodId?: string | null;
  userId: string;
  actorName: string;
  action: string;
  entityType?: string;
  entityId?: string;
  summaryAr: string;
  summaryEn: string;
  metadata?: unknown;
  createdAt?: string;
}) {
  const createdAt = input.createdAt ?? now();
  return db.prepare(`INSERT INTO period_ledger_events (id,space_id,period_id,user_id,actor_name,action,entity_type,entity_id,summary_ar,summary_en,metadata_json,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(
      crypto.randomUUID(),
      input.spaceId,
      input.periodId ?? null,
      input.userId,
      input.actorName.slice(0, 120),
      input.action.slice(0, 80),
      input.entityType ?? null,
      input.entityId ?? null,
      input.summaryAr.slice(0, 400),
      input.summaryEn.slice(0, 400),
      JSON.stringify(input.metadata ?? {}),
      createdAt,
    );
}

async function assertMembersSettledForClose(db: D1Database, spaceId: string) {
  const members = await db.prepare("SELECT id,display_name,due_minor,paid_minor FROM members WHERE space_id=? AND status='active'").bind(spaceId).all<{ id: string; display_name: string; due_minor: number; paid_minor: number }>();
  const asOf = now();
  const owingDues: typeof members.results = [];
  for (const member of members.results) {
    const inst = await db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(CASE WHEN due_at <= ? THEN amount_minor ELSE 0 END), 0) AS accrued FROM member_installments WHERE member_id=?").bind(asOf, member.id).first<{ count: number; accrued: number }>();
    const accrued = Number(inst?.count ?? 0) > 0 ? Number(inst?.accrued ?? 0) : Number(member.due_minor);
    if (accrued > Number(member.paid_minor)) owingDues.push(member);
  }
  const pending = await db.prepare("SELECT COUNT(*) AS count FROM settlements WHERE space_id=? AND status='pending'").bind(spaceId).first<{ count: number }>();
  if (owingDues.length > 0 || Number(pending?.count ?? 0) > 0) throw new ApiError(409, "PERIOD_UNSETTLED");
}

async function assertPeriodWritable(db: D1Database, spaceId: string, occurredAt: string) {
  const rows = await db.prepare("SELECT id,space_id,starts_at,ends_at,closed_at,status FROM accounting_periods WHERE space_id=?").bind(spaceId).all<PeriodRow>();
  const period = coveringPeriod(rows.results, occurredAt);
  if (period?.status === "closed") throw new ApiError(409, "PERIOD_CLOSED");
  return period;
}

async function periodWriteEvent(
  db: D1Database,
  user: RequestUser,
  spaceId: string,
  occurredAt: string,
  detail: { action: string; entityType: string; entityId: string; summaryAr: string; summaryEn: string; metadata?: unknown },
) {
  const period = await assertPeriodWritable(db, spaceId, occurredAt);
  return preparePeriodLedgerEvent(db, {
    spaceId,
    periodId: period?.id,
    userId: user.id,
    actorName: user.displayName,
    action: detail.action,
    entityType: detail.entityType,
    entityId: detail.entityId,
    summaryAr: detail.summaryAr,
    summaryEn: detail.summaryEn,
    metadata: { ...(detail.metadata && typeof detail.metadata === "object" ? detail.metadata as Record<string, unknown> : {}), occurredAt, periodStatus: period?.status ?? "none" },
  });
}

async function upsertSavedContact(
  db: D1Database,
  ownerUserId: string,
  contact: { displayName: string; email?: string | null; phone?: string | null },
  createdAt: string,
) {
  const email = contact.email?.trim() || null;
  const phone = contact.phone?.trim() || null;
  if (!email && !phone) return;
  const existing = email
    ? await db.prepare("SELECT id FROM saved_contacts WHERE owner_user_id=? AND email=? LIMIT 1").bind(ownerUserId, email).first<{ id: string }>()
    : await db.prepare("SELECT id FROM saved_contacts WHERE owner_user_id=? AND phone=? LIMIT 1").bind(ownerUserId, phone).first<{ id: string }>();
  if (existing) {
    await db.prepare("UPDATE saved_contacts SET display_name=?, email=?, phone=? WHERE id=?").bind(contact.displayName, email, phone, existing.id).run();
    return;
  }
  await db.prepare("INSERT INTO saved_contacts (id,owner_user_id,display_name,email,phone,created_at) VALUES (?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), ownerUserId, contact.displayName, email, phone, createdAt).run();
}

async function ensureUser(db: D1Database, user: RequestUser) {
  const createdAt = now();
  const existing = await db.prepare("SELECT id FROM users WHERE id=?").bind(user.id).first<{ id: string }>();
  if (!existing) {
    await db
      .prepare(`INSERT INTO users (id, email, display_name, locale, currency, created_at)
        VALUES (?, ?, ?, 'ar', 'OMR', ?)`)
      .bind(user.id, user.email, user.displayName, createdAt)
      .run();
  }

  if (!existing) {
    const configuredAdmins = (process.env.WAZEN_ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase());
    const role = configuredAdmins.includes(user.email.toLowerCase()) ? "super_admin" : "customer";
    await db.batch([
      db.prepare(`INSERT INTO customer_profiles (user_id,status,country,last_seen_at,created_at) VALUES (?,'active','OM',?,?)
        ON CONFLICT(user_id) DO UPDATE SET last_seen_at=excluded.last_seen_at`).bind(user.id, createdAt, createdAt),
      db.prepare(`INSERT OR IGNORE INTO platform_roles (user_id,role,permissions_json,created_at,updated_at) VALUES (?,?,?,?,?)`)
        .bind(user.id, role, role === "super_admin" ? '["*"]' : '["wallets:own","documents:own"]', createdAt, createdAt),
    ]);
    await ensureDefaultTenant(db, user);
  }

  // Real accounts start empty. Seeded finance data is restricted to explicit local demo mode.
  if (!user.isDemo) return;

  const spaceCount = await db
    .prepare("SELECT COUNT(*) AS count FROM spaces WHERE owner_user_id = ?")
    .bind(user.id)
    .first<{ count: number }>();
  if ((spaceCount?.count ?? 0) > 0) return;

  const prefix = cleanId(user.id);
  const personal = `${prefix}-personal`;
  const household = `${prefix}-household`;
  const trip = `${prefix}-trip`;
  const society = `${prefix}-society`;

  await db.batch([
    db.prepare("INSERT INTO spaces VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
      personal, user.id, "محفظتي الشخصية", "Personal wallet", "personal", "OMR", 842000, 1500000, "navy", createdAt,
    ),
    db.prepare("INSERT INTO spaces VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
      household, user.id, "ميزانية المنزل", "Home budget", "household", "OMR", 124700, 300000, "amber", createdAt,
    ),
    db.prepare("INSERT INTO spaces VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
      trip, user.id, "رحلة العائلة 2027", "Family trip 2027", "trip", "OMR", 386000, 1200000, "emerald", createdAt,
    ),
    db.prepare("INSERT INTO spaces VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
      society, user.id, "جمعية الإخوة", "Siblings circle", "society", "OMR", 210000, 1200000, "purple", createdAt,
    ),
    db.prepare("INSERT INTO contribution_plans (id,space_id,amount_minor,interval,due_day,extra_policy,duration_months,starts_at) VALUES (?, ?, ?, 'monthly', 1, 'personal_reserve', 60, ?)").bind(`${trip}-plan`, trip, 2000, createdAt),
    db.prepare("INSERT INTO contribution_plans (id,space_id,amount_minor,interval,due_day,extra_policy,duration_months,starts_at) VALUES (?, ?, ?, 'monthly', 5, 'personal_reserve', 60, ?)").bind(`${society}-plan`, society, 20000, createdAt),
  ]);

  const people = [
    ["ahmad", "أحمد محمد", user.email, "owner", 2000, 2000, 2000, "#0f766e"],
    ["khalid", "خالد محمد", "khalid@example.com", "treasurer", 2000, 2000, 0, "#2563eb"],
    ["fatima", "فاطمة محمد", "fatima@example.com", "member", 2000, 2000, 3000, "#c2410c"],
    ["sara", "سارة محمد", "sara@example.com", "member", 2000, 0, 0, "#7c3aed"],
    ["omar", "عمر محمد", "omar@example.com", "member", 2000, 2000, 1400, "#0891b2"],
  ] as const;
  await db.batch(
    people.map((person) =>
      db.prepare("INSERT INTO members VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)").bind(
        `${trip}-${person[0]}`,
        trip,
        person[0] === "ahmad" ? user.id : null,
        person[1],
        person[2],
        person[3],
        person[4],
        person[5],
        person[6],
        person[7],
        createdAt,
      ),
    ),
  );

  const transactionSeeds = [
    [personal, "income", "general", 720000, "راتب شهر أغسطس", "August salary", "2026-08-01T08:00:00.000Z"],
    [personal, "expense", "general", 26800, "مشتريات المنزل", "Home groceries", "2026-08-10T17:20:00.000Z"],
    [personal, "expense", "general", 12000, "وقود السيارة", "Car fuel", "2026-08-09T12:15:00.000Z"],
    [household, "expense", "general", 34000, "فاتورة الكهرباء", "Electricity bill", "2026-08-08T10:00:00.000Z"],
    [trip, "contribution", "mandatory", 2000, "مساهمة أحمد الشهرية", "Ahmad monthly contribution", "2026-08-07T09:30:00.000Z"],
    [trip, "contribution", "personal_reserve", 3000, "فائض شخصي لفاطمة", "Fatima personal reserve", "2026-08-07T09:35:00.000Z"],
    [society, "contribution", "mandatory", 20000, "دفعة الجمعية الشهرية", "Monthly circle payment", "2026-08-05T11:00:00.000Z"],
    [trip, "reimbursement", "general", 60000, "حجز دفعه خالد من ماله", "Booking paid by Khalid", "2026-08-03T14:00:00.000Z"],
  ] as const;

  await db.batch(
    transactionSeeds.map((item, index) =>
      db.prepare("INSERT INTO transactions VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 'approved', ?, ?)").bind(
        `${prefix}-tx-${index + 1}`,
        item[0],
        user.id,
        item[1],
        item[2],
        item[3],
        item[4],
        item[5],
        item[6],
        createdAt,
      ),
    ),
  );
}

/** Rebuild member paid/extra ledgers from approved transactions (fixes income not updating dues). */
async function reconcileMemberLedgers(db: D1Database, spaceIds: string[]) {
  if (!spaceIds.length) return;
  const placeholders = spaceIds.map(() => "?").join(",");
  await db
    .prepare(
      `UPDATE members SET
        paid_minor = COALESCE((
          SELECT SUM(t.amount_minor) FROM transactions t
          WHERE t.member_id = members.id AND t.space_id = members.space_id AND t.status = 'approved'
            AND (
              (t.kind = 'contribution' AND t.allocation IN ('mandatory', 'general', 'advance'))
              OR (t.kind = 'income' AND t.allocation IN ('mandatory', 'general', 'advance'))
            )
        ), 0),
        extra_minor = COALESCE((
          SELECT SUM(
            CASE
              WHEN t.kind = 'contribution' AND t.allocation = 'personal_reserve' THEN t.amount_minor
              WHEN t.kind = 'reimbursement' AND t.allocation = 'personal_reserve' THEN -t.amount_minor
              ELSE 0
            END
          ) FROM transactions t
          WHERE t.member_id = members.id AND t.space_id = members.space_id AND t.status = 'approved'
        ), 0),
        addon_minor = COALESCE((
          SELECT SUM(t.amount_minor) FROM transactions t
          WHERE t.member_id = members.id AND t.space_id = members.space_id AND t.status = 'approved'
            AND t.allocation = 'extra'
            AND (
              t.kind = 'expense'
              OR (t.kind = 'income' AND t.description_ar = 'تسوية حصة مصروف للصندوق')
            )
        ), 0)
       WHERE space_id IN (${placeholders})`,
    )
    .bind(...spaceIds)
    .run();
}

function transactionBalanceDelta(kind: string, allocation: string, amountMinor: number) {
  if (allocation === "personal_reserve") return 0;
  if (["income", "contribution"].includes(kind)) return amountMinor;
  if (kind === "expense") return -amountMinor;
  return 0;
}

async function syncFundExpenseCash(db: D1Database, spaceIds: string[]) {
  if (!spaceIds.length) return;
  for (const spaceId of spaceIds) {
    const rows = await db.prepare(`SELECT te.id, te.space_id, te.amount_minor, te.description, te.occurred_at, te.created_by, te.transaction_id, te.created_at,
        t.id AS txn_id, t.amount_minor AS txn_amount, t.status AS txn_status, t.kind AS txn_kind
      FROM trip_expenses te
      LEFT JOIN transactions t ON t.id = te.transaction_id
      WHERE te.space_id=? AND te.status='posted'
        AND COALESCE(te.paid_from, CASE WHEN t.kind='expense' THEN 'common_fund' ELSE 'member' END)='common_fund'`).bind(spaceId).all<{
      id: string; space_id: string; amount_minor: number; description: string; occurred_at: string; created_by: string; transaction_id: string | null; created_at: string;
      txn_id: string | null; txn_amount: number | null; txn_status: string | null; txn_kind: string | null;
    }>();
    for (const row of rows.results) {
      const amountMinor = Number(row.amount_minor);
      if (!row.txn_id) {
        const transactionId = crypto.randomUUID();
        await db.batch([
          db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,'general',?,?,?,'approved',?,?)")
            .bind(transactionId, row.space_id, row.created_by, null, "expense", amountMinor, row.description, row.description, row.occurred_at, row.created_at),
          db.prepare("UPDATE trip_expenses SET transaction_id=? WHERE id=?").bind(transactionId, row.id),
        ]);
      } else if (row.txn_status === "approved" && Number(row.txn_amount) !== amountMinor) {
        await db.prepare("UPDATE transactions SET amount_minor=?, member_id=NULL WHERE id=?").bind(amountMinor, row.txn_id).run();
      }
    }
  }
}

async function syncFundDeficitShares(db: D1Database, spaceIds: string[]) {
  if (!spaceIds.length) return;
  const createdAt = now();
  for (const spaceId of spaceIds) {
    const space = await db.prepare("SELECT type, balance_minor FROM spaces WHERE id=?").bind(spaceId).first<{ type: string; balance_minor: number }>();
    if (!space || space.type === "personal") continue;
    const fundId = `space:${spaceId}`;
    await db.prepare("UPDATE settlements SET status='voided' WHERE space_id=? AND status='pending' AND to_member_id=? AND expense_id IS NULL").bind(spaceId, fundId).run();
    const deficit = Math.max(0, -Number(space.balance_minor));
    if (deficit <= 0) continue;
    const members = await db.prepare("SELECT id, due_minor FROM members WHERE space_id=? AND status='active' ORDER BY joined_at").bind(spaceId).all<{ id: string; due_minor: number }>();
    const contributors = members.results.filter((member) => Number(member.due_minor) > 0);
    const payers = (contributors.length ? contributors : members.results).map((member) => member.id);
    if (!payers.length) continue;
    for (const share of splitEvenly(deficit, payers)) {
      if (share.shareMinor <= 0) continue;
      await db.prepare("INSERT INTO settlements (id,space_id,from_member_id,to_member_id,amount_minor,status,created_at,expense_id) VALUES (?,?,?,?,?,'pending',?,NULL)")
        .bind(crypto.randomUUID(), spaceId, share.memberId, fundId, share.shareMinor, createdAt).run();
    }
  }
}

function approvedCashMinor(rows: Array<{ account_id?: string | null; kind: string; amount_minor: number; allocation?: string; status?: string }>, accountId?: string) {
  return rows.reduce((sum, row) => {
    if ((row.status ?? "approved") !== "approved") return sum;
    if (accountId !== undefined && row.account_id !== accountId) return sum;
    if (row.allocation === "personal_reserve") return sum;
    if (row.kind === "income" || row.kind === "contribution") return sum + Number(row.amount_minor);
    if (row.kind === "expense") return sum - Number(row.amount_minor);
    return sum;
  }, 0);
}

async function writeApprovedCashBalance(db: D1Database, spaceId: string) {
  const row = await db.prepare(`SELECT COALESCE(SUM(CASE
    WHEN COALESCE(allocation,'general') = 'personal_reserve' THEN 0
    WHEN kind IN ('income','contribution') THEN amount_minor
    WHEN kind = 'expense' THEN -amount_minor
    ELSE 0
  END), 0) AS balance FROM transactions WHERE space_id=? AND status='approved'`).bind(spaceId).first<{ balance: number }>();
  await db.prepare("UPDATE spaces SET balance_minor=? WHERE id=?").bind(Number(row?.balance ?? 0), spaceId).run();
}

async function rebuildSpaceBalance(db: D1Database, spaceIds: string[]) {
  if (!spaceIds.length) return;
  const placeholders = spaceIds.map(() => "?").join(",");
  const types = await db.prepare(`SELECT id, type FROM spaces WHERE id IN (${placeholders})`).bind(...spaceIds).all<{ id: string; type: string }>();
  const groupIds = types.results.filter((row) => row.type !== "personal").map((row) => row.id);
  if (groupIds.length) await syncFundExpenseCash(db, groupIds);
  for (const space of types.results) {
    const spaceId = space.id;
    if (space.type === "personal") {
      try {
        const accounts = await db.prepare("SELECT id,opening_minor FROM personal_accounts WHERE space_id=? AND status='active'").bind(spaceId).all<{ id: string; opening_minor: number }>();
        if (accounts.results.length) {
          let txns: Array<{ account_id?: string | null; kind: string; amount_minor: number; status: string }>;
          try {
            txns = (await db.prepare("SELECT account_id,kind,amount_minor,status FROM transactions WHERE space_id=? AND status='approved'").bind(spaceId).all<{ account_id?: string | null; kind: string; amount_minor: number; status: string }>()).results;
          } catch {
            txns = (await db.prepare("SELECT kind,amount_minor,status FROM transactions WHERE space_id=? AND status='approved'").bind(spaceId).all<{ kind: string; amount_minor: number; status: string }>()).results;
          }
          const unassigned = approvedCashMinor(txns.filter((row) => !row.account_id));
          const assigned = accounts.results.reduce((sum, account) => sum + accountLiveBalance(Number(account.opening_minor), txns, account.id), 0);
          await db.prepare("UPDATE spaces SET balance_minor=? WHERE id=?").bind(assigned + unassigned, spaceId).run();
          continue;
        }
      } catch { /* fall through to ledger sum */ }
    }
    await writeApprovedCashBalance(db, spaceId);
  }
  if (groupIds.length) await syncFundDeficitShares(db, groupIds);
}

async function voidApprovedTransaction(
  db: D1Database,
  txn: {
    id: string;
    space_id: string;
    member_id: string | null;
    kind: string;
    allocation: string;
    amount_minor: number;
    status: string;
    occurred_at?: string;
    description_ar?: string;
  },
  actorUserId: string,
  options?: { recordStatus?: "voided" | "superseded"; closeOccurrence?: boolean },
) {
  if (txn.status === "voided" || txn.status === "superseded") throw new ApiError(409, "ALREADY_VOIDED");
  if (txn.status !== "approved") throw new ApiError(409, "TRANSACTION_NOT_EDITABLE");
  const recordStatus = options?.recordStatus ?? "voided";
  const closeOccurrence = options?.closeOccurrence !== false;
  const amountMinor = Number(txn.amount_minor);
  const createdAt = now();
  const voided = await db.prepare("UPDATE transactions SET status=? WHERE id=? AND status='approved'").bind(recordStatus, txn.id).run();
  if (!voided.meta.changes) throw new ApiError(409, "ALREADY_VOIDED");
  if (txn.allocation === "extra" && txn.occurred_at) {
    try {
      await db.prepare(`UPDATE transactions SET status=?
        WHERE space_id=? AND allocation='extra' AND amount_minor=? AND occurred_at=? AND status='approved' AND id<>?`)
        .bind(recordStatus, txn.space_id, amountMinor, txn.occurred_at, txn.id)
        .run();
      if (txn.member_id) {
        await db.prepare(`UPDATE settlements SET status='pending', settled_at=NULL
          WHERE space_id=? AND status='settled' AND amount_minor=?
            AND (from_member_id=? OR to_member_id=?)
            AND settled_at=?`)
          .bind(txn.space_id, amountMinor, txn.member_id, txn.member_id, txn.occurred_at)
          .run();
      }
    } catch { /* extra share reversal is best-effort; ledger rebuild still drops addon */ }
  }
  const statements: ReturnType<D1Database["prepare"]>[] = [
    prepareAudit(db, {
      userId: actorUserId,
      action: "transaction.voided",
      entityType: "transaction",
      entityId: txn.id,
      metadata: { spaceId: txn.space_id, kind: txn.kind, allocation: txn.allocation, amountMinor },
      createdAt,
    }),
  ];
  try {
    statements.push(db.prepare("UPDATE trip_expenses SET status='voided' WHERE transaction_id=?").bind(txn.id));
  } catch { /* personal wallets and older schemas may lack this column */ }
  try {
    if (closeOccurrence) {
      const postedOccurrence = await db.prepare(`SELECT o.id, o.rule_id, o.actual_minor, r.kind
        FROM personal_occurrences o JOIN personal_rules r ON r.id=o.rule_id
        WHERE o.transaction_id=?`)
        .bind(txn.id)
        .first<{ id: string; rule_id: string; actual_minor: number | null; kind: string }>();
      const occurrence = postedOccurrence ?? await db.prepare(`SELECT o.id, o.rule_id, o.actual_minor, r.kind
        FROM personal_occurrences o JOIN personal_rules r ON r.id=o.rule_id
        WHERE o.space_id=? AND o.status='posted' AND COALESCE(o.actual_minor, o.expected_minor)=?`)
        .bind(txn.space_id, amountMinor)
        .first<{ id: string; rule_id: string; actual_minor: number | null; kind: string }>();
      if (occurrence) {
        const postedMinor = Number(occurrence.actual_minor ?? txn.amount_minor);
        statements.push(db.prepare("UPDATE personal_occurrences SET status='pending', actual_minor=NULL, transaction_id=NULL WHERE id=?").bind(occurrence.id));
        if (occurrence.kind === "expense") {
          statements.push(db.prepare("UPDATE personal_rules SET paid_minor = MAX(0, paid_minor - ?) WHERE id=?").bind(postedMinor, occurrence.rule_id));
        }
      }
    }
  } catch { /* occurrence close is best-effort */ }
  try {
    await db.batch(statements);
  } catch { /* audit must not block void */ }
  try {
    await rebuildSpaceBalance(db, [txn.space_id]);
  } catch {
    await writeApprovedCashBalance(db, txn.space_id);
  }
  try {
  await reconcileMemberLedgers(db, [txn.space_id]);
  } catch { /* member ledgers are not used by personal cash */ }
}

async function installmentInsertStatements(
  db: D1Database,
  member: { id: string; space_id: string; paid_minor: number },
  plan: { amount_minor: number; duration_months: number; starts_at?: string } | null,
  createdAt: string,
) {
  if (!plan || Number(plan.amount_minor) <= 0) return [];
  const schedule = buildInstallmentSchedule({
    memberId: member.id,
    spaceId: member.space_id,
    startAt: plan.starts_at || createdAt,
    durationMonths: Number(plan.duration_months) || 12,
    amountMinor: Number(plan.amount_minor),
    paidMinor: Number(member.paid_minor),
  });
  return schedule.rows.map((row) =>
    db.prepare("INSERT OR IGNORE INTO member_installments (id,member_id,space_id,period_index,period_key,due_at,amount_minor,paid_minor,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(row.id, member.id, member.space_id, row.period_index, row.period_key, row.due_at, row.amount_minor, row.paid_minor, row.status, createdAt),
  );
}

async function rebuildSpaceInstallments(
  db: D1Database,
  spaceId: string,
  plan: { amount_minor: number; duration_months: number; starts_at?: string } | null,
  createdAt: string,
) {
  if (!plan || Number(plan.amount_minor) <= 0) return;
  const members = await db.prepare("SELECT id,space_id,paid_minor FROM members WHERE space_id=? AND status='active'").bind(spaceId).all<{ id: string; space_id: string; paid_minor: number }>();
  const duration = Number(plan.duration_months) || 12;
  const dueMinor = Number(plan.amount_minor) * duration;
  const statements: ReturnType<D1Database["prepare"]>[] = [
    db.prepare("DELETE FROM member_installments WHERE space_id=?").bind(spaceId),
  ];
  for (const member of members.results) {
    const paid = Number(member.paid_minor);
    statements.push(db.prepare("UPDATE members SET due_minor=? WHERE id=?").bind(Math.max(dueMinor, paid), member.id));
    const schedule = buildInstallmentSchedule({
      memberId: member.id,
      spaceId: member.space_id,
      startAt: plan.starts_at || createdAt,
      durationMonths: duration,
      amountMinor: Number(plan.amount_minor),
      paidMinor: paid,
    });
    for (const row of schedule.rows) {
      statements.push(
        db.prepare("INSERT INTO member_installments (id,member_id,space_id,period_index,period_key,due_at,amount_minor,paid_minor,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
          .bind(row.id, member.id, member.space_id, row.period_index, row.period_key, row.due_at, row.amount_minor, row.paid_minor, row.status, createdAt),
      );
    }
  }
  if (statements.length) await db.batch(statements);
}

type PersonalRuleRow = {
  id: string;
  space_id: string;
  account_id: string | null;
  kind: string;
  name: string;
  amount_mode: string;
  schedule?: string;
  amount_minor: number;
  due_day: number;
  starts_at: string;
  ends_at: string | null;
  total_minor: number;
  duration_months: number;
  paid_minor: number;
  status: string;
};

async function generatePersonalOccurrences(db: D1Database, spaceIds: string[]) {
  if (!spaceIds.length) return;
  const placeholders = spaceIds.map(() => "?").join(",");
  const [rules, existing] = await Promise.all([
    db.prepare(`SELECT * FROM personal_rules WHERE space_id IN (${placeholders}) AND status='active'`).bind(...spaceIds).all<PersonalRuleRow>(),
    db.prepare(`SELECT rule_id, period_key FROM personal_occurrences WHERE space_id IN (${placeholders})`).bind(...spaceIds).all<{ rule_id: string; period_key: string }>(),
  ]);
  const seen = new Set(existing.results.map((row) => `${row.rule_id}:${row.period_key}`));
  const createdAt = now();
  const statements: ReturnType<D1Database["prepare"]>[] = [];
  for (const rule of rules.results) {
    if ((rule.schedule || "monthly") === "unscheduled") continue;
    for (const periodKey of monthKeysForRule({ startsAt: rule.starts_at, endsAt: rule.ends_at, schedule: rule.schedule })) {
      if (seen.has(`${rule.id}:${periodKey}`)) continue;
      statements.push(
        db.prepare("INSERT OR IGNORE INTO personal_occurrences (id,rule_id,space_id,account_id,period_key,due_at,expected_minor,actual_minor,status,transaction_id,created_at) VALUES (?,?,?,?,?,?,?,NULL,'pending',NULL,?)")
          .bind(crypto.randomUUID(), rule.id, rule.space_id, rule.account_id, periodKey, dueAtForPeriod(periodKey, Number(rule.due_day)), Number(rule.amount_minor), createdAt),
      );
    }
  }
  if (statements.length) await db.batch(statements);
}

async function paymentInstallmentStatements(
  db: D1Database,
  member: { id: string; space_id: string; paid_minor: number },
  plan: { amount_minor: number; duration_months: number; starts_at?: string } | null,
  paymentMinor: number,
  createdAt: string,
  selectedIds?: string[],
) {
  const existing = await db.prepare("SELECT * FROM member_installments WHERE member_id=? ORDER BY period_index").bind(member.id).all<InstallmentRow>();
  const statements: ReturnType<D1Database["prepare"]>[] = [];
  let rows: InstallmentLike[] = existing.results;
  if (!rows.length) {
    statements.push(...await installmentInsertStatements(db, member, plan, createdAt));
    if (plan && Number(plan.amount_minor) > 0) {
      rows = buildInstallmentSchedule({
        memberId: member.id,
        spaceId: member.space_id,
        startAt: plan.starts_at || createdAt,
        durationMonths: Number(plan.duration_months) || 12,
        amountMinor: Number(plan.amount_minor),
        paidMinor: Number(member.paid_minor),
      }).rows;
    }
  }
  if (!rows.length) return { statements, allocated: { allocations: [] as ReturnType<typeof allocateOldestFirst>["allocations"], appliedMinor: 0, leftoverMinor: paymentMinor } };
  const allocated = allocateOldestFirst(rows, paymentMinor, selectedIds);
  for (const item of allocated.allocations) {
    const row = rows.find((entry) => entry.id === item.installmentId);
    if (!row) continue;
    const paid = Number(row.paid_minor) + item.amountMinor;
    statements.push(db.prepare("UPDATE member_installments SET paid_minor=?, status=? WHERE id=?").bind(paid, installmentStatus(Number(row.amount_minor), paid), item.installmentId));
  }
  return { statements, allocated };
}

type TripExpenseRecord = {
  id: string;
  space_id: string;
  paid_by_member_id: string;
  amount_minor: number;
  description: string;
  occurred_at?: string;
  created_at?: string;
  transaction_id?: string | null;
  status?: string | null;
  paid_from?: string | null;
};

async function rebuildTripExpenseShares(
  db: D1Database,
  userId: string,
  expense: TripExpenseRecord,
  next: { amountMinor: number; description: string; paidByMemberId: string },
) {
  if ((expense.status ?? "posted") === "voided") throw new ApiError(409, "EXPENSE_VOIDED");
  const settled = await db.prepare("SELECT COUNT(*) AS count FROM settlements WHERE expense_id=? AND status='settled'").bind(expense.id).first<{ count: number }>();
  if (Number(settled?.count ?? 0) > 0) throw new ApiError(409, "EXPENSE_ALREADY_SETTLED");
  const members = await db.prepare("SELECT id FROM members WHERE space_id=? AND status='active' ORDER BY joined_at").bind(expense.space_id).all<{ id: string }>();
  if (!members.results.length) throw new ApiError(400, "NO_ACTIVE_MEMBERS");
  const linked = expense.transaction_id
    ? await db.prepare("SELECT * FROM transactions WHERE id=?").bind(expense.transaction_id).first<TransactionRow>()
    : null;
  const paidFromFund = linked?.kind === "expense" || expense.paid_from === "common_fund";
  if (!paidFromFund && !members.results.some((member) => member.id === next.paidByMemberId)) throw new ApiError(400, "INVALID_PAYER");
  const splits = splitEvenly(next.amountMinor, members.results.map((member) => member.id));
  const createdAt = now();
  const statements: D1PreparedStatement[] = [
    db.prepare("UPDATE trip_expenses SET paid_by_member_id=?, amount_minor=?, description=? WHERE id=?").bind(paidFromFund ? expense.paid_by_member_id : next.paidByMemberId, next.amountMinor, next.description, expense.id),
    db.prepare("DELETE FROM expense_splits WHERE expense_id=?").bind(expense.id),
    db.prepare("UPDATE settlements SET status='voided' WHERE expense_id=? AND status='pending'").bind(expense.id),
  ];
  if (linked && linked.status === "approved") {
    statements.push(db.prepare("UPDATE transactions SET amount_minor=?, description_ar=?, description_en=?, member_id=? WHERE id=?").bind(next.amountMinor, next.description, next.description, paidFromFund ? null : next.paidByMemberId, linked.id));
    if (paidFromFund) {
      const delta = next.amountMinor - Number(expense.amount_minor);
      if (delta !== 0) statements.push(db.prepare("UPDATE spaces SET balance_minor = balance_minor - ? WHERE id=?").bind(delta, expense.space_id));
    }
  }
  for (const split of splits) {
    statements.push(db.prepare("INSERT INTO expense_splits (id,expense_id,member_id,share_minor) VALUES (?,?,?,?)").bind(crypto.randomUUID(), expense.id, split.memberId, split.shareMinor));
  }
  if (!paidFromFund) {
    const balances = members.results.map((member) => {
      const share = splits.find((item) => item.memberId === member.id)?.shareMinor ?? 0;
      const paid = member.id === next.paidByMemberId ? next.amountMinor : 0;
      return { memberId: member.id, balanceMinor: paid - share };
    });
    for (const settlement of minimizeSettlements(balances)) {
      statements.push(
        db.prepare("INSERT INTO settlements (id,space_id,from_member_id,to_member_id,amount_minor,status,created_at,expense_id) VALUES (?,?,?,?,?,'pending',?,?)")
          .bind(crypto.randomUUID(), expense.space_id, settlement.fromMemberId, settlement.toMemberId, settlement.amountMinor, createdAt, expense.id),
      );
    }
  }
  statements.push(prepareAudit(db, {
    userId,
    action: "trip.expense_resplit",
    entityType: "trip_expense",
    entityId: expense.id,
    metadata: { amountMinor: next.amountMinor, paidByMemberId: next.paidByMemberId, memberCount: members.results.length },
    createdAt,
  }));
  await db.batch(statements);
  await rebuildSpaceBalance(db, [expense.space_id]);
}

async function deleteSpaceCascade(db: D1Database, spaceId: string, userId: string) {
  const createdAt = now();
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
    prepareAudit(db, { userId, action: "wallet.deleted", entityType: "space", entityId: spaceId, metadata: {}, createdAt }),
    db.prepare("DELETE FROM spaces WHERE id=?").bind(spaceId),
  ]);
}

async function loadDashboard(db: D1Database, userId: string, options?: { refreshDerived?: boolean; features?: string[] }) {
  const [spaces, contacts] = await Promise.all([
    db
      .prepare(`SELECT s.* FROM spaces s
        WHERE s.owner_user_id=? OR EXISTS (
          SELECT 1 FROM members m WHERE m.space_id=s.id AND m.status='active' AND m.user_id=?
        )
        ORDER BY s.created_at ASC`)
    .bind(userId, userId)
      .all<SpaceRow>(),
    db.prepare("SELECT * FROM saved_contacts WHERE owner_user_id=? ORDER BY display_name").bind(userId).all(),
  ]);
  const allowed = filterSpacesForPlanAccess(spaces.results ?? [], options?.features ?? []);
  const ids = allowed.map((space) => space.id);
  if (!ids.length) return { spaces: [], members: [], transactions: [], plans: [], circleTurns: [], tripExpenses: [], expenseSplits: [], settlements: [], installments: [], contacts: contacts.results ?? [], periods: [], personalAccounts: [], personalRules: [], personalOccurrences: [], payoutAccounts: [], familyEvents: [], spaceLinks: [], spaceBankLinks: [] };

  if (options?.refreshDerived !== false) {
    try {
      await reconcileMemberLedgers(db, ids);
    } catch { /* keep serving dashboard if ledger rebuild fails */ }
    try { await generatePersonalOccurrences(db, ids); } catch { /* keep serving dashboard */ }
  }
  const placeholders = ids.map(() => "?").join(",");
  let packed;
  try {
    packed = await Promise.all([
    db.prepare(`SELECT * FROM spaces WHERE id IN (${placeholders}) ORDER BY created_at ASC`).bind(...ids).all<SpaceRow>(),
    db.prepare(`SELECT * FROM members WHERE space_id IN (${placeholders}) ORDER BY joined_at ASC`).bind(...ids).all<MemberRow>(),
    db.prepare(`SELECT * FROM transactions WHERE space_id IN (${placeholders}) ORDER BY occurred_at DESC LIMIT 250`).bind(...ids).all<TransactionRow>(),
    db.prepare(`SELECT * FROM contribution_plans WHERE space_id IN (${placeholders})`).bind(...ids).all(),
    db.prepare(`SELECT ct.*,m.display_name FROM circle_turns ct JOIN members m ON m.id=ct.member_id
      WHERE ct.space_id IN (${placeholders}) ORDER BY ct.space_id,ct.turn_number`).bind(...ids).all(),
    db.prepare(`SELECT te.id, te.space_id, te.paid_by_member_id, te.amount_minor, te.description, te.occurred_at, te.transaction_id, te.status,
        CASE WHEN COALESCE(te.paid_from, CASE WHEN t.kind='expense' THEN 'common_fund' ELSE 'member' END)='common_fund'
          THEN 'صندوق الجمعية' ELSE m.display_name END AS paid_by_name,
        COALESCE(te.paid_from, CASE WHEN t.kind='expense' THEN 'common_fund' ELSE 'member' END) AS paid_from
      FROM trip_expenses te
      LEFT JOIN members m ON m.id=te.paid_by_member_id
      LEFT JOIN transactions t ON t.id=te.transaction_id
      WHERE te.space_id IN (${placeholders}) AND COALESCE(te.status,'posted')<>'voided' ORDER BY te.occurred_at DESC LIMIT 50`).bind(...ids).all(),
    db.prepare(`SELECT es.*,m.display_name FROM expense_splits es JOIN trip_expenses te ON te.id=es.expense_id
      JOIN members m ON m.id=es.member_id WHERE te.space_id IN (${placeholders}) AND COALESCE(te.status,'posted')<>'voided' ORDER BY es.expense_id,m.joined_at`).bind(...ids).all(),
    db.prepare(`SELECT s.*,
      tm.display_name AS to_member_name,
      fm.display_name AS from_member_name
    FROM settlements s
    LEFT JOIN members tm ON tm.id=s.to_member_id
    LEFT JOIN members fm ON fm.id=s.from_member_id
      WHERE s.space_id IN (${placeholders}) AND s.status='pending' ORDER BY s.created_at DESC LIMIT 50`).bind(...ids).all(),
    db.prepare(`SELECT * FROM member_installments WHERE space_id IN (${placeholders}) ORDER BY member_id, period_index`).bind(...ids).all(),
    db.prepare(`SELECT p.*, cu.display_name AS closed_by_name, ru.display_name AS reopened_by_name
      FROM accounting_periods p
      LEFT JOIN users cu ON cu.id = p.closed_by
      LEFT JOIN users ru ON ru.id = p.reopened_by
      WHERE p.space_id IN (${placeholders}) ORDER BY p.starts_at DESC`).bind(...ids).all(),
    db.prepare(`SELECT * FROM period_ledger_events WHERE space_id IN (${placeholders}) ORDER BY created_at DESC LIMIT 200`).bind(...ids).all(),
    db.prepare(`SELECT * FROM personal_accounts WHERE space_id IN (${placeholders}) ORDER BY created_at`).bind(...ids).all<{ id: string; space_id: string; name: string; kind: string; opening_minor: number; status: string; created_at: string }>(),
    db.prepare(`SELECT * FROM personal_rules WHERE space_id IN (${placeholders}) ORDER BY created_at`).bind(...ids).all(),
    db.prepare(`SELECT o.*, r.name AS rule_name, r.kind AS rule_kind, r.amount_mode, r.total_minor, r.paid_minor AS rule_paid_minor
      FROM personal_occurrences o JOIN personal_rules r ON r.id=o.rule_id
      WHERE o.space_id IN (${placeholders}) ORDER BY o.due_at DESC, o.created_at DESC`).bind(...ids).all<PersonalOccurrenceRow>(),
    db.prepare(`SELECT * FROM space_payout_accounts WHERE space_id IN (${placeholders})`).bind(...ids).all(),
    db.prepare(`SELECT * FROM family_events WHERE space_id IN (${placeholders}) ORDER BY target_at ASC`).bind(...ids).all<{
      id: string; space_id: string; title: string; kind: string; target_at: string; expected_minor: number; notes: string | null; status: string;
    }>(),
  ]);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      code: "DASHBOARD_ROWS_FAILED",
      message: error instanceof Error ? error.message : String(error),
      at: new Date().toISOString(),
    }));
    return redactDashboardForViewer(userId, {
      spaces: allowed,
      members: [],
      transactions: [],
      plans: [],
      circleTurns: [],
      tripExpenses: [],
      expenseSplits: [],
      settlements: [],
      installments: [],
      contacts: contacts.results ?? [],
      periods: [],
      periodEvents: [],
      personalAccounts: [],
      personalRules: [],
      personalOccurrences: [],
      payoutAccounts: [],
      familyEvents: [],
      spaceLinks: [],
      spaceBankLinks: [],
    });
  }
  const [
    refreshedSpaces,
    members,
    transactions,
    plans,
    circleTurns,
    tripExpenses,
    expenseSplits,
    settlements,
    installments,
    periods,
    periodEvents,
    personalAccountsRaw,
    personalRules,
    personalOccurrences,
    payoutAccounts,
    familyEventsRaw,
  ] = packed;
  let spaceLinks = { results: [] as Array<{ id: string; hub_space_id: string; linked_space_id: string; status: string; created_at: string }> };
  let spaceBankLinks = { results: [] as Array<{ id: string; hub_space_id: string; linked_space_id: string; account_id: string; created_at: string }> };
  try {
    [spaceLinks, spaceBankLinks] = await Promise.all([
      db.prepare(`SELECT * FROM space_links WHERE hub_space_id IN (${placeholders}) OR linked_space_id IN (${placeholders})`).bind(...ids, ...ids).all<{ id: string; hub_space_id: string; linked_space_id: string; status: string; created_at: string }>(),
      db.prepare(`SELECT * FROM space_bank_links WHERE hub_space_id IN (${placeholders}) OR linked_space_id IN (${placeholders})`).bind(...ids, ...ids).all<{ id: string; hub_space_id: string; linked_space_id: string; account_id: string; created_at: string }>(),
    ]);
  } catch {
    /* tables created on next ensureSchema pass */
  }
  const personalAccounts = personalAccountsRaw.results.map((account) => ({
    ...account,
    balance_minor: accountLiveBalance(Number(account.opening_minor), transactions.results, account.id),
  }));

  const memberDueBySpace = new Map<string, number>();
  for (const member of members.results) {
    if (member.status !== "active") continue;
    memberDueBySpace.set(member.space_id, (memberDueBySpace.get(member.space_id) ?? 0) + Number(member.due_minor ?? 0));
  }
  const planBySpace = new Map<string, { amount_minor: number; duration_months: number }>();
  for (const plan of plans.results as Array<{ space_id: string; amount_minor: number; duration_months: number }>) {
    planBySpace.set(String(plan.space_id), { amount_minor: Number(plan.amount_minor ?? 0), duration_months: Number(plan.duration_months ?? 0) });
  }
  const spacesWithGoals = refreshedSpaces.results.map((space) => {
    const membersDue = memberDueBySpace.get(space.id) ?? 0;
    const plan = planBySpace.get(space.id);
    const planGoal = plan && plan.amount_minor > 0 && plan.duration_months > 0
      ? Math.round(Number(plan.amount_minor)) * Math.max(1, Math.round(Number(plan.duration_months)))
      : 0;
    let balanceMinor = Number(space.balance_minor);
    if (space.type === "personal") {
      const spaceTxns = transactions.results.filter((row) => row.space_id === space.id);
      const activeAccounts = personalAccounts.filter((account) => account.space_id === space.id && account.status === "active");
      if (activeAccounts.length) {
        const unassigned = approvedCashMinor(spaceTxns.filter((row) => !row.account_id));
        balanceMinor = activeAccounts.reduce((sum, account) => sum + Number(account.balance_minor), 0) + unassigned;
      } else {
        balanceMinor = approvedCashMinor(spaceTxns);
      }
    }
    return { ...space, balance_minor: balanceMinor, goal_minor: membersDue > 0 ? membersDue : (planGoal || space.goal_minor) };
  });

  const unpaidBySpace = new Map<string, number>();
  const contributorCount = new Map<string, number>();
  for (const member of members.results) {
    if (member.status !== "active") continue;
    unpaidBySpace.set(member.space_id, (unpaidBySpace.get(member.space_id) ?? 0) + Math.max(0, Number(member.due_minor) - Number(member.paid_minor)));
    if (Number(member.due_minor) > 0) contributorCount.set(member.space_id, (contributorCount.get(member.space_id) ?? 0) + 1);
  }
  const familyEvents = familyEventsRaw.results.map((event) => {
    const space = refreshedSpaces.results.find((item) => item.id === event.space_id);
    const plan = planBySpace.get(event.space_id);
    const monthly = Number(plan?.amount_minor ?? 0) * (contributorCount.get(event.space_id) ?? 0);
    const forecast = forecastFamilyEvent({
      balanceMinor: Number(space?.balance_minor ?? 0),
      expectedCostMinor: Number(event.expected_minor),
      monthlyInflowMinor: monthly,
      monthsUntil: monthCountUntil(event.target_at),
      unpaidDuesMinor: unpaidBySpace.get(event.space_id) ?? 0,
    });
    return { ...event, ...forecast };
  });

  const occurrenceRows = personalOccurrences.results as PersonalOccurrenceRow[];
  const txnRows = transactions.results as TransactionRow[];
  const reopenIds = occurrenceRows
    .filter((row) => {
      if (row.status === "voided" || row.status === "superseded") return true;
      const linked = row.transaction_id ? txnRows.find((txn) => txn.id === row.transaction_id) : undefined;
      return Boolean(linked && (linked.status === "voided" || linked.status === "superseded"));
    })
    .map((row) => row.id);
  if (reopenIds.length) {
    try {
      await db.batch(reopenIds.map((id) => db.prepare("UPDATE personal_occurrences SET status='pending', actual_minor=NULL, transaction_id=NULL WHERE id=?").bind(id)));
    } catch { /* display still reopens the monthly item */ }
  }
  const syncedOccurrences = occurrenceRows.map((row) => ({
    ...row,
    ...(reopenIds.includes(row.id) ? { status: "pending", actual_minor: null, transaction_id: null } : {}),
    status: occurrenceLedgerStatus({
      status: reopenIds.includes(row.id) ? "pending" : String(row.status ?? "pending"),
      transaction_id: reopenIds.includes(row.id) ? null : row.transaction_id ?? null,
      rule_name: row.rule_name,
      space_id: String(row.space_id),
      period_key: String(row.period_key),
      expected_minor: Number(row.expected_minor ?? 0),
      actual_minor: reopenIds.includes(row.id) ? null : row.actual_minor == null ? null : Number(row.actual_minor),
      rule_kind: row.rule_kind,
    }, txnRows),
  }));

  return redactDashboardForViewer(userId, {
    spaces: spacesWithGoals,
    members: members.results,
    transactions: transactions.results,
    plans: plans.results,
    circleTurns: circleTurns.results,
    tripExpenses: tripExpenses.results,
    expenseSplits: expenseSplits.results,
    settlements: settlements.results,
    installments: installments.results,
    contacts: contacts.results,
    periods: periods.results,
    periodEvents: periodEvents.results,
    personalAccounts,
    personalRules: personalRules.results,
    personalOccurrences: syncedOccurrences,
    payoutAccounts: payoutAccounts.results,
    familyEvents,
    spaceLinks: spaceLinks.results,
    spaceBankLinks: spaceBankLinks.results,
  });
}

function maskAccountNumber(value: string | null | undefined) {
  const digits = String(value ?? "");
  if (digits.length <= 4) return "••••";
  return `••••${digits.slice(-4)}`;
}

function redactDashboardForViewer<T extends {
  spaces: Array<{ id: string; owner_user_id: string; type: string }>;
  members: Array<MemberRow>;
  personalAccounts: Array<{ space_id: string }>;
  personalRules: Array<{ space_id?: unknown }>;
  personalOccurrences: Array<{ space_id: string }>;
  payoutAccounts: Array<{ space_id?: unknown; account_number?: unknown }>;
}>(userId: string, data: T): T {
  const owned = new Set(data.spaces.filter((space) => space.owner_user_id === userId).map((space) => space.id));
  return {
    ...data,
    members: data.members.map((member) => {
      if (owned.has(member.space_id) || member.user_id === userId) return member;
      return { ...member, email: null, phone: null };
    }),
    personalAccounts: data.personalAccounts.filter((account) => owned.has(account.space_id)),
    personalRules: data.personalRules.filter((rule) => owned.has(String(rule.space_id ?? ""))),
    personalOccurrences: data.personalOccurrences.filter((row) => owned.has(row.space_id)),
    payoutAccounts: data.payoutAccounts.map((account) => (
      owned.has(String(account.space_id ?? "")) ? account : { ...account, account_number: maskAccountNumber(account.account_number == null ? "" : String(account.account_number)) }
    )),
  };
}

async function readDashboardRevision(db: D1Database, userId: string) {
  const owned = `s.owner_user_id=? OR EXISTS (SELECT 1 FROM members m WHERE m.space_id=s.id AND m.status='active' AND m.user_id=?)`;
  const row = await db.prepare(
    `SELECT
      (SELECT COALESCE(MAX(s.created_at),'') FROM spaces s WHERE ${owned}) AS space_at,
      (SELECT COALESCE(MAX(t.created_at),'') FROM transactions t JOIN spaces s ON s.id=t.space_id WHERE ${owned}) AS txn_at,
      (SELECT COALESCE(MAX(updated_at),'') FROM subscriptions WHERE user_id=?) AS sub_at,
      (SELECT COALESCE(plan_id,'') || ':' || COALESCE(status,'') || ':' || COALESCE(pending_plan_id,'') FROM subscriptions WHERE user_id=? ORDER BY created_at DESC LIMIT 1) AS plan_stamp`,
  ).bind(userId, userId, userId, userId, userId, userId, userId).first<{
    space_at: string; txn_at: string; sub_at: string; plan_stamp: string;
  }>();
  return [row?.space_at ?? "", row?.txn_at ?? "", row?.sub_at ?? "", row?.plan_stamp ?? ""].join("|");
}

function unauthenticatedResponse() {
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("Set-Cookie", clearSessionCookie());
  headers.append("Set-Cookie", clearCsrfCookie());
  return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401, headers });
}

export async function GET(request: Request) {
  try {
    const db = getRawDb();
    await ensureSchema(db);
    const user = await authenticateRequest(db, request);
    if (!user) return unauthenticatedResponse();
    assertApiScope(user, "wallets:read");
    const url = new URL(request.url);
    if (url.searchParams.get("view") === "revision") {
      const revision = await readDashboardRevision(db, user.id);
      return Response.json({ revision }, { headers: { "Cache-Control": "no-store" } });
    }
    await ensureUser(db, user);
    const { getActivePlanEntitlements } = await import("../../../services/admin/billing-service");
    const entitlements = await getActivePlanEntitlements(db, user.id);
    let dashboard: Awaited<ReturnType<typeof loadDashboard>>;
    try {
      dashboard = await loadDashboard(db, user.id, { refreshDerived: false, features: entitlements.features });
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        code: "DASHBOARD_LOAD_FAILED",
        message: error instanceof Error ? error.message : String(error),
        at: new Date().toISOString(),
      }));
      dashboard = {
        spaces: [], members: [], transactions: [], plans: [], circleTurns: [], tripExpenses: [], expenseSplits: [],
        settlements: [], installments: [], contacts: [], periods: [], periodEvents: [], personalAccounts: [], personalRules: [],
        personalOccurrences: [], payoutAccounts: [], familyEvents: [], spaceLinks: [], spaceBankLinks: [],
      };
    }
    const role = await platformRoleOf(db, user.id);
    let issued: { csrfToken: string; expiresAt: Date } | null = null;
    try {
      issued = user.authType === "session" ? await issueCsrfToken(db, request) : null;
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        code: "CSRF_ISSUE_FAILED",
        message: error instanceof Error ? error.message : String(error),
        at: new Date().toISOString(),
      }));
    }
    const headers = new Headers({ "Cache-Control": "no-store" }); if (issued) headers.append("Set-Cookie", csrfCookie(issued.csrfToken, issued.expiresAt));
    let revision = "";
    try {
      revision = await readDashboardRevision(db, user.id);
    } catch {
      revision = "";
    }
    return Response.json({ user: { ...user, role }, entitlements, revision, ...dashboard }, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  let claimed: { db: D1Database; userId: string; key: string } | null = null;
  let notification: { emailQueued: boolean; whatsappUrl: string | null; transactionId: string } | undefined;
  try {
    enforceWriteRequest(request);
    const db = getRawDb();
    await ensureSchema(db);
    await rateLimit(db, request, "dashboard-write", 120, 60);
    const user = await authenticateRequest(db, request);
    if (!user) return unauthenticatedResponse();
    if (user.authType === "session") await enforceCsrf(db, request);
    await ensureUser(db, user);
    const payload = (await request.json()) as Record<string, unknown>;
    const action = String(payload.action ?? "");
    const idempotencyKey = String(payload.idempotencyKey ?? request.headers.get("idempotency-key") ?? "");
    const replay = await claimIdempotency(db, user.id, action, idempotencyKey);
    if (replay) {
      const { getActivePlanEntitlements } = await import("../../../services/admin/billing-service");
      const entitlements = await getActivePlanEntitlements(db, user.id);
      const dashboard = await loadDashboard(db, user.id, { refreshDerived: false, features: entitlements.features });
      const body = replay && typeof replay === "object" ? replay : { ok: true };
      return Response.json({ ...body, user, entitlements, ...dashboard }, { headers: { "Cache-Control": "no-store" } });
    }
    claimed = { db, userId: user.id, key: idempotencyKey };

    if (action === "linkWallet") {
      const parsed = z.object({ hubSpaceId: z.string().min(1).max(120), linkedSpaceId: z.string().min(1).max(120) }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_LINK");
      if (parsed.data.hubSpaceId === parsed.data.linkedSpaceId) throw new ApiError(400, "CANNOT_LINK_SELF");
      const hub = await authorizeSpace(db, user, parsed.data.hubSpaceId, "members:write", ["personal"]);
      const linked = await authorizeSpace(db, user, parsed.data.linkedSpaceId, "read");
      if (hub.owner_user_id !== user.id || linked.owner_user_id !== user.id) throw new ApiError(403, "FORBIDDEN");
      const existing = await db.prepare("SELECT id FROM space_links WHERE hub_space_id=? AND linked_space_id=?").bind(hub.id, linked.id).first();
      if (existing) throw new ApiError(409, "WALLET_ALREADY_LINKED");
      const createdAt = now();
      await db.batch([
        db.prepare("INSERT INTO space_links (id,hub_space_id,linked_space_id,status,created_at) VALUES (?,?,?,'active',?)")
          .bind(crypto.randomUUID(), hub.id, linked.id, createdAt),
        prepareAudit(db, { userId: user.id, action: "wallet.linked", entityType: "space", entityId: hub.id, metadata: { linkedSpaceId: linked.id }, createdAt }),
      ]);
    } else if (action === "unlinkWallet") {
      const parsed = z.object({ hubSpaceId: z.string().min(1).max(120), linkedSpaceId: z.string().min(1).max(120) }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_LINK");
      await authorizeSpace(db, user, parsed.data.hubSpaceId, "members:write", ["personal"]);
      await authorizeSpace(db, user, parsed.data.linkedSpaceId, "read");
      const createdAt = now();
      await db.batch([
        db.prepare("DELETE FROM space_bank_links WHERE hub_space_id=? AND linked_space_id=?").bind(parsed.data.hubSpaceId, parsed.data.linkedSpaceId),
        db.prepare("DELETE FROM space_links WHERE hub_space_id=? AND linked_space_id=?").bind(parsed.data.hubSpaceId, parsed.data.linkedSpaceId),
        prepareAudit(db, { userId: user.id, action: "wallet.unlinked", entityType: "space", entityId: parsed.data.hubSpaceId, metadata: { linkedSpaceId: parsed.data.linkedSpaceId }, createdAt }),
      ]);
    } else if (action === "setWalletBankLink") {
      const parsed = z.object({
        hubSpaceId: z.string().min(1).max(120),
        linkedSpaceId: z.string().min(1).max(120),
        accountId: z.string().max(120).nullable(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_BANK_LINK");
      await authorizeSpace(db, user, parsed.data.hubSpaceId, "members:write", ["personal"]);
      await authorizeSpace(db, user, parsed.data.linkedSpaceId, "read");
      const link = await db.prepare("SELECT id FROM space_links WHERE hub_space_id=? AND linked_space_id=? AND status='active'")
        .bind(parsed.data.hubSpaceId, parsed.data.linkedSpaceId).first();
      if (!link) throw new ApiError(409, "WALLET_NOT_LINKED");
      const createdAt = now();
      if (!parsed.data.accountId) {
        await db.batch([
          db.prepare("DELETE FROM space_bank_links WHERE hub_space_id=? AND linked_space_id=?").bind(parsed.data.hubSpaceId, parsed.data.linkedSpaceId),
          prepareAudit(db, { userId: user.id, action: "wallet.bank_unlinked", entityType: "space", entityId: parsed.data.hubSpaceId, metadata: { linkedSpaceId: parsed.data.linkedSpaceId }, createdAt }),
        ]);
      } else {
        const account = await db.prepare("SELECT id FROM personal_accounts WHERE id=? AND space_id=? AND status='active'")
          .bind(parsed.data.accountId, parsed.data.hubSpaceId).first();
        if (!account) throw new ApiError(400, "INVALID_ACCOUNT");
        await db.batch([
          db.prepare("DELETE FROM space_bank_links WHERE hub_space_id=? AND linked_space_id=?").bind(parsed.data.hubSpaceId, parsed.data.linkedSpaceId),
          db.prepare("INSERT INTO space_bank_links (id,hub_space_id,linked_space_id,account_id,created_at) VALUES (?,?,?,?,?)")
            .bind(crypto.randomUUID(), parsed.data.hubSpaceId, parsed.data.linkedSpaceId, parsed.data.accountId, createdAt),
          prepareAudit(db, { userId: user.id, action: "wallet.bank_linked", entityType: "space", entityId: parsed.data.hubSpaceId, metadata: { linkedSpaceId: parsed.data.linkedSpaceId, accountId: parsed.data.accountId }, createdAt }),
        ]);
      }
    } else if (action === "transferLinkedFunds") {
      const parsed = z.object({
        hubSpaceId: z.string().min(1).max(120),
        linkedSpaceId: z.string().min(1).max(120),
        accountId: z.string().min(1).max(120),
        direction: z.enum(["to_linked", "to_hub"]),
        amount: z.union([z.string(), z.number()]),
        note: z.string().trim().max(200).optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_TRANSFER");
      const hub = await authorizeSpace(db, user, parsed.data.hubSpaceId, "transact", ["personal"]);
      const linked = await authorizeSpace(db, user, parsed.data.linkedSpaceId, "transact");
      const pair = await db.prepare("SELECT id FROM space_links WHERE hub_space_id=? AND linked_space_id=? AND status='active'")
        .bind(hub.id, linked.id).first();
      if (!pair) throw new ApiError(409, "WALLET_NOT_LINKED");
      await guardOwnerTransactionQuota(db, hub.owner_user_id, 2);
      const account = await db.prepare("SELECT id,opening_minor FROM personal_accounts WHERE id=? AND space_id=? AND status='active'")
        .bind(parsed.data.accountId, hub.id).first<{ id: string; opening_minor: number }>();
      if (!account) throw new ApiError(400, "INVALID_ACCOUNT");
      let amountMinor: number;
      try { amountMinor = parseMoneyToMinor(parsed.data.amount, hub.currency); } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
      if (amountMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT");
      const hubTxns = (await db.prepare("SELECT account_id,kind,amount_minor,status FROM transactions WHERE space_id=? AND status='approved'").bind(hub.id).all<{ account_id?: string | null; kind: string; amount_minor: number; status: string }>()).results;
      const ownMinor = accountLiveBalance(Number(account.opening_minor), hubTxns, account.id);
      const linkedBalance = Number(linked.balance_minor ?? 0);
      if (parsed.data.direction === "to_linked" && ownMinor < amountMinor) throw new ApiError(409, "INSUFFICIENT_FUNDS");
      if (parsed.data.direction === "to_hub" && linkedBalance < amountMinor) throw new ApiError(409, "INSUFFICIENT_FUNDS");
      const createdAt = now();
      const outId = crypto.randomUUID();
      const inId = crypto.randomUUID();
      const note = parsed.data.note?.trim() || "";
      const toLinked = parsed.data.direction === "to_linked";
      const outSpace = toLinked ? hub.id : linked.id;
      const inSpace = toLinked ? linked.id : hub.id;
      const outAr = toLinked ? `تحويل إلى محفظة مرتبطة${note ? ` · ${note}` : ""}` : `تحويل إلى الحساب الشخصي${note ? ` · ${note}` : ""}`;
      const outEn = toLinked ? `Transfer to linked wallet${note ? ` · ${note}` : ""}` : `Transfer to personal account${note ? ` · ${note}` : ""}`;
      const inAr = toLinked ? `تحويل من المحفظة الشخصية${note ? ` · ${note}` : ""}` : `تحويل من محفظة مرتبطة${note ? ` · ${note}` : ""}`;
      const inEn = toLinked ? `Transfer from personal wallet${note ? ` · ${note}` : ""}` : `Transfer from linked wallet${note ? ` · ${note}` : ""}`;
      await db.batch([
        db.prepare("INSERT INTO transactions VALUES (?, ?, ?, NULL, ?, 'general', ?, ?, ?, 'approved', ?, ?)")
          .bind(outId, outSpace, user.id, "expense", amountMinor, outAr, outEn, createdAt, createdAt),
        db.prepare("INSERT INTO transactions VALUES (?, ?, ?, NULL, ?, 'general', ?, ?, ?, 'approved', ?, ?)")
          .bind(inId, inSpace, user.id, "income", amountMinor, inAr, inEn, createdAt, createdAt),
        db.prepare("UPDATE transactions SET account_id=? WHERE id=?").bind(account.id, toLinked ? outId : inId),
        prepareAudit(db, { userId: user.id, action: "wallet.transfer", entityType: "transaction", entityId: outId, metadata: { hubSpaceId: hub.id, linkedSpaceId: linked.id, amountMinor, direction: parsed.data.direction }, createdAt }),
      ]);
      const bank = await db.prepare("SELECT id FROM space_bank_links WHERE hub_space_id=? AND linked_space_id=?").bind(hub.id, linked.id).first();
      if (!bank) {
        await db.prepare("INSERT INTO space_bank_links (id,hub_space_id,linked_space_id,account_id,created_at) VALUES (?,?,?,?,?)")
          .bind(crypto.randomUUID(), hub.id, linked.id, account.id, createdAt).run();
      }
      await rebuildSpaceBalance(db, [hub.id, linked.id]);
    } else if (action === "addWallet") {
      assertApiScope(user, "wallets:write");
      const parsed = z.object({
        name: z.string().trim().min(2).max(80),
        type: z.enum(["personal", "household", "trip", "society", "group"]),
        goal: z.union([z.string(), z.number()]).default("0"),
        monthlyContribution: z.union([z.string(), z.number()]).optional(),
        durationMonths: z.coerce.number().int().min(1).max(120).optional(),
        dueDay: z.coerce.number().int().min(1).max(28).optional(),
        startsAt: z.string().min(8).max(40).optional(),
        cloneFromSpaceId: z.string().min(1).max(120).optional(),
        cloneMemberIds: z.array(z.string().min(1).max(120)).max(200).optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_WALLET");
      const { name, type } = parsed.data;
      const { getActivePlanEntitlements, planAllowsSpaceType } = await import("../../../services/admin/billing-service");
      const entitlements = await getActivePlanEntitlements(db, user.id);
      if (!planAllowsSpaceType(entitlements.features, type)) throw new ApiError(403, "PLAN_FEATURE_REQUIRED");
      const owned = await db.prepare("SELECT type FROM spaces WHERE owner_user_id=? AND COALESCE(status,'active') <> 'archived'").bind(user.id).all<{ type: string }>();
      const count = filterSpacesByPlan(owned.results ?? [], entitlements.features).length;
      if (count >= entitlements.walletLimit) throw new ApiError(403, "PLAN_WALLET_LIMIT");
      const id = `${cleanId(user.id)}-${crypto.randomUUID()}`; const createdAt = now();
      const startsAt = parseStartDate(parsed.data.startsAt);
      const profile = await db.prepare("SELECT currency FROM users WHERE id=?").bind(user.id).first<{ currency: string }>(); const currency = profile?.currency ?? "OMR";
      let goalMinor: number; try { goalMinor = parseNonNegativeMoneyToMinor(parsed.data.goal, currency); } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
      const isGroup = ["household", "trip", "society", "group"].includes(type);
      let contributionMinor = 0;
      const durationMonths = parsed.data.durationMonths ?? 12;
      if (isGroup && parsed.data.monthlyContribution !== undefined && parsed.data.monthlyContribution !== "") {
        try { contributionMinor = parseMoneyToMinor(parsed.data.monthlyContribution, currency); } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
        goalMinor = multiplyMinor(contributionMinor, durationMonths);
      }
      const tenantId = await ensureDefaultTenant(db, user);
      const statements: D1PreparedStatement[] = [
        db.prepare("INSERT INTO spaces (id,owner_user_id,name_ar,name_en,type,currency,balance_minor,goal_minor,accent,created_at,starts_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'emerald', ?, ?)").bind(id, user.id, name, name, type, currency, goalMinor, createdAt, startsAt),
        db.prepare("INSERT INTO tenant_resources (tenant_id,resource_type,resource_id,created_at) VALUES (?,'space',?,?)").bind(tenantId, id, createdAt),
        db.prepare("INSERT INTO accounting_periods (id,space_id,label,starts_at,status,created_at) VALUES (?,?,?,?,'open',?)").bind(crypto.randomUUID(), id, name, startsAt, createdAt),
        prepareAudit(db, { userId: user.id, action: "wallet.created", entityType: "space", entityId: id, metadata: { type, currency, startsAt }, createdAt }),
      ];
      if (isGroup && contributionMinor > 0) {
        const dueDay = parsed.data.dueDay ?? 1;
        statements.push(
          db.prepare(`INSERT INTO contribution_plans (id,space_id,amount_minor,interval,due_day,extra_policy,duration_months,starts_at)
            VALUES (?, ?, ?, 'monthly', ?, 'personal_reserve', ?, ?)`)
            .bind(`${id}-plan`, id, contributionMinor, dueDay, durationMonths, startsAt),
        );
      }
      if (parsed.data.cloneFromSpaceId && parsed.data.cloneMemberIds?.length) {
        await authorizeSpace(db, user, parsed.data.cloneFromSpaceId, "transact", ["household", "trip", "society", "group"]);
        const sourceMembers = await db.prepare("SELECT * FROM members WHERE space_id=? AND status='active'").bind(parsed.data.cloneFromSpaceId).all<MemberRow>();
        const selected = new Set(parsed.data.cloneMemberIds);
        for (const source of sourceMembers.results.filter((member) => selected.has(member.id))) {
          const memberId = crypto.randomUUID();
          const dueMinor = contributionMinor > 0 ? multiplyMinor(contributionMinor, durationMonths) : Number(source.due_minor ?? 0);
          statements.push(
            db.prepare("INSERT INTO members (id,space_id,user_id,display_name,email,phone,role,status,due_minor,paid_minor,extra_minor,avatar,joined_at,addon_minor) VALUES (?,?,?,?,?,?,?,'active',?,0,0,?, ?,0)")
              .bind(memberId, id, source.user_id, source.display_name, source.email, source.phone ?? null, source.role, dueMinor, source.avatar, startsAt),
          );
        }
      }
      await db.batch(statements);
    } else if (action === "updateWallet") {
      const parsed = z.object({
        spaceId: z.string().min(1).max(120),
        name: z.string().trim().min(2).max(80),
        goal: z.union([z.string(), z.number()]).optional(),
        monthlyContribution: z.union([z.string(), z.number()]).optional(),
        durationMonths: z.coerce.number().int().min(1).max(120).optional(),
        startsAt: z.string().min(8).max(40).optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_WALLET");
      const space = await authorizeSpace(db, user, parsed.data.spaceId, "members:write");
      if (space.owner_user_id !== user.id && space.type === "personal") throw new ApiError(403, "FORBIDDEN");
      const startsAt = parsed.data.startsAt ? parseStartDate(parsed.data.startsAt) : undefined;
      let goalMinor: number | undefined;
      if (parsed.data.goal !== undefined) {
        try { goalMinor = parseNonNegativeMoneyToMinor(parsed.data.goal, space.currency); } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
      }
      let contributionMinor: number | undefined;
      if (parsed.data.monthlyContribution !== undefined && parsed.data.monthlyContribution !== "") {
        try { contributionMinor = parseMoneyToMinor(parsed.data.monthlyContribution, space.currency); } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
      }
      const durationMonths = parsed.data.durationMonths;
      if (contributionMinor !== undefined && durationMonths) goalMinor = multiplyMinor(contributionMinor, durationMonths);
      const createdAt = now();
      const statements: D1PreparedStatement[] = [
        db.prepare("UPDATE spaces SET name_ar=?, name_en=? WHERE id=?").bind(parsed.data.name, parsed.data.name, parsed.data.spaceId),
      ];
      if (startsAt) statements.push(db.prepare("UPDATE spaces SET starts_at=? WHERE id=?").bind(startsAt, parsed.data.spaceId));
      if (goalMinor !== undefined) statements.push(db.prepare("UPDATE spaces SET goal_minor=? WHERE id=?").bind(goalMinor, parsed.data.spaceId));
      const plan = await db.prepare("SELECT id FROM contribution_plans WHERE space_id=?").bind(parsed.data.spaceId).first<{ id: string }>();
      if (plan && (contributionMinor !== undefined || durationMonths || startsAt)) {
        if (contributionMinor !== undefined) statements.push(db.prepare("UPDATE contribution_plans SET amount_minor=? WHERE id=?").bind(contributionMinor, plan.id));
        if (durationMonths) statements.push(db.prepare("UPDATE contribution_plans SET duration_months=? WHERE id=?").bind(durationMonths, plan.id));
        if (startsAt) statements.push(db.prepare("UPDATE contribution_plans SET starts_at=? WHERE id=?").bind(startsAt, plan.id));
      }
      statements.push(prepareAudit(db, { userId: user.id, action: "wallet.updated", entityType: "space", entityId: parsed.data.spaceId, metadata: { name: parsed.data.name }, createdAt }));
      await db.batch(statements);
      if (startsAt || contributionMinor !== undefined || durationMonths) {
        const nextPlan = await db.prepare("SELECT amount_minor,duration_months,starts_at FROM contribution_plans WHERE space_id=? LIMIT 1")
          .bind(parsed.data.spaceId)
          .first<{ amount_minor: number; duration_months: number; starts_at: string }>();
        await rebuildSpaceInstallments(db, parsed.data.spaceId, nextPlan, createdAt);
      }
    } else if (action === "archiveWallet") {
      const parsed = z.object({ spaceId: z.string().min(1).max(120), archived: z.boolean().default(true) }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_WALLET");
      const space = await authorizeSpace(db, user, parsed.data.spaceId, "members:write");
      if (space.owner_user_id !== user.id) throw new ApiError(403, "FORBIDDEN");
      const status = parsed.data.archived ? "archived" : "active";
      const createdAt = now();
      await db.batch([
        db.prepare("UPDATE spaces SET status=? WHERE id=?").bind(status, parsed.data.spaceId),
        prepareAudit(db, { userId: user.id, action: parsed.data.archived ? "wallet.archived" : "wallet.unarchived", entityType: "space", entityId: parsed.data.spaceId, metadata: { status }, createdAt }),
      ]);
    } else if (action === "deleteWallet") {
      const parsed = z.object({ spaceId: z.string().min(1).max(120) }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_WALLET");
      const space = await authorizeSpace(db, user, parsed.data.spaceId, "members:write");
      if (space.owner_user_id !== user.id) throw new ApiError(403, "FORBIDDEN");
      await deleteSpaceCascade(db, parsed.data.spaceId, user.id);
    } else if (action === "resetWalletData") {
      const parsed = z.object({
        spaceId: z.string().min(1).max(120),
        confirm: z.literal("RESET"),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_WALLET");
      const space = await authorizeSpace(db, user, parsed.data.spaceId, "members:write");
      if (space.owner_user_id !== user.id) throw new ApiError(403, "FORBIDDEN");
      const createdAt = now();
      await db.batch([
        db.prepare("DELETE FROM journal_lines WHERE entry_id IN (SELECT id FROM journal_entries WHERE space_id=?)").bind(parsed.data.spaceId),
        db.prepare("DELETE FROM journal_entries WHERE space_id=?").bind(parsed.data.spaceId),
        db.prepare("DELETE FROM expense_splits WHERE expense_id IN (SELECT id FROM trip_expenses WHERE space_id=?)").bind(parsed.data.spaceId),
        db.prepare("DELETE FROM settlements WHERE space_id=?").bind(parsed.data.spaceId),
        db.prepare("DELETE FROM trip_expenses WHERE space_id=?").bind(parsed.data.spaceId),
        db.prepare("DELETE FROM family_events WHERE space_id=?").bind(parsed.data.spaceId),
        db.prepare("DELETE FROM personal_occurrences WHERE space_id=?").bind(parsed.data.spaceId),
        db.prepare("DELETE FROM personal_rules WHERE space_id=?").bind(parsed.data.spaceId),
        db.prepare("DELETE FROM personal_accounts WHERE space_id=?").bind(parsed.data.spaceId),
        db.prepare("DELETE FROM transactions WHERE space_id=?").bind(parsed.data.spaceId),
        db.prepare("DELETE FROM period_ledger_events WHERE space_id=?").bind(parsed.data.spaceId),
        db.prepare("UPDATE members SET paid_minor=0, extra_minor=0, addon_minor=0 WHERE space_id=?").bind(parsed.data.spaceId),
        db.prepare("UPDATE spaces SET balance_minor=0 WHERE id=?").bind(parsed.data.spaceId),
        prepareAudit(db, { userId: user.id, action: "wallet.reset", entityType: "space", entityId: parsed.data.spaceId, metadata: {}, createdAt }),
      ]);
    } else if (action === "addPersonalAccount") {
      const parsed = z.object({
        spaceId: z.string().min(1).max(120),
        name: z.string().trim().min(2).max(80),
        kind: z.enum(["bank", "cash", "wallet"]).default("bank"),
        opening: z.union([z.string(), z.number()]).optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_ACCOUNT");
      const space = await authorizeSpace(db, user, parsed.data.spaceId, "transact", ["personal"]);
      let openingMinor = 0;
      try { if (parsed.data.opening !== undefined && parsed.data.opening !== "") openingMinor = parseNonNegativeMoneyToMinor(parsed.data.opening, space.currency); } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
      const createdAt = now();
      await db.batch([
        db.prepare("INSERT INTO personal_accounts (id,space_id,name,kind,opening_minor,status,created_at) VALUES (?,?,?,?,?,'active',?)")
          .bind(crypto.randomUUID(), parsed.data.spaceId, parsed.data.name, parsed.data.kind, openingMinor, createdAt),
        prepareAudit(db, { userId: user.id, action: "personal.account_added", entityType: "space", entityId: parsed.data.spaceId, metadata: { name: parsed.data.name }, createdAt }),
      ]);
      await rebuildSpaceBalance(db, [parsed.data.spaceId]);
    } else if (action === "updatePersonalAccount") {
      const parsed = z.object({
        accountId: z.string().min(1).max(120),
        name: z.string().trim().min(2).max(80),
        kind: z.enum(["bank", "cash", "wallet"]).default("bank"),
        opening: z.union([z.string(), z.number()]).optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_ACCOUNT");
      const account = await db.prepare("SELECT id,space_id FROM personal_accounts WHERE id=?").bind(parsed.data.accountId).first<{ id: string; space_id: string }>();
      if (!account) throw new ApiError(404, "ACCOUNT_NOT_FOUND");
      const space = await authorizeSpace(db, user, account.space_id, "transact", ["personal"]);
      let openingMinor = 0;
      try { if (parsed.data.opening !== undefined && parsed.data.opening !== "") openingMinor = parseNonNegativeMoneyToMinor(parsed.data.opening, space.currency); } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
      const createdAt = now();
      await db.batch([
        db.prepare("UPDATE personal_accounts SET name=?, kind=?, opening_minor=? WHERE id=?").bind(parsed.data.name, parsed.data.kind, openingMinor, account.id),
        prepareAudit(db, { userId: user.id, action: "personal.account_updated", entityType: "personal_account", entityId: account.id, metadata: { name: parsed.data.name }, createdAt }),
      ]);
      await rebuildSpaceBalance(db, [account.space_id]);
    } else if (action === "setPersonalAccountStatus") {
      const parsed = z.object({ accountId: z.string().min(1).max(120), status: z.enum(["active", "paused", "archived"]) }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_ACCOUNT");
      const account = await db.prepare("SELECT id,space_id FROM personal_accounts WHERE id=?").bind(parsed.data.accountId).first<{ id: string; space_id: string }>();
      if (!account) throw new ApiError(404, "ACCOUNT_NOT_FOUND");
      await authorizeSpace(db, user, account.space_id, "transact", ["personal"]);
      const createdAt = now();
      await db.batch([
        db.prepare("UPDATE personal_accounts SET status=? WHERE id=?").bind(parsed.data.status, account.id),
        prepareAudit(db, { userId: user.id, action: "personal.account_status", entityType: "personal_account", entityId: account.id, metadata: { status: parsed.data.status }, createdAt }),
      ]);
      await rebuildSpaceBalance(db, [account.space_id]);
    } else if (action === "deletePersonalAccount") {
      const parsed = z.object({ accountId: z.string().min(1).max(120) }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_ACCOUNT");
      const account = await db.prepare("SELECT id,space_id FROM personal_accounts WHERE id=?").bind(parsed.data.accountId).first<{ id: string; space_id: string }>();
      if (!account) throw new ApiError(404, "ACCOUNT_NOT_FOUND");
      await authorizeSpace(db, user, account.space_id, "transact", ["personal"]);
      const used = await db.prepare("SELECT id FROM transactions WHERE account_id=? AND status='approved' LIMIT 1").bind(account.id).first();
      if (used) throw new ApiError(409, "ACCOUNT_HAS_ACTIVITY");
      const createdAt = now();
      await db.batch([
        db.prepare("UPDATE personal_rules SET account_id=NULL WHERE account_id=?").bind(account.id),
        db.prepare("UPDATE personal_occurrences SET account_id=NULL WHERE account_id=? AND status='pending'").bind(account.id),
        db.prepare("DELETE FROM personal_accounts WHERE id=?").bind(account.id),
        prepareAudit(db, { userId: user.id, action: "personal.account_deleted", entityType: "personal_account", entityId: account.id, metadata: {}, createdAt }),
      ]);
      await rebuildSpaceBalance(db, [account.space_id]);
    } else if (action === "addPersonalRule") {
      const parsed = z.object({
        spaceId: z.string().min(1).max(120),
        accountId: optionalId,
        kind: z.enum(["income", "expense"]),
        name: z.string().trim().min(2).max(80),
        amountMode: z.enum(["fixed", "variable"]).default("fixed"),
        schedule: z.enum(["monthly", "once", "unscheduled"]).default("monthly"),
        amount: z.union([z.string(), z.number()]).optional(),
        dueDay: z.coerce.number().int().min(1).max(28).default(1),
        startsAt: z.string().min(8).max(40),
        endsAt: z.string().min(8).max(40).optional(),
        total: z.union([z.string(), z.number()]).optional(),
        durationMonths: z.coerce.number().int().min(0).max(360).optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_RULE");
      const space = await authorizeSpace(db, user, parsed.data.spaceId, "transact", ["personal"]);
      let amountMinor = 0;
      let totalMinor = 0;
      try {
        if (parsed.data.amount !== undefined && parsed.data.amount !== "") amountMinor = parseMoneyToMinor(parsed.data.amount, space.currency);
        if (parsed.data.total !== undefined && parsed.data.total !== "") totalMinor = parseNonNegativeMoneyToMinor(parsed.data.total, space.currency);
      } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
      const duration = parsed.data.durationMonths ?? 0;
      if (totalMinor > 0 && duration > 0 && amountMinor <= 0) amountMinor = Math.round(totalMinor / duration);
      if (parsed.data.schedule !== "unscheduled" && parsed.data.amountMode === "fixed" && amountMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT");
      if (parsed.data.schedule === "unscheduled" && amountMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT");
      const startsAt = parseStartDate(parsed.data.startsAt);
      const endsAt = parsed.data.schedule === "once" ? startsAt : (parsed.data.endsAt ? parseStartDate(parsed.data.endsAt) : null);
      const createdAt = now();
      const ruleId = crypto.randomUUID();
      await db.batch([
        db.prepare("INSERT INTO personal_rules (id,space_id,account_id,kind,name,amount_mode,schedule,amount_minor,due_day,starts_at,ends_at,total_minor,duration_months,paid_minor,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,'active',?)")
          .bind(ruleId, parsed.data.spaceId, parsed.data.accountId ?? null, parsed.data.kind, parsed.data.name, parsed.data.amountMode, parsed.data.schedule, amountMinor, parsed.data.dueDay, startsAt, endsAt, totalMinor, duration, createdAt),
        prepareAudit(db, { userId: user.id, action: "personal.rule_added", entityType: "personal_rule", entityId: ruleId, metadata: { name: parsed.data.name, kind: parsed.data.kind }, createdAt }),
      ]);
      await generatePersonalOccurrences(db, [parsed.data.spaceId]);
    } else if (action === "updatePersonalRule") {
      const parsed = z.object({
        ruleId: z.string().min(1).max(120),
        accountId: optionalId,
        name: z.string().trim().min(2).max(80),
        amountMode: z.enum(["fixed", "variable"]).default("fixed"),
        schedule: z.enum(["monthly", "once", "unscheduled"]).default("monthly"),
        amount: z.union([z.string(), z.number()]).optional(),
        dueDay: z.coerce.number().int().min(1).max(28).default(1),
        startsAt: z.string().min(8).max(40),
        endsAt: z.string().min(8).max(40).optional(),
        total: z.union([z.string(), z.number()]).optional(),
        durationMonths: z.coerce.number().int().min(0).max(360).optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_RULE");
      const rule = await db.prepare("SELECT * FROM personal_rules WHERE id=?").bind(parsed.data.ruleId).first<PersonalRuleRow>();
      if (!rule) throw new ApiError(404, "RULE_NOT_FOUND");
      const space = await authorizeSpace(db, user, rule.space_id, "transact", ["personal"]);
      let amountMinor = 0;
      let totalMinor = 0;
      try {
        if (parsed.data.amount !== undefined && parsed.data.amount !== "") amountMinor = parseMoneyToMinor(parsed.data.amount, space.currency);
        if (parsed.data.total !== undefined && parsed.data.total !== "") totalMinor = parseNonNegativeMoneyToMinor(parsed.data.total, space.currency);
      } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
      const duration = parsed.data.durationMonths ?? 0;
      if (totalMinor > 0 && duration > 0 && amountMinor <= 0) amountMinor = Math.round(totalMinor / duration);
      if (parsed.data.schedule !== "unscheduled" && parsed.data.amountMode === "fixed" && amountMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT");
      if (parsed.data.schedule === "unscheduled" && amountMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT");
      const startsAt = parseStartDate(parsed.data.startsAt);
      const endsAt = parsed.data.schedule === "once" ? startsAt : (parsed.data.endsAt ? parseStartDate(parsed.data.endsAt) : null);
      const createdAt = now();
      await db.batch([
        db.prepare("UPDATE personal_rules SET account_id=?, name=?, amount_mode=?, schedule=?, amount_minor=?, due_day=?, starts_at=?, ends_at=?, total_minor=?, duration_months=? WHERE id=?")
          .bind(parsed.data.accountId ?? null, parsed.data.name, parsed.data.amountMode, parsed.data.schedule, amountMinor, parsed.data.dueDay, startsAt, endsAt, totalMinor, duration, rule.id),
        db.prepare("DELETE FROM personal_occurrences WHERE rule_id=? AND status='pending'").bind(rule.id),
        prepareAudit(db, { userId: user.id, action: "personal.rule_updated", entityType: "personal_rule", entityId: rule.id, metadata: { name: parsed.data.name }, createdAt }),
      ]);
      await generatePersonalOccurrences(db, [rule.space_id]);
    } else if (action === "setPersonalRuleStatus") {
      const parsed = z.object({ ruleId: z.string().min(1).max(120), status: z.enum(["active", "paused", "archived"]) }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_RULE");
      const rule = await db.prepare("SELECT id,space_id FROM personal_rules WHERE id=?").bind(parsed.data.ruleId).first<{ id: string; space_id: string }>();
      if (!rule) throw new ApiError(404, "RULE_NOT_FOUND");
      await authorizeSpace(db, user, rule.space_id, "transact", ["personal"]);
      const createdAt = now();
      await db.batch([
        db.prepare("UPDATE personal_rules SET status=? WHERE id=?").bind(parsed.data.status, rule.id),
        db.prepare("DELETE FROM personal_occurrences WHERE rule_id=? AND status='pending'").bind(rule.id),
        prepareAudit(db, { userId: user.id, action: "personal.rule_status", entityType: "personal_rule", entityId: rule.id, metadata: { status: parsed.data.status }, createdAt }),
      ]);
      if (parsed.data.status === "active") await generatePersonalOccurrences(db, [rule.space_id]);
    } else if (action === "deletePersonalRule") {
      const parsed = z.object({ ruleId: z.string().min(1).max(120) }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_RULE");
      const rule = await db.prepare("SELECT id,space_id FROM personal_rules WHERE id=?").bind(parsed.data.ruleId).first<{ id: string; space_id: string }>();
      if (!rule) throw new ApiError(404, "RULE_NOT_FOUND");
      await authorizeSpace(db, user, rule.space_id, "transact", ["personal"]);
      const createdAt = now();
      await db.batch([
        db.prepare("DELETE FROM personal_occurrences WHERE rule_id=? AND status='pending'").bind(rule.id),
        db.prepare("DELETE FROM personal_rules WHERE id=?").bind(rule.id),
        prepareAudit(db, { userId: user.id, action: "personal.rule_deleted", entityType: "personal_rule", entityId: rule.id, metadata: {}, createdAt }),
      ]);
    } else if (action === "confirmPersonalOccurrence") {
      const parsed = z.object({
        occurrenceId: z.string().min(1).max(120),
        amount: optionalAmount,
        accountId: optionalId,
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_OCCURRENCE");
      const occurrence = await db.prepare(`SELECT o.*, r.name AS rule_name, r.kind AS rule_kind, r.amount_mode, r.total_minor
        FROM personal_occurrences o JOIN personal_rules r ON r.id=o.rule_id WHERE o.id=?`)
        .bind(parsed.data.occurrenceId)
        .first<{ id: string; rule_id: string; space_id: string; account_id: string | null; period_key: string; expected_minor: number; status: string; rule_name: string; rule_kind: string; amount_mode: string; total_minor: number }>();
      if (!occurrence) throw new ApiError(404, "OCCURRENCE_NOT_FOUND");
      if (occurrence.status !== "pending") throw new ApiError(409, "OCCURRENCE_NOT_PENDING");
      const space = await authorizeSpace(db, user, occurrence.space_id, "transact", ["personal"]);
      await guardOwnerTransactionQuota(db, space.owner_user_id, 1);
      let amountMinor = Number(occurrence.expected_minor);
      try {
        if (parsed.data.amount !== undefined && parsed.data.amount !== "") amountMinor = parseMoneyToMinor(parsed.data.amount, space.currency);
      } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
      if (occurrence.amount_mode === "variable" && (!parsed.data.amount || parsed.data.amount === "")) throw new ApiError(400, "VARIABLE_AMOUNT_REQUIRED");
      if (amountMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT");
      const accountId = parsed.data.accountId || occurrence.account_id
        || (await db.prepare("SELECT id FROM personal_accounts WHERE space_id=? AND status='active' ORDER BY created_at LIMIT 1").bind(occurrence.space_id).first<{ id: string }>())?.id
        || null;
      const createdAt = now();
      const transactionId = crypto.randomUUID();
      const expectedMinor = Number(occurrence.expected_minor);
      const delta = amountMinor - expectedMinor;
      const deltaLabelAr = delta === 0 ? "مطابق" : delta > 0 ? `زيادة ${(delta / 1000).toFixed(3)}` : `نقص ${((-delta) / 1000).toFixed(3)}`;
      const deltaLabelEn = delta === 0 ? "matches" : delta > 0 ? `over ${(delta / 1000).toFixed(3)}` : `short ${((-delta) / 1000).toFixed(3)}`;
      const descriptionAr = `${occurrence.rule_name} · ${occurrence.period_key} · التزام ${(expectedMinor / 1000).toFixed(3)} · مدفوع ${(amountMinor / 1000).toFixed(3)} · ${deltaLabelAr}`;
      const descriptionEn = `${occurrence.rule_name} · ${occurrence.period_key} · due ${(expectedMinor / 1000).toFixed(3)} · paid ${(amountMinor / 1000).toFixed(3)} · ${deltaLabelEn}`;
      const kind = occurrence.rule_kind === "income" ? "income" : "expense";
      await db.batch([
        db.prepare("INSERT INTO transactions VALUES (?, ?, ?, NULL, ?, 'general', ?, ?, ?, 'approved', ?, ?)")
          .bind(transactionId, occurrence.space_id, user.id, kind, amountMinor, descriptionAr, descriptionEn, createdAt, createdAt),
        db.prepare("UPDATE transactions SET account_id=? WHERE id=?").bind(accountId, transactionId),
        db.prepare("UPDATE personal_occurrences SET status='posted', actual_minor=?, account_id=?, transaction_id=? WHERE id=? AND status='pending'")
          .bind(amountMinor, accountId, transactionId, occurrence.id),
        db.prepare("UPDATE personal_rules SET paid_minor = paid_minor + ? WHERE id=?").bind(kind === "expense" ? amountMinor : 0, occurrence.rule_id),
        prepareAudit(db, { userId: user.id, action: "personal.occurrence_posted", entityType: "transaction", entityId: transactionId, metadata: { occurrenceId: occurrence.id, amountMinor }, createdAt }),
      ]);
      await rebuildSpaceBalance(db, [occurrence.space_id]);
    } else if (action === "assignPersonalOccurrenceAccount") {
      const parsed = z.object({
        occurrenceId: z.string().min(1).max(120),
        accountId: z.string().min(1).max(120),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_OCCURRENCE");
      const occurrence = await db.prepare("SELECT id,space_id,status FROM personal_occurrences WHERE id=?").bind(parsed.data.occurrenceId).first<{ id: string; space_id: string; status: string }>();
      if (!occurrence) throw new ApiError(404, "OCCURRENCE_NOT_FOUND");
      if (occurrence.status !== "pending") throw new ApiError(409, "OCCURRENCE_NOT_PENDING");
      await authorizeSpace(db, user, occurrence.space_id, "transact", ["personal"]);
      const account = await db.prepare("SELECT id FROM personal_accounts WHERE id=? AND space_id=? AND status='active'").bind(parsed.data.accountId, occurrence.space_id).first();
      if (!account) throw new ApiError(400, "INVALID_ACCOUNT");
      await db.prepare("UPDATE personal_occurrences SET account_id=? WHERE id=? AND status='pending'").bind(parsed.data.accountId, occurrence.id).run();
    } else if (action === "skipPersonalOccurrence") {
      const parsed = z.object({ occurrenceId: z.string().min(1).max(120) }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_OCCURRENCE");
      const occurrence = await db.prepare("SELECT id,space_id,status FROM personal_occurrences WHERE id=?").bind(parsed.data.occurrenceId).first<{ id: string; space_id: string; status: string }>();
      if (!occurrence) throw new ApiError(404, "OCCURRENCE_NOT_FOUND");
      if (occurrence.status !== "pending") throw new ApiError(409, "OCCURRENCE_NOT_PENDING");
      await authorizeSpace(db, user, occurrence.space_id, "transact", ["personal"]);
      await db.prepare("UPDATE personal_occurrences SET status='skipped' WHERE id=? AND status='pending'").bind(occurrence.id).run();
    } else if (action === "deferPersonalOccurrence") {
      const parsed = z.object({
        occurrenceId: z.string().min(1).max(120),
        deferUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_OCCURRENCE");
      const occurrence = await db.prepare("SELECT id,rule_id,space_id,period_key,status FROM personal_occurrences WHERE id=?")
        .bind(parsed.data.occurrenceId)
        .first<{ id: string; rule_id: string; space_id: string; period_key: string; status: string }>();
      if (!occurrence) throw new ApiError(404, "OCCURRENCE_NOT_FOUND");
      if (occurrence.status !== "pending") throw new ApiError(409, "OCCURRENCE_NOT_PENDING");
      await authorizeSpace(db, user, occurrence.space_id, "transact", ["personal"]);
      const dueAt = `${parsed.data.deferUntil}T12:00:00.000Z`;
      if (Number.isNaN(new Date(dueAt).getTime())) throw new ApiError(400, "INVALID_START_DATE");
      const targetKey = periodKeyFromDate(dueAt);
      const clash = await db.prepare("SELECT id FROM personal_occurrences WHERE rule_id=? AND period_key=? AND id<>?")
        .bind(occurrence.rule_id, targetKey, occurrence.id)
        .first<{ id: string }>();
      if (clash) {
        await db.prepare("UPDATE personal_occurrences SET due_at=? WHERE id=? AND status='pending'").bind(dueAt, occurrence.id).run();
      } else {
        await db.prepare("UPDATE personal_occurrences SET period_key=?, due_at=? WHERE id=? AND status='pending'").bind(targetKey, dueAt, occurrence.id).run();
      }
    } else if (action === "queuePersonalOccurrence") {
      const parsed = z.object({
        ruleId: z.string().min(1).max(120),
        periodKey: z.string().regex(/^\d{4}-\d{2}$/),
        amount: z.union([z.string(), z.number()]).optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_OCCURRENCE");
      const rule = await db.prepare("SELECT * FROM personal_rules WHERE id=?").bind(parsed.data.ruleId).first<PersonalRuleRow>();
      if (!rule) throw new ApiError(404, "RULE_NOT_FOUND");
      const space = await authorizeSpace(db, user, rule.space_id, "transact", ["personal"]);
      let amountMinor = Number(rule.amount_minor);
      try {
        if (parsed.data.amount !== undefined && parsed.data.amount !== "") amountMinor = parseMoneyToMinor(parsed.data.amount, space.currency);
      } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
      if (amountMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT");
      const createdAt = now();
      await db.prepare("INSERT OR IGNORE INTO personal_occurrences (id,rule_id,space_id,account_id,period_key,due_at,expected_minor,actual_minor,status,transaction_id,created_at) VALUES (?,?,?,?,?,?,?,NULL,'pending',NULL,?)")
        .bind(crypto.randomUUID(), rule.id, rule.space_id, rule.account_id, parsed.data.periodKey, dueAtForPeriod(parsed.data.periodKey, Number(rule.due_day) || 1), amountMinor, createdAt).run();
    } else if (action === "saveSpacePayoutAccount") {
      const parsed = z.object({
        spaceId: z.string().min(1).max(120),
        label: z.string().trim().min(2).max(80),
        accountNumber: z.string().trim().min(4).max(80),
        linkedMemberId: z.string().min(1).max(120).optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_PAYOUT_ACCOUNT");
      await authorizeSpace(db, user, parsed.data.spaceId, "members:write", ["household", "trip", "society", "group"]);
      if (parsed.data.linkedMemberId) {
        const linked = await db.prepare("SELECT id FROM members WHERE id=? AND space_id=? AND status='active'").bind(parsed.data.linkedMemberId, parsed.data.spaceId).first();
        if (!linked) throw new ApiError(400, "INVALID_MEMBER");
      }
      const createdAt = now();
      await db.prepare(`INSERT INTO space_payout_accounts (id,space_id,label,account_number,linked_member_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(space_id) DO UPDATE SET label=excluded.label, account_number=excluded.account_number, linked_member_id=excluded.linked_member_id, updated_at=excluded.updated_at`)
        .bind(crypto.randomUUID(), parsed.data.spaceId, parsed.data.label, parsed.data.accountNumber, parsed.data.linkedMemberId ?? null, createdAt, createdAt).run();
    } else if (action === "addFamilyEvent") {
      const parsed = z.object({
        spaceId: z.string().min(1).max(120),
        title: z.string().trim().min(2).max(120),
        kind: z.enum(["outing", "treatment", "aid", "person_payment", "other"]).default("outing"),
        targetAt: z.string().min(8).max(40),
        expected: z.union([z.string(), z.number()]),
        notes: z.string().trim().max(400).optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_FAMILY_EVENT");
      const space = await authorizeSpace(db, user, parsed.data.spaceId, "transact", ["household"]);
      let expectedMinor: number;
      try { expectedMinor = parseMoneyToMinor(parsed.data.expected, space.currency); } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
      const createdAt = now();
      await db.prepare("INSERT INTO family_events (id,space_id,title,kind,target_at,expected_minor,notes,status,created_at) VALUES (?,?,?,?,?,?,?,'planned',?)")
        .bind(crypto.randomUUID(), parsed.data.spaceId, parsed.data.title, parsed.data.kind, parseStartDate(parsed.data.targetAt), expectedMinor, parsed.data.notes ?? null, createdAt).run();
    } else if (action === "addMember") {
      const parsed = z.object({
        spaceId: z.string().min(1).max(120),
        displayName: z.string().trim().min(2).max(80),
        email: z.union([z.email().max(254), z.literal("")]).optional(),
        phone: z.string().trim().max(20).optional(),
        role: z.enum(["member", "treasurer", "manager", "auditor", "viewer"]).default("member"),
        monthlyContribution: z.union([z.string(), z.number()]).optional(),
        durationMonths: z.coerce.number().int().min(1).max(120).optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_MEMBER");
      if (parsed.data.phone && !isLikelyPhone(parsed.data.phone)) throw new ApiError(400, "INVALID_PHONE");
      await authorizeSpace(db, user, parsed.data.spaceId, "members:write", ["household", "trip", "society", "group"]);
      const { getActivePlanEntitlements } = await import("../../../services/admin/billing-service");
      const entitlements = await getActivePlanEntitlements(db, user.id);
      const platformRole = await db.prepare("SELECT role FROM platform_roles WHERE user_id=?").bind(user.id).first<{ role: string }>();
      const isPlatformAdmin = ["super_admin", "admin"].includes(platformRole?.role ?? "");
      const count = await db.prepare("SELECT COUNT(*) AS count FROM members WHERE space_id=? AND status='active'").bind(parsed.data.spaceId).first<{ count: number }>();
      const memberLimit = isPlatformAdmin ? Math.max(entitlements.memberLimit, 200) : entitlements.memberLimit;
      if (Number(count?.count ?? 0) >= memberLimit) throw new ApiError(403, "PLAN_MEMBER_LIMIT");
      const space = await db.prepare("SELECT currency FROM spaces WHERE id=?").bind(parsed.data.spaceId).first<{ currency: string }>();
      const currency = space?.currency ?? "OMR";
      const contribution = await db.prepare("SELECT amount_minor,duration_months,starts_at FROM contribution_plans WHERE space_id=? LIMIT 1").bind(parsed.data.spaceId).first<{ amount_minor: number; duration_months: number; starts_at: string }>();
      let monthlyMinor = Number(contribution?.amount_minor ?? 0);
      if (parsed.data.monthlyContribution !== undefined && parsed.data.monthlyContribution !== "") {
        try { monthlyMinor = parseMoneyToMinor(parsed.data.monthlyContribution, currency); } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
      }
      const durationMonths = parsed.data.durationMonths ?? Number(contribution?.duration_months ?? 12);
      const memberId = crypto.randomUUID(); const createdAt = now();
      const dueMinor = multiplyMinor(monthlyMinor, durationMonths);
      const phone = parsed.data.phone?.trim() ? toWhatsAppNumber(parsed.data.phone) || parsed.data.phone.trim() : null;
      const planForMember = { amount_minor: monthlyMinor, duration_months: durationMonths, starts_at: contribution?.starts_at || createdAt };
      await db.batch([
        db.prepare("INSERT INTO members (id,space_id,user_id,display_name,email,phone,role,status,due_minor,paid_minor,extra_minor,avatar,joined_at) VALUES (?,?,NULL,?,?,?,?,'active',?,0,0,'#0f766e',?)").bind(memberId, parsed.data.spaceId, parsed.data.displayName, parsed.data.email || null, phone, parsed.data.role, dueMinor, createdAt),
        ...await installmentInsertStatements(db, { id: memberId, space_id: parsed.data.spaceId, paid_minor: 0 }, planForMember, createdAt),
        prepareAudit(db, { userId: user.id, action: "member.created", entityType: "member", entityId: memberId, metadata: { spaceId: parsed.data.spaceId, role: parsed.data.role, durationMonths, monthlyMinor }, createdAt }),
        db.prepare(`UPDATE spaces SET goal_minor = COALESCE((SELECT SUM(due_minor) FROM members WHERE space_id=? AND status='active'), 0) WHERE id=?`).bind(parsed.data.spaceId, parsed.data.spaceId),
      ]);
      await upsertSavedContact(db, user.id, { displayName: parsed.data.displayName, email: parsed.data.email || null, phone }, createdAt);
    } else if (action === "addTransaction") {
      const parsed = z.object({ spaceId: z.string().min(1).max(120), kind: z.enum(["expense", "income", "contribution", "reimbursement"]), allocation: z.enum(["general", "mandatory", "personal_reserve"]), description: z.string().trim().min(2).max(300), amount: z.union([z.string(),z.number()]), memberId: z.string().max(120).optional(), selectedIds: z.array(z.string().min(1).max(160)).max(120).optional(), occurredAt: z.iso.datetime().optional() }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_TRANSACTION");
      const { spaceId, allocation, description } = parsed.data;
      let kind = parsed.data.kind;
      const space = await authorizeSpace(db, user, spaceId, "transact"); const memberId = parsed.data.memberId ?? null;
      await guardOwnerTransactionQuota(db, space.owner_user_id, 2);
      await assertPeriodWritable(db, spaceId, parsed.data.occurredAt ?? now());
      // Group payments linked to a member count as contributions toward dues (not plain income).
      if (memberId && kind === "income" && ["household", "trip", "society", "group"].includes(space.type)) {
        kind = "contribution";
      }
      if (kind === "contribution" && !memberId && ["household", "trip", "society", "group"].includes(space.type)) {
        throw new ApiError(400, "MEMBER_REQUIRED");
      }
      let amountMinor: number; try { amountMinor = parseMoneyToMinor(parsed.data.amount, space.currency); } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
      const member = memberId ? await db.prepare("SELECT id,space_id,extra_minor,due_minor,paid_minor FROM members WHERE id=? AND space_id=? AND status='active'").bind(memberId, spaceId).first<{ id: string; space_id: string; extra_minor: number; due_minor: number; paid_minor: number }>() : null;
      if (memberId && !member) throw new ApiError(400, "INVALID_MEMBER");
      if (allocation === "personal_reserve" && (!memberId || !["contribution", "reimbursement"].includes(kind))) throw new ApiError(400, "INVALID_RESERVE_OPERATION");
      if (allocation === "personal_reserve" && kind === "reimbursement" && Number(member?.extra_minor ?? 0) < amountMinor) throw new ApiError(409, "INSUFFICIENT_PERSONAL_RESERVE");
      // Member income/contribution on group wallets: apply to outstanding dues first; surplus = advance.
      if (
        member
        && kind === "contribution"
        && allocation !== "personal_reserve"
        && ["household", "trip", "society", "group"].includes(space.type)
      ) {
        const remainingDueMinor = Math.max(0, Number(member.due_minor) - Number(member.paid_minor));
        const plan = await db.prepare("SELECT amount_minor,duration_months,starts_at FROM contribution_plans WHERE space_id=? ORDER BY starts_at LIMIT 1")
          .bind(spaceId)
          .first<{ amount_minor: number; duration_months: number; starts_at: string }>();
        const monthlyPlanMinor = Number(plan?.amount_minor ?? remainingDueMinor);
        let split;
        try {
          split = splitContributionPayment(amountMinor, monthlyPlanMinor, {
            remainingDueMinor,
            extraPolicy: "advance_credit",
          });
        } catch {
          throw new ApiError(400, "INVALID_CONTRIBUTION_SPLIT");
        }
        const createdAt = now();
        const occurredAt = parsed.data.occurredAt ?? createdAt;
        const statements: D1PreparedStatement[] = [];
        if (split.mandatoryMinor > 0) {
          const installmentWork = await paymentInstallmentStatements(db, member, plan, split.mandatoryMinor, createdAt, parsed.data.selectedIds);
          statements.push(...installmentWork.statements);
          const transactionId = crypto.randomUUID();
          const entryId = crypto.randomUUID();
          const lineDescription = `${description} · سداد مطالبة`;
          statements.push(
            db.prepare("INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)")
              .bind(transactionId, spaceId, user.id, memberId, "contribution", "mandatory", split.mandatoryMinor, lineDescription, lineDescription, occurredAt, createdAt),
            db.prepare("UPDATE spaces SET balance_minor = balance_minor + ? WHERE id = ?").bind(split.mandatoryMinor, spaceId),
            db.prepare("UPDATE members SET paid_minor = paid_minor + ? WHERE id = ? AND space_id = ?").bind(split.mandatoryMinor, memberId, spaceId),
            db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
              .bind(entryId, spaceId, transactionId, user.id, lineDescription, occurredAt, createdAt),
            db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
              .bind(crypto.randomUUID(), entryId, "asset:cash", memberId, split.mandatoryMinor, 0, createdAt),
            db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
              .bind(crypto.randomUUID(), entryId, "income:contribution", memberId, 0, split.mandatoryMinor, createdAt),
          );
        }
        if (split.surplusMinor > 0) {
          const transactionId = crypto.randomUUID();
          const entryId = crypto.randomUUID();
          const lineDescription = `${description} · مقدّم`;
          statements.push(
            db.prepare("INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)")
              .bind(transactionId, spaceId, user.id, memberId, "contribution", "advance", split.surplusMinor, lineDescription, lineDescription, occurredAt, createdAt),
            db.prepare("UPDATE spaces SET balance_minor = balance_minor + ? WHERE id = ?").bind(split.surplusMinor, spaceId),
            db.prepare("UPDATE members SET paid_minor = paid_minor + ? WHERE id = ? AND space_id = ?").bind(split.surplusMinor, memberId, spaceId),
            db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
              .bind(entryId, spaceId, transactionId, user.id, lineDescription, occurredAt, createdAt),
            db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
              .bind(crypto.randomUUID(), entryId, "asset:cash", memberId, split.surplusMinor, 0, createdAt),
            db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
              .bind(crypto.randomUUID(), entryId, "liability:advance", memberId, 0, split.surplusMinor, createdAt),
          );
        }
        statements.push(prepareAudit(db, {
          userId: user.id,
          action: "transaction.created",
          entityType: "transaction",
          entityId: spaceId,
          metadata: { spaceId, kind: "contribution", amountMinor, memberId, split },
          createdAt,
        }));
        statements.push(await periodWriteEvent(db, user, spaceId, occurredAt, {
          action: "transaction.created",
          entityType: "transaction",
          entityId: spaceId,
          summaryAr: `${user.displayName} سجّل سداد/دخل ${description}`,
          summaryEn: `${user.displayName} posted contribution ${description}`,
          metadata: { amountMinor, memberId },
        }));
        await db.batch(statements);
        await reconcileMemberLedgers(db, [spaceId]);
      } else {
      const positiveKinds = ["income", "contribution"];
      const balanceDelta = allocation === "personal_reserve"
        ? 0
        : (positiveKinds.includes(kind) ? amountMinor : -amountMinor);
      if (space.type === "personal" && balanceDelta < 0 && Number(space.balance_minor) + balanceDelta < 0) throw new ApiError(409, "INSUFFICIENT_FUNDS");
      const transactionId = crypto.randomUUID();
      const occurredAt = parsed.data.occurredAt ?? now();
      const entryId = crypto.randomUUID(); const createdAt = now();
      const reserveWithdrawal = allocation === "personal_reserve" && kind === "reimbursement";
      const debitAccount = reserveWithdrawal ? "liability:member_reserve" : balanceDelta >= 0 ? "asset:cash" : (kind === "reimbursement" ? "liability:member_payable" : "expense:general");
      const creditAccount = reserveWithdrawal ? "asset:cash" : balanceDelta >= 0 ? (allocation === "personal_reserve" ? "liability:member_reserve" : "income:general") : "asset:cash";
      const bookedAllocation = kind === "contribution" && allocation === "general" ? "mandatory" : allocation;
      const statements = [
        db.prepare("INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)")
          .bind(transactionId, spaceId, user.id, memberId, kind, bookedAllocation, amountMinor, description, description, occurredAt, createdAt),
        db.prepare("UPDATE spaces SET balance_minor = balance_minor + ? WHERE id = ?").bind(balanceDelta, spaceId),
        db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
          .bind(entryId, spaceId, transactionId, user.id, description, occurredAt, createdAt),
        db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), entryId, debitAccount, memberId, amountMinor, 0, createdAt),
        db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), entryId, creditAccount, memberId, 0, amountMinor, createdAt),
      ];
      if (memberId && allocation === "personal_reserve") {
        statements.push(db.prepare("UPDATE members SET extra_minor = extra_minor + ? WHERE id = ? AND space_id = ?")
          .bind(kind === "reimbursement" ? -amountMinor : amountMinor, memberId, spaceId));
      } else if (memberId && ["contribution", "income"].includes(kind)) {
        statements.push(db.prepare("UPDATE members SET paid_minor = paid_minor + ? WHERE id = ? AND space_id = ?")
          .bind(amountMinor, memberId, spaceId));
      }
      statements.push(prepareAudit(db, { userId: user.id, action: "transaction.created", entityType: "transaction", entityId: transactionId, metadata: { spaceId, kind, allocation: bookedAllocation, amountMinor, memberId }, createdAt }));
      statements.push(await periodWriteEvent(db, user, spaceId, occurredAt, {
        action: "transaction.created",
        entityType: "transaction",
        entityId: transactionId,
        summaryAr: `${user.displayName} أضاف حركة: ${description}`,
        summaryEn: `${user.displayName} added transaction: ${description}`,
        metadata: { kind, amountMinor },
      }));
      await db.batch(statements);
      await reconcileMemberLedgers(db, [spaceId]);
      }
    } else if (action === "voidTransaction") {
      const parsed = z.object({ transactionId: z.string().min(1).max(120) }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_TRANSACTION");
      const txn = await db.prepare("SELECT * FROM transactions WHERE id=?").bind(parsed.data.transactionId).first<TransactionRow>();
      if (!txn) throw new ApiError(404, "TRANSACTION_NOT_FOUND");
      await authorizeSpace(db, user, txn.space_id, "transact");
      if (txn.status !== "voided" && txn.status !== "superseded") {
        await voidApprovedTransaction(db, txn, user.id, { recordStatus: "voided", closeOccurrence: true });
        try {
          const voidEvent = await periodWriteEvent(db, user, txn.space_id, txn.occurred_at, {
            action: "transaction.voided",
            entityType: "transaction",
            entityId: txn.id,
            summaryAr: `${user.displayName} ألغى حركة ${txn.description_ar} (${txn.amount_minor})`,
            summaryEn: `${user.displayName} voided ${txn.description_en} (${txn.amount_minor})`,
            metadata: { amountMinor: txn.amount_minor, kind: txn.kind },
          });
          await voidEvent.run();
        } catch { /* ledger note is optional; the void already applied */ }
      }
    } else if (action === "updateTransaction") {
      const parsed = z.object({
        transactionId: z.string().min(1).max(120),
        description: z.string().trim().min(2).max(300),
        amount: z.union([z.string(), z.number()]),
        memberId: z.string().max(120).nullable().optional(),
        kind: z.enum(["expense", "income", "contribution", "reimbursement"]).optional(),
        allocation: z.enum(["general", "mandatory", "personal_reserve"]).optional(),
        occurredAt: z.iso.datetime().optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_TRANSACTION");
      const existing = await db.prepare("SELECT * FROM transactions WHERE id=?").bind(parsed.data.transactionId).first<TransactionRow>();
      if (!existing) throw new ApiError(404, "TRANSACTION_NOT_FOUND");
      const space = await authorizeSpace(db, user, existing.space_id, "transact");
      await assertPeriodWritable(db, existing.space_id, existing.occurred_at);
      const linkedOccurrence = await db.prepare(`SELECT o.id, o.rule_id, r.kind FROM personal_occurrences o JOIN personal_rules r ON r.id=o.rule_id WHERE o.transaction_id=?`)
        .bind(existing.id)
        .first<{ id: string; rule_id: string; kind: string }>();
      await voidApprovedTransaction(db, existing, user.id, { recordStatus: "superseded", closeOccurrence: false });

      let kind = parsed.data.kind ?? existing.kind;
      let allocation = parsed.data.allocation ?? existing.allocation;
      const memberId = parsed.data.memberId === undefined ? existing.member_id : parsed.data.memberId;
      if (memberId && kind === "income" && ["household", "trip", "society", "group"].includes(space.type)) kind = "contribution";
      if (kind === "contribution" && allocation === "general") allocation = "mandatory";
      let amountMinor: number;
      try { amountMinor = parseMoneyToMinor(parsed.data.amount, space.currency); } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
      if (memberId) {
        const member = await db.prepare("SELECT id FROM members WHERE id=? AND space_id=? AND status='active'").bind(memberId, existing.space_id).first();
        if (!member) throw new ApiError(400, "INVALID_MEMBER");
      }
      const balanceDelta = transactionBalanceDelta(kind, allocation, amountMinor);
      const refreshed = await db.prepare("SELECT balance_minor FROM spaces WHERE id=?").bind(existing.space_id).first<{ balance_minor: number }>();
      if (space.type === "personal" && balanceDelta < 0 && Number(refreshed?.balance_minor ?? 0) + balanceDelta < 0) throw new ApiError(409, "INSUFFICIENT_FUNDS");
      const transactionId = crypto.randomUUID();
      const occurredAt = parsed.data.occurredAt ?? existing.occurred_at;
      const createdAt = now();
      const description = parsed.data.description;
      const entryId = crypto.randomUUID();
      const reserveWithdrawal = allocation === "personal_reserve" && kind === "reimbursement";
      const debitAccount = reserveWithdrawal ? "liability:member_reserve" : balanceDelta >= 0 ? "asset:cash" : (kind === "reimbursement" ? "liability:member_payable" : "expense:general");
      const creditAccount = reserveWithdrawal ? "asset:cash" : balanceDelta >= 0 ? (allocation === "personal_reserve" ? "liability:member_reserve" : "income:general") : "asset:cash";
      await db.batch([
        db.prepare("INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)")
          .bind(transactionId, existing.space_id, user.id, memberId, kind, allocation, amountMinor, description, description, occurredAt, createdAt),
        db.prepare("UPDATE spaces SET balance_minor = balance_minor + ? WHERE id = ?").bind(balanceDelta, existing.space_id),
        db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
          .bind(entryId, existing.space_id, transactionId, user.id, description, occurredAt, createdAt),
        db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), entryId, debitAccount, memberId, amountMinor, 0, createdAt),
        db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), entryId, creditAccount, memberId, 0, amountMinor, createdAt),
        prepareAudit(db, { userId: user.id, action: "transaction.updated", entityType: "transaction", entityId: transactionId, metadata: { replaces: existing.id, spaceId: existing.space_id, kind, allocation, amountMinor, memberId }, createdAt }),
        await periodWriteEvent(db, user, existing.space_id, occurredAt, {
          action: "transaction.updated",
          entityType: "transaction",
          entityId: transactionId,
          summaryAr: `${user.displayName} عدّل حركة ${existing.description_ar} ← ${description}`,
          summaryEn: `${user.displayName} edited ${existing.description_en} → ${description}`,
          metadata: { replaces: existing.id, beforeAmount: existing.amount_minor, afterAmount: amountMinor, beforeKind: existing.kind, afterKind: kind },
        }),
      ]);
      if (linkedOccurrence) {
        await db.batch([
          db.prepare("UPDATE personal_occurrences SET status='posted', actual_minor=?, transaction_id=? WHERE id=?")
            .bind(amountMinor, transactionId, linkedOccurrence.id),
          ...(linkedOccurrence.kind === "expense"
            ? [db.prepare("UPDATE personal_rules SET paid_minor = paid_minor + ? WHERE id=?").bind(amountMinor, linkedOccurrence.rule_id)]
            : []),
        ]);
      }
      await reconcileMemberLedgers(db, [existing.space_id]);
    } else if (action === "completeCircleTurn") {
      const parsed = z.object({ turnId: z.string().min(1).max(120) }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_CIRCLE_TURN");
      const turn = await db.prepare(`SELECT ct.id,ct.space_id,ct.member_id,ct.turn_number,ct.amount_minor,s.balance_minor,m.display_name
        FROM circle_turns ct JOIN spaces s ON s.id=ct.space_id JOIN members m ON m.id=ct.member_id
        WHERE ct.id=? AND ct.status='scheduled' AND ct.turn_number=(SELECT MIN(turn_number) FROM circle_turns WHERE space_id=ct.space_id AND status='scheduled')`)
        .bind(parsed.data.turnId).first<{ id: string; space_id: string; member_id: string; turn_number: number; amount_minor: number; balance_minor: number; display_name: string }>();
      if (!turn) throw new ApiError(409, "TURN_NOT_CURRENT");
      const circleSpace = await authorizeSpace(db, user, turn.space_id, "circle:write", ["society", "group"]);
      await guardOwnerTransactionQuota(db, circleSpace.owner_user_id, 1);
      if (Number(turn.balance_minor) < Number(turn.amount_minor)) throw new ApiError(409, "INSUFFICIENT_FUNDS");
      const transactionId = crypto.randomUUID(); const entryId = crypto.randomUUID(); const createdAt = now(); const description = `Circle payout #${turn.turn_number} — ${turn.display_name}`;
      await db.batch([
        db.prepare("INSERT INTO financial_operation_claims (operation_type,resource_id,idempotency_key,created_at) VALUES ('circle_payout',?,?,?)").bind(turn.id, idempotencyKey, createdAt),
        db.prepare("UPDATE circle_turns SET status='paid',paid_at=? WHERE id=? AND status='scheduled'").bind(createdAt, turn.id),
        db.prepare("UPDATE circle_configs SET current_turn=?,updated_by=?,updated_at=? WHERE space_id=?").bind(turn.turn_number, user.id, createdAt, turn.space_id),
        db.prepare("UPDATE spaces SET balance_minor=balance_minor-? WHERE id=?").bind(turn.amount_minor, turn.space_id),
        db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,'general',?,?,?,'approved',?,?)").bind(transactionId, turn.space_id, user.id, turn.member_id, "expense", turn.amount_minor, description, description, createdAt, createdAt),
        db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)").bind(entryId, turn.space_id, transactionId, user.id, description, createdAt, createdAt),
        db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(), entryId, "expense:circle_payout", turn.member_id, turn.amount_minor, 0, createdAt),
        db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(), entryId, "asset:cash", turn.member_id, 0, turn.amount_minor, createdAt),
        prepareAudit(db, { userId: user.id, action: "circle.turn_paid", entityType: "circle_turn", entityId: turn.id, metadata: { memberId: turn.member_id, amountMinor: turn.amount_minor }, createdAt }),
      ]);
    } else if (action === "settleReimbursement") {
      const parsed = z.object({ settlementId: z.string().min(1).max(120) }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_SETTLEMENT");
      const settlement = await db.prepare(`SELECT st.id,st.space_id,st.from_member_id,st.to_member_id,st.amount_minor,st.expense_id,s.balance_minor FROM settlements st
        JOIN spaces s ON s.id=st.space_id WHERE st.id=? AND st.status='pending'`).bind(parsed.data.settlementId).first<{ id: string; space_id: string; from_member_id: string; to_member_id: string; amount_minor: number; expense_id: string | null; balance_minor: number }>();
      if (!settlement) throw new ApiError(404, "SETTLEMENT_NOT_FOUND");
      const settlementSpace = await authorizeSpace(db, user, settlement.space_id, "settlements:write", ["household", "trip", "society", "group"]);
      await guardOwnerTransactionQuota(db, settlementSpace.owner_user_id, 2);
      const fromFund = String(settlement.from_member_id).startsWith("space:");
      const toFund = String(settlement.to_member_id).startsWith("space:");
      const entryId = crypto.randomUUID(); const createdAt = now();
      if (toFund) {
        const payTxn = crypto.randomUUID();
        const payEntry = crypto.randomUUID();
        const desc = "تسوية حصة مصروف للصندوق";
        await db.batch([
          db.prepare("UPDATE settlements SET status='settled',settled_at=? WHERE id=? AND status='pending'").bind(createdAt, settlement.id),
          db.prepare("UPDATE spaces SET balance_minor = balance_minor + ? WHERE id=?").bind(settlement.amount_minor, settlement.space_id),
          db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,'extra',?,?,?,'approved',?,?)")
            .bind(payTxn, settlement.space_id, user.id, settlement.from_member_id, "income", settlement.amount_minor, desc, desc, createdAt, createdAt),
          db.prepare("UPDATE members SET addon_minor = COALESCE(addon_minor,0) + ? WHERE id=?").bind(settlement.amount_minor, settlement.from_member_id),
          db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
            .bind(payEntry, settlement.space_id, payTxn, user.id, desc, createdAt, createdAt),
          db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), payEntry, "asset:cash", settlement.from_member_id, settlement.amount_minor, 0, createdAt),
          db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), payEntry, "income:contribution", settlement.from_member_id, 0, settlement.amount_minor, createdAt),
          prepareAudit(db, { userId: user.id, action: "expense.share_paid_to_fund", entityType: "settlement", entityId: settlement.id, metadata: { amountMinor: settlement.amount_minor }, createdAt }),
        ]);
      } else if (fromFund) {
        if (Number(settlement.balance_minor) < Number(settlement.amount_minor)) throw new ApiError(409, "INSUFFICIENT_FUNDS");
        await db.batch([
          db.prepare("INSERT INTO financial_operation_claims (operation_type,resource_id,idempotency_key,created_at) VALUES ('trip_settlement',?,?,?)").bind(settlement.id, idempotencyKey, createdAt),
          db.prepare("UPDATE settlements SET status='settled',settled_at=? WHERE id=? AND status='pending'").bind(createdAt, settlement.id),
          db.prepare("UPDATE spaces SET balance_minor=balance_minor-? WHERE id=?").bind(settlement.amount_minor, settlement.space_id),
          db.prepare("INSERT INTO journal_entries (id,space_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,'Member reimbursement settled','posted',?,?)").bind(entryId, settlement.space_id, user.id, createdAt, createdAt),
          db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(), entryId, "liability:member_payable", settlement.to_member_id, settlement.amount_minor, 0, createdAt),
          db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(), entryId, "asset:cash", settlement.to_member_id, 0, settlement.amount_minor, createdAt),
          prepareAudit(db, { userId: user.id, action: "trip.reimbursement_settled", entityType: "settlement", entityId: settlement.id, metadata: { amountMinor: settlement.amount_minor }, createdAt }),
        ]);
      } else {
        const names = await db.prepare("SELECT id,display_name FROM members WHERE id IN (?,?)")
          .bind(settlement.from_member_id, settlement.to_member_id)
          .all<{ id: string; display_name: string }>();
        const fromName = names.results.find((row) => row.id === settlement.from_member_id)?.display_name ?? "عضو";
        const toName = names.results.find((row) => row.id === settlement.to_member_id)?.display_name ?? "عضو";
        const expense = settlement.expense_id
          ? await db.prepare("SELECT description FROM trip_expenses WHERE id=?").bind(settlement.expense_id).first<{ description: string }>()
          : null;
        const reason = expense?.description || "مصروف جماعي";
        const descFrom = `مبلغ إضافي · تسوية حصة «${reason}» إلى ${toName}`;
        const descTo = `استرداد مبلغ إضافي · تسوية حصة «${reason}» من ${fromName}`;
        const fromTxn = crypto.randomUUID();
        const toTxn = crypto.randomUUID();
        await db.batch([
          db.prepare("UPDATE settlements SET status='settled',settled_at=? WHERE id=? AND status='pending'").bind(createdAt, settlement.id),
          db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,'extra',?,?,?,'approved',?,?)")
            .bind(fromTxn, settlement.space_id, user.id, settlement.from_member_id, "expense", settlement.amount_minor, descFrom, descFrom, createdAt, createdAt),
          db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,'extra',?,?,?,'approved',?,?)")
            .bind(toTxn, settlement.space_id, user.id, settlement.to_member_id, "income", settlement.amount_minor, descTo, descTo, createdAt, createdAt),
          db.prepare("UPDATE members SET addon_minor = COALESCE(addon_minor,0) + ? WHERE id=?").bind(settlement.amount_minor, settlement.from_member_id),
          prepareAudit(db, { userId: user.id, action: "member.settlement_recorded", entityType: "settlement", entityId: settlement.id, metadata: { fromMemberId: settlement.from_member_id, toMemberId: settlement.to_member_id, amountMinor: settlement.amount_minor, reason }, createdAt }),
        ]);
      }
    } else if (action === "setCircleOrder") {
      const parsed = z.object({
        spaceId: z.string().min(1).max(120), mode: z.enum(["manual", "round_robin", "draw", "alphabetical", "hierarchical"]),
        memberIds: z.array(z.string().max(120)).optional(), previousRecipientId: z.string().max(120).optional(),
        amount: z.union([z.string(),z.number()]), seed: z.string().min(16).max(200).optional(),
        monthlyContribution: z.union([z.string(),z.number()]), durationMonths: z.coerce.number().int().min(1).max(120), dueDay: z.coerce.number().int().min(1).max(28),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_CIRCLE_ORDER");
      const space = await authorizeSpace(db, user, parsed.data.spaceId, "circle:write", ["society", "group"]);
      const rows = await db.prepare("SELECT id,display_name FROM members WHERE space_id=? AND status='active' ORDER BY joined_at")
        .bind(parsed.data.spaceId).all<{ id: string; display_name: string }>();
      if (!rows.results.length) throw new ApiError(400, "NO_ACTIVE_MEMBERS");
      let members = rows.results.map((member) => ({ id: member.id, name: member.display_name }));
      if (parsed.data.mode === "manual") {
        const requested = parsed.data.memberIds ?? [];
        if (requested.length !== members.length || new Set(requested).size !== members.length || members.some((member) => !requested.includes(member.id))) throw new ApiError(400, "INVALID_MANUAL_ORDER");
        members = requested.map((memberId) => members.find((member) => member.id === memberId)!);
      }
      const ordered = await buildCircleOrder(members, parsed.data.mode as CircleMode, { seed: parsed.data.seed, previousRecipientId: parsed.data.previousRecipientId });
      const createdAt = now(); let amountMinor: number; let contributionMinor: number;
      try { amountMinor = parseMoneyToMinor(parsed.data.amount, space.currency); contributionMinor = parseMoneyToMinor(parsed.data.monthlyContribution, space.currency); } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
      const totalDueMinor = contributionMinor * parsed.data.durationMonths;
      const previous = await db.prepare("SELECT COALESCE(MAX(turn_number),0) AS last_turn FROM circle_turns WHERE space_id=? AND status='paid'").bind(parsed.data.spaceId).first<{ last_turn: number }>();
      const existingPlan = await db.prepare("SELECT id FROM contribution_plans WHERE space_id=? ORDER BY starts_at LIMIT 1").bind(parsed.data.spaceId).first<{ id: string }>();
      const turnBase = Number(previous?.last_turn ?? 0);
      const statements: D1PreparedStatement[] = [
        db.prepare("DELETE FROM circle_turns WHERE space_id=? AND status='scheduled'").bind(parsed.data.spaceId),
        db.prepare(`INSERT INTO circle_configs (space_id,ordering_mode,draw_seed_hash,current_turn,updated_by,updated_at) VALUES (?,?,?,?,?,?)
          ON CONFLICT(space_id) DO UPDATE SET ordering_mode=excluded.ordering_mode,draw_seed_hash=excluded.draw_seed_hash,current_turn=excluded.current_turn,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
          .bind(parsed.data.spaceId, parsed.data.mode, ordered.seedHash, turnBase, user.id, createdAt),
        db.prepare(`INSERT INTO contribution_plans (id,space_id,amount_minor,interval,due_day,extra_policy,duration_months,starts_at) VALUES (?, ?, ?, 'monthly', ?, 'personal_reserve', ?, ?)
          ON CONFLICT(id) DO UPDATE SET amount_minor=excluded.amount_minor,due_day=excluded.due_day,duration_months=excluded.duration_months`)
          .bind(existingPlan?.id ?? `${parsed.data.spaceId}-plan`, parsed.data.spaceId, contributionMinor, parsed.data.dueDay, parsed.data.durationMonths, createdAt),
        db.prepare("UPDATE members SET due_minor=? WHERE space_id=? AND status='active'").bind(totalDueMinor, parsed.data.spaceId),
      ];
      ordered.members.forEach((member, index) => statements.push(db.prepare(`INSERT INTO circle_turns
        (id,space_id,member_id,turn_number,status,amount_minor,created_at) VALUES (?,?,?,?,'scheduled',?,?)`)
        .bind(crypto.randomUUID(), parsed.data.spaceId, member.id, turnBase + index + 1, amountMinor, createdAt)));
      statements.push(prepareAudit(db, { userId: user.id, action: "circle.order_set", entityType: "space", entityId: parsed.data.spaceId, metadata: { mode: parsed.data.mode, members: ordered.members.map((member) => member.id), seedHash: ordered.seedHash }, createdAt }));
      await db.batch(statements);
    } else if (action === "addTripExpense") {
      // Group expense: choose paid-from account (common fund vs member pocket).
      const parsed = z.object({
        spaceId: z.string().min(1).max(120),
        paidFrom: z.enum(["common_fund", "member"]).default("member"),
        paidByMemberId: z.string().min(1).max(120).optional(),
        amount: z.union([z.string(), z.number()]),
        description: z.string().trim().min(2).max(300),
        occurredAt: z.iso.datetime().optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_TRIP_EXPENSE");
      const space = await authorizeSpace(db, user, parsed.data.spaceId, "transact", ["household", "trip", "society", "group"]);
      await guardOwnerTransactionQuota(db, space.owner_user_id, 1);
      const members = await db.prepare("SELECT id FROM members WHERE space_id=? AND status='active' ORDER BY joined_at").bind(parsed.data.spaceId).all<{ id: string }>();
      if (!members.results.length) throw new ApiError(400, "NO_ACTIVE_MEMBERS");
      let amountMinor: number;
      try { amountMinor = parseMoneyToMinor(parsed.data.amount, space.currency); } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
      const paidFrom = parsed.data.paidFrom;
      const paidByMemberId = paidFrom === "member"
        ? parsed.data.paidByMemberId
        : (parsed.data.paidByMemberId ?? members.results[0]?.id);
      if (paidFrom === "member" && (!paidByMemberId || !members.results.some((member) => member.id === paidByMemberId))) {
        throw new ApiError(400, "INVALID_PAYER");
      }
      if (paidFrom === "common_fund" && !members.results[0]?.id) throw new ApiError(400, "NO_ACTIVE_MEMBERS");
      const fundPayerId = paidFrom === "common_fund" ? members.results[0]!.id : paidByMemberId!;
      const splits = splitEvenly(amountMinor, members.results.map((member) => member.id));
      const expenseId = crypto.randomUUID();
      const transactionId = crypto.randomUUID();
      const entryId = crypto.randomUUID();
      const createdAt = now();
      const occurredAt = parsed.data.occurredAt ?? createdAt;
      await assertPeriodWritable(db, parsed.data.spaceId, occurredAt);
      const statements: D1PreparedStatement[] = [
        db.prepare("INSERT INTO trip_expenses (id,space_id,paid_by_member_id,amount_minor,description,occurred_at,created_by,created_at,transaction_id,status,paid_from) VALUES (?,?,?,?,?,?,?,?,?,'posted',?)")
          .bind(expenseId, parsed.data.spaceId, fundPayerId, amountMinor, parsed.data.description, occurredAt, user.id, createdAt, transactionId, paidFrom),
      ];
      if (paidFrom === "common_fund") {
        statements.push(
          db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,'general',?,?,?,'approved',?,?)")
            .bind(transactionId, parsed.data.spaceId, user.id, null, "expense", amountMinor, parsed.data.description, parsed.data.description, occurredAt, createdAt),
          db.prepare("UPDATE spaces SET balance_minor = balance_minor - ? WHERE id = ?").bind(amountMinor, parsed.data.spaceId),
          db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
            .bind(entryId, parsed.data.spaceId, transactionId, user.id, parsed.data.description, occurredAt, createdAt),
          db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), entryId, "expense:group", null, amountMinor, 0, createdAt),
          db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), entryId, "asset:cash", null, 0, amountMinor, createdAt),
        );
      } else {
        // Member paid from pocket: payer is owed (له); others owe their share (عليه).
        statements.push(
          db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,'general',?,?,?,'approved',?,?)")
            .bind(transactionId, parsed.data.spaceId, user.id, paidByMemberId, "reimbursement", amountMinor, parsed.data.description, parsed.data.description, occurredAt, createdAt),
          db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
            .bind(entryId, parsed.data.spaceId, transactionId, user.id, parsed.data.description, occurredAt, createdAt),
          db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), entryId, "expense:trip", paidByMemberId, amountMinor, 0, createdAt),
          db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), entryId, "liability:member_payable", paidByMemberId, 0, amountMinor, createdAt),
        );
        const balances = members.results.map((member) => {
          const share = splits.find((item) => item.memberId === member.id)?.shareMinor ?? 0;
          const paid = member.id === paidByMemberId ? amountMinor : 0;
          return { memberId: member.id, balanceMinor: paid - share };
        });
        minimizeSettlements(balances).forEach((settlement) => {
          statements.push(
            db.prepare("INSERT INTO settlements (id,space_id,from_member_id,to_member_id,amount_minor,status,created_at,expense_id) VALUES (?,?,?,?,?,'pending',?,?)")
              .bind(crypto.randomUUID(), parsed.data.spaceId, settlement.fromMemberId, settlement.toMemberId, settlement.amountMinor, createdAt, expenseId),
          );
        });
      }
      splits.forEach((split) => statements.push(db.prepare("INSERT INTO expense_splits (id,expense_id,member_id,share_minor) VALUES (?,?,?,?)").bind(crypto.randomUUID(), expenseId, split.memberId, split.shareMinor)));
      statements.push(prepareAudit(db, {
        userId: user.id,
        action: "trip.expense_split",
        entityType: "trip_expense",
        entityId: expenseId,
        metadata: { amountMinor, paidFrom, paidByMemberId: paidFrom === "member" ? paidByMemberId : null, splits },
        createdAt,
      }));
      statements.push(await periodWriteEvent(db, user, parsed.data.spaceId, occurredAt, {
        action: "trip.expense_created",
        entityType: "trip_expense",
        entityId: expenseId,
        summaryAr: `${user.displayName} أضاف مصروفاً جماعياً: ${parsed.data.description}`,
        summaryEn: `${user.displayName} added group expense: ${parsed.data.description}`,
        metadata: { amountMinor },
      }));
      await db.batch(statements);
      await rebuildSpaceBalance(db, [parsed.data.spaceId]);
    } else if (action === "voidTripExpense") {
      const parsed = z.object({ expenseId: z.string().min(1).max(120) }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_TRIP_EXPENSE");
      const expense = await db.prepare("SELECT * FROM trip_expenses WHERE id=?").bind(parsed.data.expenseId)
        .first<{ id: string; space_id: string; transaction_id?: string | null; description: string; amount_minor: number; created_at: string; paid_by_member_id: string }>();
      if (!expense) throw new ApiError(404, "EXPENSE_NOT_FOUND");
      await authorizeSpace(db, user, expense.space_id, "transact", ["household", "trip", "society", "group"]);
      await assertPeriodWritable(db, expense.space_id, expense.created_at);
      const linkedTxn = expense.transaction_id
        ? await db.prepare("SELECT * FROM transactions WHERE id=?").bind(expense.transaction_id).first<TransactionRow>()
        : await db.prepare("SELECT * FROM transactions WHERE space_id=? AND description_ar=? AND amount_minor=? AND status='approved' ORDER BY occurred_at DESC LIMIT 1")
          .bind(expense.space_id, expense.description, expense.amount_minor).first<TransactionRow>();
      if (linkedTxn && linkedTxn.status === "approved") {
        await voidApprovedTransaction(db, linkedTxn, user.id);
      }
      await db.batch([
        db.prepare("UPDATE trip_expenses SET status='voided' WHERE id=?").bind(expense.id),
        db.prepare("UPDATE settlements SET status='voided' WHERE expense_id=? AND status='pending'").bind(expense.id),
        db.prepare("UPDATE settlements SET status='voided' WHERE space_id=? AND status='pending' AND created_at=? AND expense_id IS NULL").bind(expense.space_id, expense.created_at),
        prepareAudit(db, { userId: user.id, action: "trip.expense_voided", entityType: "trip_expense", entityId: expense.id, metadata: { spaceId: expense.space_id }, createdAt: now() }),
      ]);
      await rebuildSpaceBalance(db, [expense.space_id]);
    } else if (action === "updateTripExpense") {
      const parsed = z.object({
        expenseId: z.string().min(1).max(120),
        amount: z.union([z.string(), z.number()]).optional(),
        description: z.string().trim().min(2).max(300).optional(),
        paidByMemberId: z.string().min(1).max(120).optional(),
        paidFrom: z.enum(["common_fund", "member"]).optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_TRIP_EXPENSE");
      const expense = await db.prepare("SELECT * FROM trip_expenses WHERE id=?").bind(parsed.data.expenseId).first<TripExpenseRecord>();
      if (!expense) throw new ApiError(404, "EXPENSE_NOT_FOUND");
      const space = await authorizeSpace(db, user, expense.space_id, "transact", ["household", "trip", "society", "group"]);
      await assertPeriodWritable(db, expense.space_id, expense.occurred_at || expense.created_at || now());
      let amountMinor = Number(expense.amount_minor);
      if (parsed.data.amount !== undefined) {
        try { amountMinor = parseMoneyToMinor(parsed.data.amount, space.currency); } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
      }
      await rebuildTripExpenseShares(db, user.id, expense, {
        amountMinor,
        description: parsed.data.description ?? expense.description,
        paidByMemberId: parsed.data.paidByMemberId ?? expense.paid_by_member_id,
      });
    } else if (action === "resplitTripExpenses") {
      const parsed = z.object({
        spaceId: z.string().min(1).max(120),
        expenseId: z.string().min(1).max(120).optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_TRIP_EXPENSE");
      await authorizeSpace(db, user, parsed.data.spaceId, "transact", ["household", "trip", "society", "group"]);
      const expenses = parsed.data.expenseId
        ? await db.prepare("SELECT * FROM trip_expenses WHERE id=? AND space_id=?").bind(parsed.data.expenseId, parsed.data.spaceId).all<TripExpenseRecord>()
        : await db.prepare("SELECT * FROM trip_expenses WHERE space_id=? AND COALESCE(status,'posted')<>'voided' ORDER BY occurred_at").bind(parsed.data.spaceId).all<TripExpenseRecord>();
      if (!expenses.results.length) throw new ApiError(404, "EXPENSE_NOT_FOUND");
      for (const expense of expenses.results) {
        const settled = await db.prepare("SELECT COUNT(*) AS count FROM settlements WHERE expense_id=? AND status='settled'").bind(expense.id).first<{ count: number }>();
        if (Number(settled?.count ?? 0) > 0) continue;
        await rebuildTripExpenseShares(db, user.id, expense, {
          amountMinor: Number(expense.amount_minor),
          description: expense.description,
          paidByMemberId: expense.paid_by_member_id,
        });
      }
    } else if (action === "voidSettlement") {
      const parsed = z.object({ settlementId: z.string().min(1).max(120) }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_SETTLEMENT");
      const settlement = await db.prepare("SELECT id,space_id,status FROM settlements WHERE id=?").bind(parsed.data.settlementId)
        .first<{ id: string; space_id: string; status: string }>();
      if (!settlement) throw new ApiError(404, "SETTLEMENT_NOT_FOUND");
      if (settlement.status !== "pending") throw new ApiError(409, "SETTLEMENT_NOT_PENDING");
      await authorizeSpace(db, user, settlement.space_id, "settlements:write", ["household", "trip", "society", "group"]);
      await db.prepare("UPDATE settlements SET status='voided' WHERE id=? AND status='pending'").bind(settlement.id).run();
    } else if (action === "recordContributionPayment") {
      // Foundation rule: cash received = mandatory (common fund) + surplus (policy).
      const parsed = z.object({
        spaceId: z.string().min(1).max(120),
        memberId: z.string().min(1).max(120),
        amount: z.union([z.string(), z.number()]),
        description: z.string().trim().min(2).max(300).optional(),
        extraPolicy: z.enum(["personal_reserve", "voluntary_to_fund", "advance_credit"]).optional(),
        selectedIds: z.array(z.string().min(1).max(160)).max(120).optional(),
        occurredAt: z.iso.datetime().optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_CONTRIBUTION_PAYMENT");
      const space = await authorizeSpace(db, user, parsed.data.spaceId, "transact", ["household", "trip", "society", "group"]);
      await guardOwnerTransactionQuota(db, space.owner_user_id, 2);
      const member = await db.prepare("SELECT id,space_id,display_name,due_minor,paid_minor,extra_minor FROM members WHERE id=? AND space_id=? AND status='active'")
        .bind(parsed.data.memberId, parsed.data.spaceId)
        .first<{ id: string; space_id: string; display_name: string; due_minor: number; paid_minor: number; extra_minor: number }>();
      if (!member) throw new ApiError(400, "INVALID_MEMBER");
      const plan = await db.prepare("SELECT amount_minor,extra_policy,duration_months,starts_at FROM contribution_plans WHERE space_id=? ORDER BY starts_at LIMIT 1")
        .bind(parsed.data.spaceId)
        .first<{ amount_minor: number; extra_policy: string; duration_months: number; starts_at: string }>();
      if (!plan) throw new ApiError(400, "CONTRIBUTION_PLAN_REQUIRED");
      let amountMinor: number;
      try { amountMinor = parseMoneyToMinor(parsed.data.amount, space.currency); } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
      const remainingDueMinor = Math.max(0, Number(member.due_minor) - Number(member.paid_minor));
      // Rule: cover outstanding claims first; any remainder defaults to advance (مقدم).
      const policy = (parsed.data.extraPolicy ?? "advance_credit") as ExtraPolicy;
      if (!["personal_reserve", "voluntary_to_fund", "advance_credit"].includes(policy)) throw new ApiError(400, "INVALID_EXTRA_POLICY");
      let split;
      try {
        split = splitContributionPayment(amountMinor, Number(plan.amount_minor), {
          remainingDueMinor,
          extraPolicy: policy,
        });
      } catch {
        throw new ApiError(400, "INVALID_CONTRIBUTION_SPLIT");
      }
      const createdAt = now();
      const occurredAt = parsed.data.occurredAt ?? createdAt;
      const baseDescription = parsed.data.description?.trim()
        || `مساهمة ${member.display_name}`;
      const statements: D1PreparedStatement[] = [];
      if (split.mandatoryMinor > 0) {
        const installmentWork = await paymentInstallmentStatements(db, member, plan, split.mandatoryMinor, createdAt, parsed.data.selectedIds);
        statements.push(...installmentWork.statements);
        const transactionId = crypto.randomUUID();
        const entryId = crypto.randomUUID();
        const months = installmentWork.allocated.allocations.map((item) => item.periodKey).join(", ");
        const description = `${baseDescription} · سداد ${months || "مطالبة"}`;
        statements.push(
          db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,'mandatory',?,?,?,'approved',?,?)")
            .bind(transactionId, parsed.data.spaceId, user.id, member.id, "contribution", split.mandatoryMinor, description, description, occurredAt, createdAt),
          db.prepare("UPDATE spaces SET balance_minor = balance_minor + ? WHERE id = ?").bind(split.mandatoryMinor, parsed.data.spaceId),
          db.prepare("UPDATE members SET paid_minor = paid_minor + ? WHERE id = ? AND space_id = ?").bind(split.mandatoryMinor, member.id, parsed.data.spaceId),
          db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
            .bind(entryId, parsed.data.spaceId, transactionId, user.id, description, occurredAt, createdAt),
          db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), entryId, "asset:cash", member.id, split.mandatoryMinor, 0, createdAt),
          db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), entryId, "income:contribution", member.id, 0, split.mandatoryMinor, createdAt),
        );
      }
      if (split.surplusMinor > 0 && policy === "personal_reserve") {
        const transactionId = crypto.randomUUID();
        const entryId = crypto.randomUUID();
        const description = `${baseDescription} · فائض شخصي`;
        statements.push(
          db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,'personal_reserve',?,?,?,'approved',?,?)")
            .bind(transactionId, parsed.data.spaceId, user.id, member.id, "contribution", split.surplusMinor, description, description, occurredAt, createdAt),
          db.prepare("UPDATE members SET extra_minor = extra_minor + ? WHERE id = ? AND space_id = ?").bind(split.surplusMinor, member.id, parsed.data.spaceId),
          db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
            .bind(entryId, parsed.data.spaceId, transactionId, user.id, description, occurredAt, createdAt),
          db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), entryId, "asset:cash", member.id, split.surplusMinor, 0, createdAt),
          db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), entryId, "liability:member_reserve", member.id, 0, split.surplusMinor, createdAt),
        );
      } else if (split.surplusMinor > 0 && policy === "voluntary_to_fund") {
        const transactionId = crypto.randomUUID();
        const entryId = crypto.randomUUID();
        const description = `${baseDescription} · تطوع للصندوق`;
        statements.push(
          db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,'voluntary',?,?,?,'approved',?,?)")
            .bind(transactionId, parsed.data.spaceId, user.id, member.id, "contribution", split.surplusMinor, description, description, occurredAt, createdAt),
          db.prepare("UPDATE spaces SET balance_minor = balance_minor + ? WHERE id = ?").bind(split.surplusMinor, parsed.data.spaceId),
          db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
            .bind(entryId, parsed.data.spaceId, transactionId, user.id, description, occurredAt, createdAt),
          db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), entryId, "asset:cash", member.id, split.surplusMinor, 0, createdAt),
          db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), entryId, "income:voluntary", member.id, 0, split.surplusMinor, createdAt),
        );
      } else if (split.surplusMinor > 0 && policy === "advance_credit") {
        const transactionId = crypto.randomUUID();
        const entryId = crypto.randomUUID();
        const description = `${baseDescription} · مقدّم`;
        statements.push(
          db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,'advance',?,?,?,'approved',?,?)")
            .bind(transactionId, parsed.data.spaceId, user.id, member.id, "contribution", split.surplusMinor, description, description, occurredAt, createdAt),
          db.prepare("UPDATE spaces SET balance_minor = balance_minor + ? WHERE id = ?").bind(split.surplusMinor, parsed.data.spaceId),
          db.prepare("UPDATE members SET paid_minor = paid_minor + ? WHERE id = ? AND space_id = ?").bind(split.surplusMinor, member.id, parsed.data.spaceId),
          db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
            .bind(entryId, parsed.data.spaceId, transactionId, user.id, description, occurredAt, createdAt),
          db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), entryId, "asset:cash", member.id, split.surplusMinor, 0, createdAt),
          db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), entryId, "liability:advance", member.id, 0, split.surplusMinor, createdAt),
        );
      }
      statements.push(prepareAudit(db, {
        userId: user.id,
        action: "contribution.payment_split",
        entityType: "member",
        entityId: member.id,
        metadata: {
          spaceId: parsed.data.spaceId,
          receivedMinor: split.receivedMinor,
          mandatoryMinor: split.mandatoryMinor,
          surplusMinor: split.surplusMinor,
          extraPolicy: policy,
        },
        createdAt,
      }));
      if (!statements.length) throw new ApiError(400, "EMPTY_CONTRIBUTION");
      await db.batch(statements);
    } else if (action === "withdrawSurplus") {
      const parsed = z.object({
        spaceId: z.string().min(1).max(120),
        memberId: z.string().min(1).max(120),
        amount: z.union([z.string(), z.number()]),
        description: z.string().trim().min(2).max(300).optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_SURPLUS_WITHDRAWAL");
      const space = await authorizeSpace(db, user, parsed.data.spaceId, "settlements:write", ["household", "trip", "society", "group"]);
      await guardOwnerTransactionQuota(db, space.owner_user_id, 1);
      const member = await db.prepare("SELECT id,display_name,extra_minor FROM members WHERE id=? AND space_id=? AND status='active'")
        .bind(parsed.data.memberId, parsed.data.spaceId)
        .first<{ id: string; display_name: string; extra_minor: number }>();
      if (!member) throw new ApiError(400, "INVALID_MEMBER");
      let amountMinor: number;
      try { amountMinor = parseMoneyToMinor(parsed.data.amount, space.currency); } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
      if (Number(member.extra_minor) < amountMinor) throw new ApiError(409, "INSUFFICIENT_PERSONAL_RESERVE");
      const transactionId = crypto.randomUUID();
      const entryId = crypto.randomUUID();
      const createdAt = now();
      const description = parsed.data.description?.trim() || `استرداد فائض · ${member.display_name}`;
      await db.batch([
        db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,'personal_reserve',?,?,?,'approved',?,?)")
          .bind(transactionId, parsed.data.spaceId, user.id, member.id, "reimbursement", amountMinor, description, description, createdAt, createdAt),
        db.prepare("UPDATE members SET extra_minor = extra_minor - ? WHERE id = ? AND space_id = ?").bind(amountMinor, member.id, parsed.data.spaceId),
        db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
          .bind(entryId, parsed.data.spaceId, transactionId, user.id, description, createdAt, createdAt),
        db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), entryId, "liability:member_reserve", member.id, amountMinor, 0, createdAt),
        db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), entryId, "asset:cash", member.id, 0, amountMinor, createdAt),
        prepareAudit(db, {
          userId: user.id,
          action: "surplus.withdrawn",
          entityType: "member",
          entityId: member.id,
          metadata: { spaceId: parsed.data.spaceId, amountMinor },
          createdAt,
        }),
      ]);
    } else if (action === "smartPay") {
      const parsed = z.object({
        spaceId: z.string().min(1).max(120),
        memberId: z.string().min(1).max(120),
        amount: z.union([z.string(), z.number()]),
        selectedIds: z.array(z.string().min(1).max(160)).max(120).optional(),
        description: z.string().trim().max(300).optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_SMART_PAY");
      const space = await authorizeSpace(db, user, parsed.data.spaceId, "transact", ["household", "trip", "society", "group"]);
      await guardOwnerTransactionQuota(db, space.owner_user_id, 2);
      const member = await db.prepare("SELECT id,space_id,display_name,due_minor,paid_minor,extra_minor FROM members WHERE id=? AND space_id=? AND status='active'")
        .bind(parsed.data.memberId, parsed.data.spaceId)
        .first<{ id: string; space_id: string; display_name: string; due_minor: number; paid_minor: number; extra_minor: number }>();
      if (!member) throw new ApiError(400, "INVALID_MEMBER");
      let amountMinor: number;
      try { amountMinor = parseMoneyToMinor(parsed.data.amount, space.currency); } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
      const plan = await db.prepare("SELECT amount_minor,duration_months,starts_at FROM contribution_plans WHERE space_id=? ORDER BY starts_at LIMIT 1")
        .bind(parsed.data.spaceId)
        .first<{ amount_minor: number; duration_months: number; starts_at: string }>();
      const remainingDueMinor = Math.max(0, Number(member.due_minor) - Number(member.paid_minor));
      let split;
      try {
        split = splitContributionPayment(amountMinor, Number(plan?.amount_minor ?? remainingDueMinor), { remainingDueMinor, extraPolicy: "advance_credit" });
      } catch {
        throw new ApiError(400, "INVALID_CONTRIBUTION_SPLIT");
      }
      const createdAt = now();
      const description = parsed.data.description?.trim() || `محاسب ذكي · ${member.display_name}`;
      const statements: D1PreparedStatement[] = [];
      let lastTransactionId = "";
      if (split.mandatoryMinor > 0) {
        const installmentWork = await paymentInstallmentStatements(db, member, plan, split.mandatoryMinor, createdAt, parsed.data.selectedIds);
        const applied = installmentWork.allocated.appliedMinor || split.mandatoryMinor;
        const transactionId = crypto.randomUUID();
        lastTransactionId = transactionId;
        const entryId = crypto.randomUUID();
        const months = installmentWork.allocated.allocations.map((item) => item.periodKey).join(", ");
        const lineDescription = `${description} · سداد ${months || "مطالبات"}`;
        statements.push(
          ...installmentWork.statements,
          db.prepare("INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)")
            .bind(transactionId, parsed.data.spaceId, user.id, member.id, "contribution", "mandatory", applied, lineDescription, lineDescription, createdAt, createdAt),
          db.prepare("UPDATE spaces SET balance_minor = balance_minor + ? WHERE id = ?").bind(applied, parsed.data.spaceId),
          db.prepare("UPDATE members SET paid_minor = paid_minor + ? WHERE id = ? AND space_id = ?").bind(applied, member.id, parsed.data.spaceId),
          db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
            .bind(entryId, parsed.data.spaceId, transactionId, user.id, lineDescription, createdAt, createdAt),
          db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), entryId, "asset:cash", member.id, applied, 0, createdAt),
          db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), entryId, "income:contribution", member.id, 0, applied, createdAt),
        );
      }
      if (split.surplusMinor > 0) {
        const transactionId = crypto.randomUUID();
        lastTransactionId = lastTransactionId || transactionId;
        const entryId = crypto.randomUUID();
        const lineDescription = `${description} · مقدّم`;
        statements.push(
          db.prepare("INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)")
            .bind(transactionId, parsed.data.spaceId, user.id, member.id, "contribution", "advance", split.surplusMinor, lineDescription, lineDescription, createdAt, createdAt),
          db.prepare("UPDATE spaces SET balance_minor = balance_minor + ? WHERE id = ?").bind(split.surplusMinor, parsed.data.spaceId),
          db.prepare("UPDATE members SET extra_minor = extra_minor + ? WHERE id = ? AND space_id = ?").bind(split.surplusMinor, member.id, parsed.data.spaceId),
          db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
            .bind(entryId, parsed.data.spaceId, transactionId, user.id, lineDescription, createdAt, createdAt),
          db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), entryId, "asset:cash", member.id, split.surplusMinor, 0, createdAt),
          db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), entryId, "liability:advance", member.id, 0, split.surplusMinor, createdAt),
        );
      }
      if (!statements.length) throw new ApiError(400, "EMPTY_PAYMENT");
      statements.push(prepareAudit(db, { userId: user.id, action: "smart_pay.applied", entityType: "member", entityId: member.id, metadata: { spaceId: parsed.data.spaceId, amountMinor, lastTransactionId }, createdAt }));
      await db.batch(statements);
    } else if (action === "closeAccountingPeriod") {
      const parsed = z.object({ spaceId: z.string().min(1).max(120), label: z.string().trim().min(2).max(80).optional() }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_PERIOD");
      await authorizeSpace(db, user, parsed.data.spaceId, "transact", ["household", "trip", "society", "group"]);
      await assertMembersSettledForClose(db, parsed.data.spaceId);
      const createdAt = now();
      const open = await db.prepare("SELECT id,status FROM accounting_periods WHERE space_id=? AND status IN ('open','reopened') ORDER BY starts_at DESC LIMIT 1").bind(parsed.data.spaceId).first<{ id: string; status: string }>();
      let periodId = open?.id;
      if (open) {
        await db.prepare("UPDATE accounting_periods SET status='closed', ends_at=?, closed_at=?, closed_by=?, label=COALESCE(NULLIF(?,''), label) WHERE id=?")
          .bind(createdAt, createdAt, user.id, parsed.data.label ?? "", open.id).run();
      } else {
        periodId = crypto.randomUUID();
        const space = await db.prepare("SELECT name_ar,starts_at,created_at FROM spaces WHERE id=?").bind(parsed.data.spaceId).first<{ name_ar: string; starts_at?: string; created_at: string }>();
        await db.prepare("INSERT INTO accounting_periods (id,space_id,label,starts_at,ends_at,status,closed_at,created_at,closed_by) VALUES (?,?,?,?,?,'closed',?,?,?)")
          .bind(periodId, parsed.data.spaceId, parsed.data.label || `${space?.name_ar ?? "فترة"} · إغلاق`, space?.starts_at || space?.created_at || createdAt, createdAt, createdAt, createdAt, user.id).run();
      }
      await db.batch([
        prepareAudit(db, { userId: user.id, action: "period.closed", entityType: "accounting_period", entityId: periodId ?? parsed.data.spaceId, metadata: { spaceId: parsed.data.spaceId, previousStatus: open?.status ?? "none" }, createdAt }),
        preparePeriodLedgerEvent(db, {
          spaceId: parsed.data.spaceId,
          periodId,
          userId: user.id,
          actorName: user.displayName,
          action: "period.closed",
          entityType: "accounting_period",
          entityId: periodId,
          summaryAr: `${user.displayName} أغلق الفترة المحاسبية`,
          summaryEn: `${user.displayName} closed the accounting period`,
          createdAt,
        }),
      ]);
    } else if (action === "reopenAccountingPeriod") {
      const parsed = z.object({ spaceId: z.string().min(1).max(120), periodId: z.string().min(1).max(120), reason: z.string().trim().max(300).optional() }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_PERIOD");
      await authorizeSpace(db, user, parsed.data.spaceId, "transact", ["household", "trip", "society", "group"]);
      const period = await db.prepare("SELECT id,status,label FROM accounting_periods WHERE id=? AND space_id=?").bind(parsed.data.periodId, parsed.data.spaceId).first<{ id: string; status: string; label: string }>();
      if (!period) throw new ApiError(404, "PERIOD_NOT_FOUND");
      if (period.status !== "closed") throw new ApiError(409, "PERIOD_NOT_CLOSED");
      const createdAt = now();
      await db.prepare("UPDATE accounting_periods SET status='reopened', reopened_at=?, reopened_by=?, reopen_count=COALESCE(reopen_count,0)+1 WHERE id=?")
        .bind(createdAt, user.id, period.id).run();
      await db.batch([
        prepareAudit(db, { userId: user.id, action: "period.reopened", entityType: "accounting_period", entityId: period.id, metadata: { spaceId: parsed.data.spaceId, reason: parsed.data.reason ?? "", label: period.label }, createdAt }),
        preparePeriodLedgerEvent(db, {
          spaceId: parsed.data.spaceId,
          periodId: period.id,
          userId: user.id,
          actorName: user.displayName,
          action: "period.reopened",
          entityType: "accounting_period",
          entityId: period.id,
          summaryAr: `${user.displayName} أعاد فتح الفترة للتعديل${parsed.data.reason ? ` — ${parsed.data.reason}` : ""}`,
          summaryEn: `${user.displayName} reopened the period for corrections${parsed.data.reason ? ` — ${parsed.data.reason}` : ""}`,
          metadata: { reason: parsed.data.reason ?? "" },
          createdAt,
        }),
      ]);
    } else if (action === "consumeQuota") {
      const parsed = z.object({
        kind: z.enum(["print", "download"]),
        spaceId: z.string().min(1).max(120).optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_QUOTA");
      let ownerUserId = user.id;
      if (parsed.data.spaceId) {
        const space = await authorizeSpace(db, user, parsed.data.spaceId, "read");
        ownerUserId = space.owner_user_id;
      }
      const { consumeQuotaEvent, getActivePlanEntitlements } = await import("../../../services/admin/billing-service");
      let entitlements;
      try {
        entitlements = await consumeQuotaEvent(db, ownerUserId, parsed.data.kind, user.id);
      } catch (error) {
        if (error instanceof ApiError) throw error;
        console.error(JSON.stringify({
          level: "error",
          code: "QUOTA_CONSUME_FAILED",
          message: error instanceof Error ? error.message : String(error),
          at: new Date().toISOString(),
        }));
        entitlements = await getActivePlanEntitlements(db, user.id);
      }
      await completeIdempotency(db, user.id, idempotencyKey, { ok: true });
      claimed = null;
      return Response.json({ ok: true, entitlements }, { headers: { "Cache-Control": "no-store" } });
    } else if (action === "sendReceipt") {
      const parsed = z.object({
        memberId: z.string().min(1).max(120),
        transactionId: z.string().min(1).max(120).optional(),
        channel: z.enum(["email", "whatsapp", "both"]),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_RECEIPT");
      const member = await db.prepare("SELECT * FROM members WHERE id=? AND status='active'").bind(parsed.data.memberId).first<MemberRow>();
      if (!member) throw new ApiError(404, "MEMBER_NOT_FOUND");
      const spaceAuth = await authorizeSpace(db, user, member.space_id, "read");
      const { assertPlanShareFeature } = await import("../../../services/admin/billing-service");
      if (parsed.data.channel === "email" || parsed.data.channel === "both") {
        await assertPlanShareFeature(db, spaceAuth.owner_user_id, "email", user.id);
      }
      if (parsed.data.channel === "whatsapp" || parsed.data.channel === "both") {
        await assertPlanShareFeature(db, spaceAuth.owner_user_id, "whatsapp", user.id);
      }
      const txn = parsed.data.transactionId
        ? await db.prepare("SELECT * FROM transactions WHERE id=? AND member_id=?").bind(parsed.data.transactionId, member.id).first<TransactionRow>()
        : await db.prepare("SELECT * FROM transactions WHERE member_id=? AND status<>'voided' ORDER BY occurred_at DESC LIMIT 1").bind(member.id).first<TransactionRow>();
      if (!txn) throw new ApiError(404, "RECEIPT_NOT_FOUND");
      const space = await db.prepare("SELECT name_ar,name_en,currency FROM spaces WHERE id=?").bind(member.space_id).first<{ name_ar: string; name_en: string; currency: string }>();
      const createdAt = now();
      const message = `إيصال وازن\nالمساهم: ${member.display_name}\nالجمعية: ${space?.name_ar ?? ""}\nالمبلغ: ${(txn.amount_minor / 1000).toFixed(3)} ${space?.currency ?? "OMR"}\nالبيان: ${txn.description_ar}\nالمرجع: ${txn.id.slice(0, 8).toUpperCase()}`;
      if (parsed.data.channel === "email" || parsed.data.channel === "both") {
        if (!member.email) throw new ApiError(400, "MEMBER_EMAIL_MISSING");
        await db.prepare("INSERT INTO email_outbox (id,recipient,template,payload_json,status,created_at) VALUES (?,?,?,?,'pending',?)")
          .bind(crypto.randomUUID(), member.email, "member_receipt", JSON.stringify({ displayName: member.display_name, message, html: message.replaceAll("\n", "<br/>"), transactionId: txn.id }), createdAt).run();
      }
      const whatsappNumber = member.phone ? toWhatsAppNumber(member.phone) : "";
      if ((parsed.data.channel === "whatsapp" || parsed.data.channel === "both") && !whatsappNumber) throw new ApiError(400, "MEMBER_PHONE_MISSING");
      notification = {
        emailQueued: parsed.data.channel !== "whatsapp",
        whatsappUrl: whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}` : null,
        transactionId: txn.id,
      };
    } else if (action === "updateUserProfile") {
      const parsed = z.object({
        displayName: z.string().trim().min(2).max(80),
        avatarUrl: z.string().max(400_000).nullable().optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_PROFILE");
      if (parsed.data.avatarUrl) {
        if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(parsed.data.avatarUrl)) throw new ApiError(400, "INVALID_PHOTO");
      }
      const createdAt = now();
      await db.batch([
        db.prepare("UPDATE users SET display_name=?, avatar_url=? WHERE id=?")
          .bind(parsed.data.displayName, parsed.data.avatarUrl ?? null, user.id),
        prepareAudit(db, { userId: user.id, action: "user.profile_updated", entityType: "user", entityId: user.id, metadata: { displayName: parsed.data.displayName, hasPhoto: Boolean(parsed.data.avatarUrl) }, createdAt }),
      ]);
      user.displayName = parsed.data.displayName;
      user.avatarUrl = parsed.data.avatarUrl ?? null;
    } else throw new ApiError(400, "UNSUPPORTED_ACTION");

    const freshUser = await db.prepare("SELECT display_name, avatar_url FROM users WHERE id=?").bind(user.id).first<{ display_name: string; avatar_url: string | null }>();
    const { getActivePlanEntitlements } = await import("../../../services/admin/billing-service");
    const entitlements = await getActivePlanEntitlements(db, user.id);
    let dashboard: Awaited<ReturnType<typeof loadDashboard>>;
    try {
      dashboard = await loadDashboard(db, user.id, { refreshDerived: true, features: entitlements.features });
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        code: "DASHBOARD_LOAD_FAILED",
        message: error instanceof Error ? error.message : String(error),
        at: new Date().toISOString(),
      }));
      dashboard = {
        spaces: [], members: [], transactions: [], plans: [], circleTurns: [], tripExpenses: [], expenseSplits: [],
        settlements: [], installments: [], contacts: [], periods: [], periodEvents: [], personalAccounts: [], personalRules: [],
        personalOccurrences: [], payoutAccounts: [], familyEvents: [], spaceLinks: [], spaceBankLinks: [],
      };
    }
    const role = await platformRoleOf(db, user.id);
    const response = {
      ok: true,
      user: { ...user, role, displayName: freshUser?.display_name ?? user.displayName, avatarUrl: freshUser?.avatar_url ?? user.avatarUrl ?? null },
      entitlements,
      revision: await readDashboardRevision(db, user.id),
      ...dashboard,
      ...(notification ? { notification } : {}),
    };
    await completeIdempotency(db, user.id, idempotencyKey, { ok: true });
    claimed = null;
    return Response.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (claimed) {
      try { await releaseIdempotency(claimed.db, claimed.userId, claimed.key); } catch { /* maintenance job will clean stale claims */ }
    }
    return errorResponse(error);
  }
}
