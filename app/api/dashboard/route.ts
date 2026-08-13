import { z } from "zod";
import { ensureSchema, getRawDb, type RequestUser } from "../../../db/runtime";
import { authenticateRequest, csrfCookie, issueCsrfToken } from "../../../lib/auth";
import { buildCircleOrder, minimizeSettlements, splitContributionPayment, splitEvenly, type CircleMode, type ExtraPolicy } from "../../../lib/finance";
import { ApiError, claimIdempotency, completeIdempotency, enforceCsrf, enforceWriteRequest, errorResponse, rateLimit, releaseIdempotency } from "../../../lib/security";
import { assertApiScope, authorizeSpace, ensureDefaultTenant } from "../../../lib/authorization";
import { prepareAudit } from "../../../lib/audit";
import { multiplyMinor, parseMoneyToMinor, parseNonNegativeMoneyToMinor } from "../../../lib/money";

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
  avatar: string;
  joined_at: string;
};

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
};

const now = () => new Date().toISOString();

function cleanId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
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
        ), 0)
       WHERE space_id IN (${placeholders})`,
    )
    .bind(...spaceIds)
    .run();
}

function transactionBalanceDelta(kind: string, allocation: string, amountMinor: number) {
  if (allocation === "personal_reserve") return 0;
  return ["income", "contribution"].includes(kind) ? amountMinor : -amountMinor;
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
  },
  actorUserId: string,
) {
  if (txn.status === "voided") throw new ApiError(409, "ALREADY_VOIDED");
  if (txn.status !== "approved") throw new ApiError(409, "TRANSACTION_NOT_EDITABLE");
  const amountMinor = Number(txn.amount_minor);
  const balanceDelta = -transactionBalanceDelta(txn.kind, txn.allocation, amountMinor);
  if (balanceDelta < 0) {
    const space = await db.prepare("SELECT balance_minor FROM spaces WHERE id=?").bind(txn.space_id).first<{ balance_minor: number }>();
    if (Number(space?.balance_minor ?? 0) + balanceDelta < 0) throw new ApiError(409, "INSUFFICIENT_FUNDS");
  }
  const createdAt = now();
  await db.batch([
    db.prepare("UPDATE transactions SET status='voided' WHERE id=? AND status='approved'").bind(txn.id),
    db.prepare("UPDATE spaces SET balance_minor = balance_minor + ? WHERE id = ?").bind(balanceDelta, txn.space_id),
    prepareAudit(db, {
      userId: actorUserId,
      action: "transaction.voided",
      entityType: "transaction",
      entityId: txn.id,
      metadata: { spaceId: txn.space_id, kind: txn.kind, allocation: txn.allocation, amountMinor },
      createdAt,
    }),
  ]);
  await reconcileMemberLedgers(db, [txn.space_id]);
}

async function loadDashboard(db: D1Database, userId: string) {
  const spaces = await db
    .prepare(`SELECT DISTINCT s.* FROM spaces s LEFT JOIN members m ON m.space_id=s.id AND m.status='active'
      WHERE s.owner_user_id=? OR m.user_id=? ORDER BY s.created_at ASC`)
    .bind(userId, userId)
    .all<SpaceRow>();
  const ids = spaces.results.map((space) => space.id);
  if (!ids.length) return { spaces: [], members: [], transactions: [], plans: [], circleTurns: [], tripExpenses: [], expenseSplits: [], settlements: [] };

  // Reconcile only on writes — running it on every GET made the dashboard feel slow.
  const placeholders = ids.map(() => "?").join(",");
  const members = await db
    .prepare(`SELECT * FROM members WHERE space_id IN (${placeholders}) ORDER BY joined_at ASC`)
    .bind(...ids)
    .all<MemberRow>();
  const transactions = await db
    .prepare(`SELECT * FROM transactions WHERE space_id IN (${placeholders}) AND status <> 'voided' ORDER BY occurred_at DESC LIMIT 80`)
    .bind(...ids)
    .all<TransactionRow>();
  const plans = await db
    .prepare(`SELECT * FROM contribution_plans WHERE space_id IN (${placeholders})`)
    .bind(...ids)
    .all();
  const circleTurns = await db.prepare(`SELECT ct.*,m.display_name FROM circle_turns ct JOIN members m ON m.id=ct.member_id
    WHERE ct.space_id IN (${placeholders}) ORDER BY ct.space_id,ct.turn_number`).bind(...ids).all();
  const tripExpenses = await db.prepare(`SELECT te.*,m.display_name AS paid_by_name FROM trip_expenses te JOIN members m ON m.id=te.paid_by_member_id
    WHERE te.space_id IN (${placeholders}) ORDER BY te.occurred_at DESC LIMIT 50`).bind(...ids).all();
  const expenseSplits = await db.prepare(`SELECT es.*,m.display_name FROM expense_splits es JOIN trip_expenses te ON te.id=es.expense_id
    JOIN members m ON m.id=es.member_id WHERE te.space_id IN (${placeholders}) ORDER BY es.expense_id,m.joined_at`).bind(...ids).all();
  const settlements = await db.prepare(`SELECT s.*,
      tm.display_name AS to_member_name,
      fm.display_name AS from_member_name
    FROM settlements s
    LEFT JOIN members tm ON tm.id=s.to_member_id
    LEFT JOIN members fm ON fm.id=s.from_member_id
    WHERE s.space_id IN (${placeholders}) ORDER BY s.created_at DESC LIMIT 50`).bind(...ids).all();

  return {
    spaces: spaces.results,
    members: members.results,
    transactions: transactions.results,
    plans: plans.results,
    circleTurns: circleTurns.results,
    tripExpenses: tripExpenses.results,
    expenseSplits: expenseSplits.results,
    settlements: settlements.results,
  };
}

export async function GET(request: Request) {
  try {
    const db = getRawDb();
    await ensureSchema(db);
    const user = await authenticateRequest(db, request);
    if (!user) return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    assertApiScope(user, "wallets:read");
    await ensureUser(db, user);
    const dashboard = await loadDashboard(db, user.id);
    const issued = user.authType === "session" ? await issueCsrfToken(db, request) : null;
    const headers = new Headers({ "Cache-Control": "no-store" }); if (issued) headers.append("Set-Cookie", csrfCookie(issued.csrfToken, issued.expiresAt));
    return Response.json({ user, ...dashboard }, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  let claimed: { db: D1Database; userId: string; key: string } | null = null;
  try {
    enforceWriteRequest(request);
    const db = getRawDb();
    await ensureSchema(db);
    await rateLimit(db, request, "dashboard-write", 120, 60);
    const user = await authenticateRequest(db, request);
    if (!user) return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    if (user.authType === "session") await enforceCsrf(db, request);
    await ensureUser(db, user);
    const payload = (await request.json()) as Record<string, unknown>;
    const action = String(payload.action ?? "");
    const idempotencyKey = String(payload.idempotencyKey ?? request.headers.get("idempotency-key") ?? "");
    const replay = await claimIdempotency(db, user.id, action, idempotencyKey);
    if (replay) return Response.json(replay, { headers: { "Cache-Control": "no-store" } });
    claimed = { db, userId: user.id, key: idempotencyKey };

    if (action === "addWallet") {
      assertApiScope(user, "wallets:write");
      const parsed = z.object({
        name: z.string().trim().min(2).max(80),
        type: z.enum(["personal", "household", "trip", "society", "group"]),
        goal: z.union([z.string(), z.number()]).default("0"),
        monthlyContribution: z.union([z.string(), z.number()]).optional(),
        durationMonths: z.coerce.number().int().min(1).max(120).optional(),
        dueDay: z.coerce.number().int().min(1).max(28).optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_WALLET");
      const { name, type } = parsed.data;
      const { getActivePlanEntitlements, planAllowsSpaceType } = await import("../../../services/admin/billing-service");
      const entitlements = await getActivePlanEntitlements(db, user.id);
      if (!planAllowsSpaceType(entitlements.features, type)) throw new ApiError(403, "PLAN_FEATURE_REQUIRED");
      const count = await db.prepare("SELECT COUNT(*) AS count FROM spaces WHERE owner_user_id=?").bind(user.id).first<{ count: number }>();
      if (Number(count?.count ?? 0) >= entitlements.walletLimit) throw new ApiError(403, "PLAN_WALLET_LIMIT");
      const id = `${cleanId(user.id)}-${crypto.randomUUID()}`; const createdAt = now();
      const profile = await db.prepare("SELECT currency FROM users WHERE id=?").bind(user.id).first<{ currency: string }>(); const currency = profile?.currency ?? "OMR";
      let goalMinor: number; try { goalMinor = parseNonNegativeMoneyToMinor(parsed.data.goal, currency); } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
      const tenantId = await ensureDefaultTenant(db, user);
      const statements: D1PreparedStatement[] = [
        db.prepare("INSERT INTO spaces (id,owner_user_id,name_ar,name_en,type,currency,balance_minor,goal_minor,accent,created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'emerald', ?)").bind(id, user.id, name, name, type, currency, goalMinor, createdAt),
        db.prepare("INSERT INTO tenant_resources (tenant_id,resource_type,resource_id,created_at) VALUES (?,'space',?,?)").bind(tenantId, id, createdAt),
        prepareAudit(db, { userId: user.id, action: "wallet.created", entityType: "space", entityId: id, metadata: { type, currency }, createdAt }),
      ];
      const isGroup = ["household", "trip", "society", "group"].includes(type);
      if (isGroup && parsed.data.monthlyContribution !== undefined && parsed.data.monthlyContribution !== "") {
        let contributionMinor: number;
        try { contributionMinor = parseMoneyToMinor(parsed.data.monthlyContribution, currency); } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
        const durationMonths = parsed.data.durationMonths ?? 12;
        const dueDay = parsed.data.dueDay ?? 1;
        statements.push(
          db.prepare(`INSERT INTO contribution_plans (id,space_id,amount_minor,interval,due_day,extra_policy,duration_months,starts_at)
            VALUES (?, ?, ?, 'monthly', ?, 'personal_reserve', ?, ?)`)
            .bind(`${id}-plan`, id, contributionMinor, dueDay, durationMonths, createdAt),
        );
      }
      await db.batch(statements);
    } else if (action === "addMember") {
      const parsed = z.object({ spaceId: z.string().min(1).max(120), displayName: z.string().trim().min(2).max(80), email: z.union([z.email().max(254), z.literal("")]).optional(), role: z.enum(["member", "treasurer", "manager", "auditor", "viewer"]).default("member") }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_MEMBER");
      await authorizeSpace(db, user, parsed.data.spaceId, "members:write", ["household", "trip", "society", "group"]);
      const { getActivePlanEntitlements } = await import("../../../services/admin/billing-service");
      const entitlements = await getActivePlanEntitlements(db, user.id);
      const count = await db.prepare("SELECT COUNT(*) AS count FROM members WHERE space_id=? AND status='active'").bind(parsed.data.spaceId).first<{ count: number }>();
      if (Number(count?.count ?? 0) >= entitlements.memberLimit) throw new ApiError(403, "PLAN_MEMBER_LIMIT");
      const contribution = await db.prepare("SELECT amount_minor,duration_months FROM contribution_plans WHERE space_id=? LIMIT 1").bind(parsed.data.spaceId).first<{ amount_minor: number; duration_months: number }>();
      const memberId = crypto.randomUUID(); const createdAt = now(); const dueMinor = multiplyMinor(Number(contribution?.amount_minor ?? 0), Number(contribution?.duration_months ?? 0));
      await db.batch([
        db.prepare("INSERT INTO members (id,space_id,user_id,display_name,email,role,status,due_minor,paid_minor,extra_minor,avatar,joined_at) VALUES (?,?,NULL,?,?,?,'active',?,0,0,'#0f766e',?)").bind(memberId, parsed.data.spaceId, parsed.data.displayName, parsed.data.email || null, parsed.data.role, dueMinor, createdAt),
        prepareAudit(db, { userId: user.id, action: "member.created", entityType: "member", entityId: memberId, metadata: { spaceId: parsed.data.spaceId, role: parsed.data.role }, createdAt }),
      ]);
    } else if (action === "addTransaction") {
      const parsed = z.object({ spaceId: z.string().min(1).max(120), kind: z.enum(["expense", "income", "contribution", "reimbursement"]), allocation: z.enum(["general", "mandatory", "personal_reserve"]), description: z.string().trim().min(2).max(300), amount: z.union([z.string(),z.number()]), memberId: z.string().max(120).optional(), occurredAt: z.iso.datetime().optional() }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_TRANSACTION");
      const { spaceId, allocation, description } = parsed.data;
      let kind = parsed.data.kind;
      const space = await authorizeSpace(db, user, spaceId, "transact"); const memberId = parsed.data.memberId ?? null;
      // Group payments linked to a member count as contributions toward dues (not plain income).
      if (memberId && kind === "income" && ["household", "trip", "society", "group"].includes(space.type)) {
        kind = "contribution";
      }
      if (kind === "contribution" && !memberId && ["household", "trip", "society", "group"].includes(space.type)) {
        throw new ApiError(400, "MEMBER_REQUIRED");
      }
      let amountMinor: number; try { amountMinor = parseMoneyToMinor(parsed.data.amount, space.currency); } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
      const member = memberId ? await db.prepare("SELECT id,extra_minor,due_minor,paid_minor FROM members WHERE id=? AND space_id=? AND status='active'").bind(memberId, spaceId).first<{ id: string; extra_minor: number; due_minor: number; paid_minor: number }>() : null;
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
        const plan = await db.prepare("SELECT amount_minor FROM contribution_plans WHERE space_id=? ORDER BY starts_at LIMIT 1")
          .bind(spaceId)
          .first<{ amount_minor: number }>();
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
        await db.batch(statements);
        await reconcileMemberLedgers(db, [spaceId]);
      } else {
      const positiveKinds = ["income", "contribution"];
      const balanceDelta = allocation === "personal_reserve"
        ? 0
        : (positiveKinds.includes(kind) ? amountMinor : -amountMinor);
      if (balanceDelta < 0 && Number(space.balance_minor) + balanceDelta < 0) throw new ApiError(409, "INSUFFICIENT_FUNDS");
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
      await db.batch(statements);
      await reconcileMemberLedgers(db, [spaceId]);
      }
    } else if (action === "voidTransaction") {
      const parsed = z.object({ transactionId: z.string().min(1).max(120) }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_TRANSACTION");
      const txn = await db.prepare("SELECT * FROM transactions WHERE id=?").bind(parsed.data.transactionId).first<TransactionRow>();
      if (!txn) throw new ApiError(404, "TRANSACTION_NOT_FOUND");
      await authorizeSpace(db, user, txn.space_id, "transact");
      await voidApprovedTransaction(db, txn, user.id);
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
      await voidApprovedTransaction(db, existing, user.id);

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
      if (balanceDelta < 0 && Number(refreshed?.balance_minor ?? 0) + balanceDelta < 0) throw new ApiError(409, "INSUFFICIENT_FUNDS");
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
      ]);
      await reconcileMemberLedgers(db, [existing.space_id]);
    } else if (action === "completeCircleTurn") {
      const parsed = z.object({ turnId: z.string().min(1).max(120) }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_CIRCLE_TURN");
      const turn = await db.prepare(`SELECT ct.id,ct.space_id,ct.member_id,ct.turn_number,ct.amount_minor,s.balance_minor,m.display_name
        FROM circle_turns ct JOIN spaces s ON s.id=ct.space_id JOIN members m ON m.id=ct.member_id
        WHERE ct.id=? AND ct.status='scheduled' AND ct.turn_number=(SELECT MIN(turn_number) FROM circle_turns WHERE space_id=ct.space_id AND status='scheduled')`)
        .bind(parsed.data.turnId).first<{ id: string; space_id: string; member_id: string; turn_number: number; amount_minor: number; balance_minor: number; display_name: string }>();
      if (!turn) throw new ApiError(409, "TURN_NOT_CURRENT");
      await authorizeSpace(db, user, turn.space_id, "circle:write", ["society", "group"]);
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
      const settlement = await db.prepare(`SELECT st.id,st.space_id,st.from_member_id,st.to_member_id,st.amount_minor,s.balance_minor FROM settlements st
        JOIN spaces s ON s.id=st.space_id WHERE st.id=? AND st.status='pending'`).bind(parsed.data.settlementId).first<{ id: string; space_id: string; from_member_id: string; to_member_id: string; amount_minor: number; balance_minor: number }>();
      if (!settlement) throw new ApiError(404, "SETTLEMENT_NOT_FOUND");
      await authorizeSpace(db, user, settlement.space_id, "settlements:write", ["household", "trip", "society", "group"]);
      const fromFund = String(settlement.from_member_id).startsWith("space:");
      const toFund = String(settlement.to_member_id).startsWith("space:");
      const entryId = crypto.randomUUID(); const createdAt = now();
      if (toFund) {
        await db.batch([
          db.prepare("UPDATE settlements SET status='settled',settled_at=? WHERE id=? AND status='pending'").bind(createdAt, settlement.id),
          prepareAudit(db, { userId: user.id, action: "expense.share_acknowledged", entityType: "settlement", entityId: settlement.id, metadata: { amountMinor: settlement.amount_minor }, createdAt }),
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
        // Member-to-member settlement recorded as settled without moving the common fund.
        await db.batch([
          db.prepare("UPDATE settlements SET status='settled',settled_at=? WHERE id=? AND status='pending'").bind(createdAt, settlement.id),
          prepareAudit(db, { userId: user.id, action: "member.settlement_recorded", entityType: "settlement", entityId: settlement.id, metadata: { fromMemberId: settlement.from_member_id, toMemberId: settlement.to_member_id, amountMinor: settlement.amount_minor }, createdAt }),
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
      const members = await db.prepare("SELECT id FROM members WHERE space_id=? AND status='active' ORDER BY joined_at").bind(parsed.data.spaceId).all<{ id: string }>();
      if (!members.results.length) throw new ApiError(400, "NO_ACTIVE_MEMBERS");
      let amountMinor: number;
      try { amountMinor = parseMoneyToMinor(parsed.data.amount, space.currency); } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
      const paidFrom = parsed.data.paidFrom;
      const paidByMemberId = paidFrom === "member"
        ? parsed.data.paidByMemberId
        : (parsed.data.paidByMemberId ?? members.results[0]?.id);
      if (!paidByMemberId || !members.results.some((member) => member.id === paidByMemberId)) {
        throw new ApiError(400, "INVALID_PAYER");
      }
      if (paidFrom === "common_fund" && Number(space.balance_minor) < amountMinor) {
        throw new ApiError(409, "INSUFFICIENT_FUNDS");
      }
      const splits = splitEvenly(amountMinor, members.results.map((member) => member.id));
      const expenseId = crypto.randomUUID();
      const transactionId = crypto.randomUUID();
      const entryId = crypto.randomUUID();
      const createdAt = now();
      const occurredAt = parsed.data.occurredAt ?? createdAt;
      const statements: D1PreparedStatement[] = [
        db.prepare("INSERT INTO trip_expenses (id,space_id,paid_by_member_id,amount_minor,description,occurred_at,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)")
          .bind(expenseId, parsed.data.spaceId, paidByMemberId, amountMinor, parsed.data.description, occurredAt, user.id, createdAt),
      ];
      if (paidFrom === "common_fund") {
        // Paid from group wallet: reduce common fund. Splits remain for له/عليه reporting only.
        statements.push(
          db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,'general',?,?,?,'approved',?,?)")
            .bind(transactionId, parsed.data.spaceId, user.id, paidByMemberId, "expense", amountMinor, parsed.data.description, parsed.data.description, occurredAt, createdAt),
          db.prepare("UPDATE spaces SET balance_minor = balance_minor - ? WHERE id = ?").bind(amountMinor, parsed.data.spaceId),
          db.prepare("INSERT INTO journal_entries (id,space_id,transaction_id,created_by,description,status,occurred_at,created_at) VALUES (?,?,?,?,?,'posted',?,?)")
            .bind(entryId, parsed.data.spaceId, transactionId, user.id, parsed.data.description, occurredAt, createdAt),
          db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), entryId, "expense:group", paidByMemberId, amountMinor, 0, createdAt),
          db.prepare("INSERT INTO journal_lines (id,entry_id,account_code,member_id,debit_minor,credit_minor,created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), entryId, "asset:cash", paidByMemberId, 0, amountMinor, createdAt),
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
            db.prepare("INSERT INTO settlements (id,space_id,from_member_id,to_member_id,amount_minor,status,created_at) VALUES (?,?,?,?,?,'pending',?)")
              .bind(crypto.randomUUID(), parsed.data.spaceId, settlement.fromMemberId, settlement.toMemberId, settlement.amountMinor, createdAt),
          );
        });
      }
      splits.forEach((split) => statements.push(db.prepare("INSERT INTO expense_splits (id,expense_id,member_id,share_minor) VALUES (?,?,?,?)").bind(crypto.randomUUID(), expenseId, split.memberId, split.shareMinor)));
      statements.push(prepareAudit(db, {
        userId: user.id,
        action: "trip.expense_split",
        entityType: "trip_expense",
        entityId: expenseId,
        metadata: { amountMinor, paidFrom, paidByMemberId, splits },
        createdAt,
      }));
      await db.batch(statements);
    } else if (action === "recordContributionPayment") {
      // Foundation rule: cash received = mandatory (common fund) + surplus (policy).
      const parsed = z.object({
        spaceId: z.string().min(1).max(120),
        memberId: z.string().min(1).max(120),
        amount: z.union([z.string(), z.number()]),
        description: z.string().trim().min(2).max(300).optional(),
        extraPolicy: z.enum(["personal_reserve", "voluntary_to_fund", "advance_credit"]).optional(),
        occurredAt: z.iso.datetime().optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_CONTRIBUTION_PAYMENT");
      const space = await authorizeSpace(db, user, parsed.data.spaceId, "transact", ["household", "trip", "society", "group"]);
      const member = await db.prepare("SELECT id,display_name,due_minor,paid_minor,extra_minor FROM members WHERE id=? AND space_id=? AND status='active'")
        .bind(parsed.data.memberId, parsed.data.spaceId)
        .first<{ id: string; display_name: string; due_minor: number; paid_minor: number; extra_minor: number }>();
      if (!member) throw new ApiError(400, "INVALID_MEMBER");
      const plan = await db.prepare("SELECT amount_minor,extra_policy FROM contribution_plans WHERE space_id=? ORDER BY starts_at LIMIT 1")
        .bind(parsed.data.spaceId)
        .first<{ amount_minor: number; extra_policy: string }>();
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
        const transactionId = crypto.randomUUID();
        const entryId = crypto.randomUUID();
        const description = `${baseDescription} · سداد مطالبة`;
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
    } else throw new ApiError(400, "UNSUPPORTED_ACTION");

    const response = { ok: true, ...(await loadDashboard(db, user.id)) };
    await completeIdempotency(db, user.id, idempotencyKey, response);
    claimed = null;
    return Response.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (claimed) {
      try { await releaseIdempotency(claimed.db, claimed.userId, claimed.key); } catch { /* maintenance job will clean stale claims */ }
    }
    return errorResponse(error);
  }
}
