/** Platform payment gateways + plan admin helpers. */

import {
  parsePlanFeatures,
  planHasFeature,
  quotaNearLimit,
  quotaWouldExceed,
  resolveEntitlements,
} from "../../lib/plan-features";
import { ApiError } from "../../lib/api-error";

export { parsePlanFeatures, planAllowsSpaceType, planHasFeature, filterSpacesByPlan, PLAN_FEATURE_KEYS, PLAN_FEATURE_CATALOG } from "../../lib/plan-features";
export { filterSpacesForPlanAccess, USER_GRACE_DAYS, ADMIN_ARCHIVE_DAYS } from "../../lib/plan-retention";
export { resolveEntitlements };

export type GatewayScope = "local" | "regional" | "global";

export type GatewaySeed = {
  id: string;
  provider_key: string;
  name_ar: string;
  name_en: string;
  scope: GatewayScope;
  countries_json: string;
  methods_json: string;
  sort_order: number;
};

export const GATEWAY_CATALOG: GatewaySeed[] = [
  { id: "gw_thawani", provider_key: "thawani", name_ar: "ثواني", name_en: "Thawani", scope: "local", countries_json: '["OM"]', methods_json: '["card","apple_pay"]', sort_order: 10 },
  { id: "gw_omannet", provider_key: "omannet", name_ar: "عمان نت", name_en: "OmanNet", scope: "local", countries_json: '["OM"]', methods_json: '["card"]', sort_order: 20 },
  { id: "gw_bank_muscat", provider_key: "bank_muscat", name_ar: "بنك مسقط", name_en: "Bank Muscat", scope: "local", countries_json: '["OM"]', methods_json: '["bank_transfer","card"]', sort_order: 30 },
  { id: "gw_bank_dhofar", provider_key: "bank_dhofar", name_ar: "بنك ظفار", name_en: "Bank Dhofar", scope: "local", countries_json: '["OM"]', methods_json: '["bank_transfer"]', sort_order: 40 },
  { id: "gw_tap", provider_key: "tap", name_ar: "تاب للمدفوعات", name_en: "Tap Payments", scope: "regional", countries_json: '["OM","SA","AE","KW","BH","QA"]', methods_json: '["card","apple_pay","knet"]', sort_order: 50 },
  { id: "gw_moyasar", provider_key: "moyasar", name_ar: "مُيسّر", name_en: "Moyasar", scope: "regional", countries_json: '["SA"]', methods_json: '["card","apple_pay","mada"]', sort_order: 60 },
  { id: "gw_hyperpay", provider_key: "hyperpay", name_ar: "هايبر باي", name_en: "HyperPay", scope: "regional", countries_json: '["SA","AE","EG"]', methods_json: '["card","mada"]', sort_order: 70 },
  { id: "gw_paytabs", provider_key: "paytabs", name_ar: "باي تابس", name_en: "PayTabs", scope: "regional", countries_json: '["OM","SA","AE","EG"]', methods_json: '["card"]', sort_order: 80 },
  { id: "gw_stripe", provider_key: "stripe", name_ar: "سترايب", name_en: "Stripe", scope: "global", countries_json: '["*"]', methods_json: '["card","apple_pay","google_pay"]', sort_order: 90 },
  { id: "gw_paypal", provider_key: "paypal", name_ar: "باي بال", name_en: "PayPal", scope: "global", countries_json: '["*"]', methods_json: '["paypal","card"]', sort_order: 100 },
  { id: "gw_manual", provider_key: "manual_transfer", name_ar: "تحويل بنكي يدوي", name_en: "Manual bank transfer", scope: "local", countries_json: '["OM","SA","AE"]', methods_json: '["bank_transfer"]', sort_order: 5 },
];

let subscriptionAdminColumnsReady = false;

export async function ensureSubscriptionAdminColumns(db: D1Database) {
  if (subscriptionAdminColumnsReady) return;
  const columns = await db.prepare("PRAGMA table_info(subscriptions)").all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  const additions: Array<[string, string]> = [
    ["paused_at", "TEXT"],
    ["admin_note", "TEXT"],
    ["discount_percent", "INTEGER NOT NULL DEFAULT 0"],
    ["discount_fixed_minor", "INTEGER NOT NULL DEFAULT 0"],
    ["discount_label", "TEXT"],
    ["gateway_id", "TEXT"],
    ["features_grant_json", "TEXT NOT NULL DEFAULT '[]'"],
    ["features_deny_json", "TEXT NOT NULL DEFAULT '[]'"],
    ["wallet_limit_override", "INTEGER"],
    ["member_limit_override", "INTEGER"],
    ["transaction_limit_override", "INTEGER"],
    ["record_limit_override", "INTEGER"],
    ["user_limit_override", "INTEGER"],
    ["pending_plan_id", "TEXT"],
    ["pending_billing_cycle", "TEXT"],
    ["pending_effective_at", "TEXT"],
  ];
  for (const [name, ddl] of additions) {
    if (names.has(name)) continue;
    try {
      await db.prepare(`ALTER TABLE subscriptions ADD COLUMN ${name} ${ddl}`).run();
    } catch (error) {
      const refreshed = await db.prepare("PRAGMA table_info(subscriptions)").all<{ name: string }>();
      if (!refreshed.results.some((column) => column.name === name)) throw error;
    }
  }
  subscriptionAdminColumnsReady = true;
}

const DEFAULT_PLAN_QUOTAS: Record<string, {
  transactions: number;
  records: number;
  users: number;
  dailyTransactions: number;
  monthlyTransactions: number;
  prints: number;
  extraFeatures: string[];
}> = {
  starter: { transactions: 50, records: 20, users: 1, dailyTransactions: 5, monthlyTransactions: 50, prints: 10, extraFeatures: [] },
  family: { transactions: 300, records: 100, users: 5, dailyTransactions: 20, monthlyTransactions: 300, prints: 50, extraFeatures: ["whatsapp"] },
  pro: { transactions: 2000, records: 500, users: 25, dailyTransactions: 80, monthlyTransactions: 2000, prints: 200, extraFeatures: ["email", "whatsapp", "downloads"] },
  business: { transactions: 0, records: 0, users: 9999, dailyTransactions: 0, monthlyTransactions: 0, prints: 0, extraFeatures: ["email", "whatsapp", "downloads"] },
};

let quotaEventsTableReady = false;

export async function ensureQuotaEventsTable(db: D1Database) {
  if (quotaEventsTableReady) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS quota_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_quota_events_user_kind ON quota_events(user_id, kind, created_at)").run();
  quotaEventsTableReady = true;
}

let planQuotaColumnsReady = false;

export async function ensurePlanQuotaColumns(db: D1Database) {
  if (planQuotaColumnsReady) return;
  await ensureQuotaEventsTable(db);
  const columns = await db.prepare("PRAGMA table_info(plans)").all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  const additions: Array<[string, string]> = [
    ["transaction_limit", "INTEGER NOT NULL DEFAULT 0"],
    ["record_limit", "INTEGER NOT NULL DEFAULT 0"],
    ["user_limit", "INTEGER NOT NULL DEFAULT 1"],
    ["daily_transaction_limit", "INTEGER NOT NULL DEFAULT 0"],
    ["monthly_transaction_limit", "INTEGER NOT NULL DEFAULT 0"],
    ["print_limit", "INTEGER NOT NULL DEFAULT 0"],
  ];
  const addedNames: string[] = [];
  for (const [name, ddl] of additions) {
    if (names.has(name)) continue;
    try {
      await db.prepare(`ALTER TABLE plans ADD COLUMN ${name} ${ddl}`).run();
      addedNames.push(name);
    } catch (error) {
      const refreshed = await db.prepare("PRAGMA table_info(plans)").all<{ name: string }>();
      if (!refreshed.results.some((column) => column.name === name)) throw error;
    }
  }
  if (addedNames.length) {
    const usageAdded = addedNames.some((name) =>
      name === "daily_transaction_limit" || name === "monthly_transaction_limit" || name === "print_limit",
    );
    const legacyAdded = addedNames.some((name) =>
      name === "transaction_limit" || name === "record_limit" || name === "user_limit",
    );
    for (const [planId, quotas] of Object.entries(DEFAULT_PLAN_QUOTAS)) {
      if (legacyAdded && usageAdded) {
        await db
          .prepare("UPDATE plans SET transaction_limit=?, record_limit=?, user_limit=?, daily_transaction_limit=?, monthly_transaction_limit=?, print_limit=? WHERE id=?")
          .bind(quotas.transactions, quotas.records, quotas.users, quotas.dailyTransactions, quotas.monthlyTransactions, quotas.prints, planId)
          .run();
      } else if (usageAdded) {
        await db
          .prepare("UPDATE plans SET daily_transaction_limit=?, monthly_transaction_limit=?, print_limit=? WHERE id=?")
          .bind(quotas.dailyTransactions, quotas.monthlyTransactions, quotas.prints, planId)
          .run();
      } else if (legacyAdded) {
        await db
          .prepare("UPDATE plans SET transaction_limit=?, record_limit=?, user_limit=? WHERE id=?")
          .bind(quotas.transactions, quotas.records, quotas.users, planId)
          .run();
      }
      if (usageAdded && quotas.extraFeatures.length) {
        const row = await db.prepare("SELECT features_json FROM plans WHERE id=?").bind(planId).first<{ features_json: string }>();
        if (!row) continue;
        const current = parsePlanFeatures(row.features_json);
        const merged = [...new Set([...current, ...quotas.extraFeatures])];
        await db.prepare("UPDATE plans SET features_json=? WHERE id=?").bind(JSON.stringify(merged), planId).run();
      }
    }
  }
  planQuotaColumnsReady = true;
}

let gatewaysBootstrapped = false;

export async function ensurePaymentGateways(db: D1Database) {
  if (gatewaysBootstrapped) return;

  const existing = await db.prepare("SELECT COUNT(*) AS count FROM payment_gateways").first<{ count: number }>();
  const now = new Date().toISOString();

  if ((existing?.count ?? 0) === 0) {
    await db.batch(
      GATEWAY_CATALOG.map((gateway) =>
        db
          .prepare(
            `INSERT INTO payment_gateways (
              id, provider_key, name_ar, name_en, scope, countries_json, methods_json,
              is_enabled, is_test_mode, sort_order, config_json, created_at, updated_at
            ) VALUES (?,?,?,?,?,?,?,?,1,?,?,?,?)
            ON CONFLICT(id) DO NOTHING`,
          )
          .bind(
            gateway.id,
            gateway.provider_key,
            gateway.name_ar,
            gateway.name_en,
            gateway.scope,
            gateway.countries_json,
            gateway.methods_json,
            gateway.provider_key === "manual_transfer" ? 1 : 0,
            gateway.sort_order,
            "{}",
            now,
            now,
          ),
      ),
    );
  }

  const linkCount = await db.prepare("SELECT COUNT(*) AS count FROM plan_payment_gateways").first<{ count: number }>();
  if ((linkCount?.count ?? 0) > 0) {
    gatewaysBootstrapped = true;
    return;
  }

  const plans = await db.prepare("SELECT id FROM plans WHERE is_active=1").all<{ id: string }>();
  const gateways = await db.prepare("SELECT id FROM payment_gateways WHERE is_enabled=1").all<{ id: string }>();
  if (!plans.results.length || !gateways.results.length) return;

  const statements = [];
  for (const plan of plans.results) {
    for (const gateway of gateways.results) {
      statements.push(
        db
          .prepare("INSERT INTO plan_payment_gateways (plan_id, gateway_id, created_at) VALUES (?,?,?) ON CONFLICT(plan_id,gateway_id) DO NOTHING")
          .bind(plan.id, gateway.id, now),
      );
    }
  }
  if (statements.length) await db.batch(statements);
  gatewaysBootstrapped = true;
}

export async function listPaymentGateways(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT g.*,
        (SELECT COUNT(*) FROM plan_payment_gateways pg WHERE pg.gateway_id=g.id) AS plan_count
       FROM payment_gateways g
       ORDER BY g.sort_order ASC, g.name_en ASC`,
    )
    .all<Record<string, unknown>>();
  return rows.results.map((row) => ({
    ...row,
    id: String(row.id),
    countries: parsePlanFeatures(row.countries_json),
    methods: parsePlanFeatures(row.methods_json),
    plan_ids: [] as string[],
  }));
}

export async function listGatewaysWithPlans(db: D1Database) {
  const gateways = await listPaymentGateways(db);
  const links = await db.prepare("SELECT plan_id, gateway_id FROM plan_payment_gateways").all<{ plan_id: string; gateway_id: string }>();
  const byGateway = new Map<string, string[]>();
  for (const link of links.results) {
    const list = byGateway.get(link.gateway_id) ?? [];
    list.push(link.plan_id);
    byGateway.set(link.gateway_id, list);
  }
  return gateways.map((gateway) => ({
    ...gateway,
    plan_ids: byGateway.get(gateway.id) ?? [],
  }));
}

export async function updatePaymentGateway(
  db: D1Database,
  input: {
    gatewayId: string;
    isEnabled?: boolean;
    isTestMode?: boolean;
    sortOrder?: number;
    planIds?: string[];
    configJson?: string;
  },
) {
  const now = new Date().toISOString();
  const current = await db.prepare("SELECT id FROM payment_gateways WHERE id=?").bind(input.gatewayId).first();
  if (!current) return null;

  if (input.isEnabled !== undefined || input.isTestMode !== undefined || input.sortOrder !== undefined || input.configJson !== undefined) {
    const row = await db.prepare("SELECT is_enabled,is_test_mode,sort_order,config_json FROM payment_gateways WHERE id=?")
      .bind(input.gatewayId)
      .first<{ is_enabled: number; is_test_mode: number; sort_order: number; config_json: string }>();
    await db
      .prepare("UPDATE payment_gateways SET is_enabled=?,is_test_mode=?,sort_order=?,config_json=?,updated_at=? WHERE id=?")
      .bind(
        input.isEnabled === undefined ? Number(row?.is_enabled ?? 0) : input.isEnabled ? 1 : 0,
        input.isTestMode === undefined ? Number(row?.is_test_mode ?? 1) : input.isTestMode ? 1 : 0,
        input.sortOrder === undefined ? Number(row?.sort_order ?? 0) : input.sortOrder,
        input.configJson ?? row?.config_json ?? "{}",
        now,
        input.gatewayId,
      )
      .run();
  }

  if (input.planIds) {
    await db.prepare("DELETE FROM plan_payment_gateways WHERE gateway_id=?").bind(input.gatewayId).run();
    if (input.planIds.length) {
      await db.batch(
        input.planIds.map((planId) =>
          db.prepare("INSERT INTO plan_payment_gateways (plan_id, gateway_id, created_at) VALUES (?,?,?) ON CONFLICT(plan_id,gateway_id) DO NOTHING").bind(planId, input.gatewayId, now),
        ),
      );
    }
  }
  return listGatewaysWithPlans(db);
}

export async function listAdminPlans(db: D1Database) {
  const plans = await db.prepare("SELECT * FROM plans ORDER BY sort_order ASC, created_at ASC").all<Record<string, unknown>>();
  const links = await db.prepare("SELECT plan_id, gateway_id FROM plan_payment_gateways").all<{ plan_id: string; gateway_id: string }>();
  const byPlan = new Map<string, string[]>();
  for (const link of links.results) {
    const list = byPlan.get(link.plan_id) ?? [];
    list.push(link.gateway_id);
    byPlan.set(link.plan_id, list);
  }
  const counts = await db.prepare("SELECT plan_id, COUNT(*) AS count FROM subscriptions GROUP BY plan_id").all<{ plan_id: string; count: number }>();
  const countMap = new Map(counts.results.map((row) => [row.plan_id, Number(row.count)]));
  return plans.results.map((plan) => ({
    ...plan,
    features: parsePlanFeatures(plan.features_json),
    gateway_ids: byPlan.get(String(plan.id)) ?? [],
    subscriber_count: countMap.get(String(plan.id)) ?? 0,
  }));
}

export async function upsertAdminPlan(
  db: D1Database,
  input: {
    id?: string;
    nameAr: string;
    nameEn: string;
    descriptionAr: string;
    descriptionEn: string;
    monthlyMinor: number;
    annualMinor: number;
    walletLimit: number;
    memberLimit: number;
    transactionLimit: number;
    recordLimit: number;
    userLimit: number;
    dailyTransactionLimit: number;
    monthlyTransactionLimit: number;
    printLimit: number;
    features: string[];
    isActive: boolean;
    sortOrder: number;
    gatewayIds?: string[];
  },
) {
  const now = new Date().toISOString();
  const planId = (input.id ?? `plan_${crypto.randomUUID().slice(0, 8)}`).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 50);
  const existing = await db.prepare("SELECT id FROM plans WHERE id=?").bind(planId).first();
  if (existing) {
    await db
      .prepare(
        `UPDATE plans SET name_ar=?,name_en=?,description_ar=?,description_en=?,monthly_minor=?,annual_minor=?,
         wallet_limit=?,member_limit=?,transaction_limit=?,record_limit=?,user_limit=?,daily_transaction_limit=?,monthly_transaction_limit=?,print_limit=?,features_json=?,is_active=?,sort_order=? WHERE id=?`,
      )
      .bind(
        input.nameAr,
        input.nameEn,
        input.descriptionAr,
        input.descriptionEn,
        input.monthlyMinor,
        input.annualMinor,
        input.walletLimit,
        input.memberLimit,
        input.transactionLimit,
        input.recordLimit,
        input.userLimit,
        input.dailyTransactionLimit,
        input.monthlyTransactionLimit,
        input.printLimit,
        JSON.stringify(input.features),
        input.isActive ? 1 : 0,
        input.sortOrder,
        planId,
      )
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO plans (id,name_ar,name_en,description_ar,description_en,monthly_minor,annual_minor,wallet_limit,member_limit,transaction_limit,record_limit,user_limit,daily_transaction_limit,monthly_transaction_limit,print_limit,features_json,is_active,sort_order,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        planId,
        input.nameAr,
        input.nameEn,
        input.descriptionAr,
        input.descriptionEn,
        input.monthlyMinor,
        input.annualMinor,
        input.walletLimit,
        input.memberLimit,
        input.transactionLimit,
        input.recordLimit,
        input.userLimit,
        input.dailyTransactionLimit,
        input.monthlyTransactionLimit,
        input.printLimit,
        JSON.stringify(input.features),
        input.isActive ? 1 : 0,
        input.sortOrder,
        now,
      )
      .run();
  }

  if (input.gatewayIds) {
    await db.prepare("DELETE FROM plan_payment_gateways WHERE plan_id=?").bind(planId).run();
    if (input.gatewayIds.length) {
      await db.batch(
        input.gatewayIds.map((gatewayId) =>
          db.prepare("INSERT INTO plan_payment_gateways (plan_id, gateway_id, created_at) VALUES (?,?,?) ON CONFLICT(plan_id,gateway_id) DO NOTHING").bind(planId, gatewayId, now),
        ),
      );
    }
  }
  return { planId, plans: await listAdminPlans(db) };
}

export async function adminUpdateSubscription(
  db: D1Database,
  input: {
    userId: string;
    planId?: string;
    status?: string;
    billingCycle?: "monthly" | "annual";
    periodEnd?: string;
    discountPercent?: number;
    discountFixedMinor?: number;
    discountLabel?: string | null;
    adminNote?: string | null;
    gatewayId?: string | null;
    pause?: boolean;
    featuresGrant?: string[];
    featuresDeny?: string[];
    walletLimitOverride?: number | null;
    memberLimitOverride?: number | null;
    transactionLimitOverride?: number | null;
    recordLimitOverride?: number | null;
    userLimitOverride?: number | null;
  },
) {
  await ensureSubscriptionAdminColumns(db);
  const now = new Date().toISOString();
  const user = await db.prepare("SELECT id FROM users WHERE id=?").bind(input.userId).first();
  if (!user) return null;

  const current = await db
    .prepare("SELECT * FROM subscriptions WHERE user_id=? ORDER BY created_at DESC LIMIT 1")
    .bind(input.userId)
    .first<Record<string, unknown>>();

  const planId = input.planId ?? (current ? String(current.plan_id) : "starter");
  const plan = await db.prepare("SELECT id FROM plans WHERE id=?").bind(planId).first();
  if (!plan) return null;

  let status = input.status ?? (current ? String(current.status) : "active");
  let pausedAt: string | null = current ? ((current.paused_at as string | null) ?? null) : null;
  if (input.pause === true) {
    status = "suspended";
    pausedAt = now;
  } else if (input.pause === false) {
    status = input.status ?? "active";
    pausedAt = null;
  }

  const billingCycle = input.billingCycle ?? (current ? String(current.billing_cycle) : "monthly");
  const periodEnd =
    input.periodEnd ??
    (current ? String(current.current_period_end) : new Date(Date.now() + 30 * 86_400_000).toISOString());
  const adminNote = input.adminNote === undefined ? (current?.admin_note ?? null) : input.adminNote;
  const discountPercent =
    input.discountPercent === undefined
      ? Number(current?.discount_percent ?? 0)
      : Math.max(0, Math.min(100, input.discountPercent));
  const discountFixedMinor =
    input.discountFixedMinor === undefined
      ? Number(current?.discount_fixed_minor ?? 0)
      : Math.max(0, input.discountFixedMinor);
  const discountLabel = input.discountLabel === undefined ? (current?.discount_label ?? null) : input.discountLabel;
  const gatewayId = input.gatewayId === undefined ? (current?.gateway_id ?? null) : input.gatewayId;
  const featuresGrant = JSON.stringify(input.featuresGrant ?? parsePlanFeatures(current?.features_grant_json));
  const featuresDeny = JSON.stringify(input.featuresDeny ?? parsePlanFeatures(current?.features_deny_json));
  const walletLimitOverride = input.walletLimitOverride === undefined
    ? (current?.wallet_limit_override ?? null)
    : input.walletLimitOverride;
  const memberLimitOverride = input.memberLimitOverride === undefined
    ? (current?.member_limit_override ?? null)
    : input.memberLimitOverride;
  const transactionLimitOverride = input.transactionLimitOverride === undefined
    ? (current?.transaction_limit_override ?? null)
    : input.transactionLimitOverride;
  const recordLimitOverride = input.recordLimitOverride === undefined
    ? (current?.record_limit_override ?? null)
    : input.recordLimitOverride;
  const userLimitOverride = input.userLimitOverride === undefined
    ? (current?.user_limit_override ?? null)
    : input.userLimitOverride;

  if (!current) {
    await db
      .prepare(
        `INSERT INTO subscriptions (
          id,user_id,plan_id,status,billing_cycle,current_period_start,current_period_end,cancel_at_period_end,
          paused_at,admin_note,discount_percent,discount_fixed_minor,discount_label,gateway_id,
          features_grant_json,features_deny_json,wallet_limit_override,member_limit_override,
          transaction_limit_override,record_limit_override,user_limit_override,created_at,updated_at
        ) VALUES (?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        crypto.randomUUID(),
        input.userId,
        planId,
        status,
        billingCycle,
        now,
        periodEnd,
        pausedAt,
        adminNote,
        discountPercent,
        discountFixedMinor,
        discountLabel,
        gatewayId,
        featuresGrant,
        featuresDeny,
        walletLimitOverride,
        memberLimitOverride,
        transactionLimitOverride,
        recordLimitOverride,
        userLimitOverride,
        now,
        now,
      )
      .run();
  } else {
    await db
      .prepare(
        `UPDATE subscriptions SET
          plan_id=?, status=?, billing_cycle=?, current_period_end=?,
          paused_at=?, admin_note=?, discount_percent=?, discount_fixed_minor=?, discount_label=?, gateway_id=?,
          features_grant_json=?, features_deny_json=?, wallet_limit_override=?, member_limit_override=?,
          transaction_limit_override=?, record_limit_override=?, user_limit_override=?, updated_at=?
         WHERE id=?`,
      )
      .bind(
        planId,
        status,
        billingCycle,
        periodEnd,
        pausedAt,
        adminNote,
        discountPercent,
        discountFixedMinor,
        discountLabel,
        gatewayId,
        featuresGrant,
        featuresDeny,
        walletLimitOverride,
        memberLimitOverride,
        transactionLimitOverride,
        recordLimitOverride,
        userLimitOverride,
        now,
        current.id,
      )
      .run();
  }

  return getUserBillingHistory(db, input.userId).then(async (history) => {
    const { syncRetentionForUser } = await import("../../lib/plan-retention");
    await syncRetentionForUser(db, input.userId, "admin");
    return history;
  });
}

export async function getUserBillingHistory(db: D1Database, userId: string) {
  const [subscriptions, invoices, payments, coupons] = await Promise.all([
    db
      .prepare(
        `SELECT s.*, p.name_ar AS plan_name_ar, p.name_en AS plan_name_en, p.monthly_minor, p.annual_minor, p.features_json,
                p.wallet_limit, p.member_limit, p.transaction_limit, p.record_limit, p.user_limit,
                p.daily_transaction_limit, p.monthly_transaction_limit, p.print_limit
         FROM subscriptions s JOIN plans p ON p.id=s.plan_id
         WHERE s.user_id=? ORDER BY s.created_at DESC`,
      )
      .bind(userId)
      .all<Record<string, unknown>>(),
    db.prepare("SELECT * FROM invoices WHERE user_id=? ORDER BY created_at DESC LIMIT 50").bind(userId).all(),
    db.prepare("SELECT * FROM payments WHERE user_id=? ORDER BY occurred_at DESC LIMIT 50").bind(userId).all(),
    db
      .prepare(
        `SELECT r.*, c.code, c.discount_type, c.value
         FROM coupon_redemptions r JOIN coupons c ON c.id=r.coupon_id
         WHERE r.user_id=? ORDER BY r.created_at DESC LIMIT 20`,
      )
      .bind(userId)
      .all(),
  ]);
  return {
    subscriptions: subscriptions.results.map((row) => ({ ...row, features: parsePlanFeatures(row.features_json) })),
    invoices: invoices.results,
    payments: payments.results,
    couponRedemptions: coupons.results,
  };
}

type EntitlementsResult = Awaited<ReturnType<typeof loadActivePlanEntitlements>>;

const entitlementsMemo = new Map<string, { exp: number; promise: Promise<EntitlementsResult> }>();
const ENTITLEMENTS_MEMO_MS = 8_000;

async function loadActivePlanEntitlements(db: D1Database, userId: string, options?: { skipSideEffects?: boolean; skipUsage?: boolean }) {
  await ensureSubscriptionAdminColumns(db);
  await ensurePlanQuotaColumns(db);
  if (!options?.skipSideEffects) {
    try {
      const { applyDuePlanChanges } = await import("../../lib/plan-change");
      await applyDuePlanChanges(db, userId);
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        code: "PLAN_CHANGE_APPLY_FAILED",
        message: error instanceof Error ? error.message : String(error),
        at: new Date().toISOString(),
      }));
    }
  }
  const { expireLapsedPaidSubscriptions, readUserGraceSummary, USER_GRACE_DAYS } = await import("../../lib/plan-retention");
  if (!options?.skipSideEffects) {
    try {
      await expireLapsedPaidSubscriptions(db, userId);
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        code: "PLAN_EXPIRE_FAILED",
        message: error instanceof Error ? error.message : String(error),
        at: new Date().toISOString(),
      }));
    }
  }
  const row = await db
    .prepare(
      `SELECT p.wallet_limit, p.member_limit, p.transaction_limit, p.record_limit, p.user_limit,
              p.daily_transaction_limit, p.monthly_transaction_limit, p.print_limit, p.features_json, s.status,
              s.discount_percent, s.discount_fixed_minor,
              s.features_grant_json, s.features_deny_json, s.wallet_limit_override, s.member_limit_override,
              s.transaction_limit_override, s.record_limit_override, s.user_limit_override
       FROM subscriptions s JOIN plans p ON p.id=s.plan_id
       WHERE s.user_id=? AND s.status IN ('active','trialing')
       ORDER BY s.created_at DESC LIMIT 1`,
    )
    .bind(userId)
    .first<{
      wallet_limit: number;
      member_limit: number;
      transaction_limit: number | null;
      record_limit: number | null;
      user_limit: number | null;
      daily_transaction_limit: number | null;
      monthly_transaction_limit: number | null;
      print_limit: number | null;
      features_json: string;
      status: string;
      discount_percent: number;
      discount_fixed_minor: number;
      features_grant_json?: string;
      features_deny_json?: string;
      wallet_limit_override?: number | null;
      member_limit_override?: number | null;
      transaction_limit_override?: number | null;
      record_limit_override?: number | null;
      user_limit_override?: number | null;
    }>().catch((error) => {
      console.error(JSON.stringify({
        level: "error",
        code: "PLAN_ENTITLEMENTS_QUERY_FAILED",
        message: error instanceof Error ? error.message : String(error),
        at: new Date().toISOString(),
      }));
      return null;
    });
  const resolved = row
    ? resolveEntitlements({
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
    })
    : resolveEntitlements({
      planFeatures: ["personal"],
      walletLimit: 1,
      memberLimit: 2,
      transactionLimit: 50,
      recordLimit: 20,
      userLimit: 1,
      dailyTransactionLimit: 5,
      monthlyTransactionLimit: 50,
      printLimit: 10,
      status: "none",
    });
  const emptyUsage = { transactionsTotal: 0, transactionsToday: 0, transactionsThisMonth: 0, printsThisMonth: 0 };
  const usage = options?.skipUsage
    ? emptyUsage
    : await getOwnerQuotaUsage(db, userId).catch((error) => {
      console.error(JSON.stringify({
        level: "error",
        code: "PLAN_USAGE_QUERY_FAILED",
        message: error instanceof Error ? error.message : String(error),
        at: new Date().toISOString(),
      }));
      return emptyUsage;
    });
  const grace = options?.skipUsage ? null : await readUserGraceSummary(db, userId);
  return {
    ...resolved,
    discountPercent: Number(row?.discount_percent ?? 0),
    discountFixedMinor: Number(row?.discount_fixed_minor ?? 0),
    usage,
    warnings: options?.skipUsage ? [] : buildQuotaWarnings(resolved, usage),
    retention: grace
      ? {
        graceEndsAt: grace.graceEndsAt,
        spaceCount: grace.spaceCount,
        spaceTypes: grace.spaceTypes,
        userVisibleDays: USER_GRACE_DAYS,
      }
      : null,
  };
}

export async function getActivePlanEntitlements(db: D1Database, userId: string, options?: { skipSideEffects?: boolean; skipUsage?: boolean }) {
  const key = `${userId}:${options?.skipSideEffects ? 1 : 0}:${options?.skipUsage ? 1 : 0}`;
  const hit = entitlementsMemo.get(key);
  if (hit && hit.exp > Date.now()) return hit.promise;
  const promise = loadActivePlanEntitlements(db, userId, options);
  entitlementsMemo.set(key, { exp: Date.now() + ENTITLEMENTS_MEMO_MS, promise });
  try {
    return await promise;
  } catch (error) {
    entitlementsMemo.delete(key);
    throw error;
  }
}

export function invalidatePlanEntitlementsCache(userId?: string) {
  if (!userId) {
    entitlementsMemo.clear();
    return;
  }
  for (const key of entitlementsMemo.keys()) {
    if (key.startsWith(`${userId}:`)) entitlementsMemo.delete(key);
  }
}

export type PlanQuotaKind = "transaction" | "record" | "user";

function startOfUtcDay(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function startOfUtcMonth(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

async function isPlatformAdminUser(db: D1Database, userId: string) {
  const row = await db.prepare("SELECT role FROM platform_roles WHERE user_id=?").bind(userId).first<{ role: string }>();
  return ["super_admin", "admin"].includes(row?.role ?? "");
}

export async function countOwnerTransactions(db: D1Database, userId: string, since?: string) {
  const sql = since
    ? `SELECT COUNT(*) AS count
       FROM transactions t JOIN spaces s ON s.id=t.space_id
       WHERE s.owner_user_id=? AND COALESCE(t.status,'approved') <> 'voided' AND t.created_at>=?`
    : `SELECT COUNT(*) AS count
       FROM transactions t JOIN spaces s ON s.id=t.space_id
       WHERE s.owner_user_id=? AND COALESCE(t.status,'approved') <> 'voided'`;
  const query = db.prepare(sql);
  const row = since ? await query.bind(userId, since).first<{ count: number }>() : await query.bind(userId).first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function countOwnerRecords(db: D1Database, userId: string) {
  const row = await db.prepare(
    "SELECT COUNT(*) AS count FROM documents WHERE owner_user_id=? AND COALESCE(status,'issued') <> 'voided'",
  ).bind(userId).first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function countOwnerUsers(db: D1Database, userId: string) {
  const row = await db.prepare(
    `SELECT COUNT(DISTINCT m.user_id) AS count
     FROM members m JOIN spaces s ON s.id=m.space_id
     WHERE s.owner_user_id=? AND m.status='active' AND m.user_id IS NOT NULL`,
  ).bind(userId).first<{ count: number }>();
  const linked = Number(row?.count ?? 0);
  return Math.max(1, linked || 1);
}

export async function countQuotaEvents(db: D1Database, userId: string, kind: "print" | "download", since: string) {
  const row = await db.prepare(
    "SELECT COUNT(*) AS count FROM quota_events WHERE user_id=? AND kind=? AND created_at>=?",
  ).bind(userId, kind, since).first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function getOwnerQuotaUsage(db: D1Database, userId: string) {
  const dayStart = startOfUtcDay();
  const monthStart = startOfUtcMonth();
  const [transactionsTotal, transactionsToday, transactionsThisMonth, printsThisMonth] = await Promise.all([
    countOwnerTransactions(db, userId),
    countOwnerTransactions(db, userId, dayStart),
    countOwnerTransactions(db, userId, monthStart),
    countQuotaEvents(db, userId, "print", monthStart),
  ]);
  return { transactionsTotal, transactionsToday, transactionsThisMonth, printsThisMonth };
}

function buildQuotaWarnings(
  entitlements: {
    transactionLimit: number;
    dailyTransactionLimit: number;
    monthlyTransactionLimit: number;
    printLimit: number;
  },
  usage: Awaited<ReturnType<typeof getOwnerQuotaUsage>>,
) {
  const items: Array<{ kind: string; used: number; limit: number }> = [];
  const push = (kind: string, used: number, limit: number) => {
    if (quotaNearLimit(used, limit)) items.push({ kind, used, limit });
  };
  push("transaction", usage.transactionsTotal, entitlements.transactionLimit);
  push("daily_transaction", usage.transactionsToday, entitlements.dailyTransactionLimit);
  push("monthly_transaction", usage.transactionsThisMonth, entitlements.monthlyTransactionLimit);
  push("print", usage.printsThisMonth, entitlements.printLimit);
  return items;
}

export async function assertOwnerPlanQuota(db: D1Database, userId: string, kind: PlanQuotaKind, extra = 1) {
  if (await isPlatformAdminUser(db, userId)) return getActivePlanEntitlements(db, userId, { skipSideEffects: true });
  const entitlements = await getActivePlanEntitlements(db, userId, { skipSideEffects: true });
  if (kind === "transaction") {
    const usage = entitlements.usage;
    if (quotaWouldExceed(usage.transactionsTotal, extra, entitlements.transactionLimit)) throw new ApiError(403, "PLAN_TRANSACTION_LIMIT");
    if (quotaWouldExceed(usage.transactionsToday, extra, entitlements.dailyTransactionLimit)) throw new ApiError(403, "PLAN_DAILY_TRANSACTION_LIMIT");
    if (quotaWouldExceed(usage.transactionsThisMonth, extra, entitlements.monthlyTransactionLimit)) throw new ApiError(403, "PLAN_MONTHLY_TRANSACTION_LIMIT");
  } else if (kind === "record") {
    const used = await countOwnerRecords(db, userId);
    if (quotaWouldExceed(used, extra, entitlements.recordLimit)) throw new ApiError(403, "PLAN_RECORD_LIMIT");
  } else {
    const used = await countOwnerUsers(db, userId);
    if (quotaWouldExceed(used, extra, entitlements.userLimit)) throw new ApiError(403, "PLAN_USER_LIMIT");
  }
  return entitlements;
}

export async function assertPlanShareFeature(
  db: D1Database,
  ownerUserId: string,
  feature: "email" | "whatsapp" | "downloads",
  actorUserId = ownerUserId,
) {
  if (await isPlatformAdminUser(db, actorUserId)) {
    return getActivePlanEntitlements(db, ownerUserId, { skipSideEffects: true, skipUsage: true });
  }
  const entitlements = await getActivePlanEntitlements(db, ownerUserId, { skipSideEffects: true, skipUsage: true });
  if (!planHasFeature(entitlements.features, feature)) throw new ApiError(403, "PLAN_FEATURE_REQUIRED");
  return entitlements;
}

export async function consumeQuotaEvent(
  db: D1Database,
  ownerUserId: string,
  kind: "print" | "download",
  actorUserId = ownerUserId,
) {
  await ensureQuotaEventsTable(db);
  if (await isPlatformAdminUser(db, actorUserId)) {
    return getActivePlanEntitlements(db, ownerUserId, { skipSideEffects: true });
  }
  const entitlements = await getActivePlanEntitlements(db, ownerUserId, { skipSideEffects: true });
  if (kind === "download" && !planHasFeature(entitlements.features, "downloads")) {
    throw new ApiError(403, "PLAN_FEATURE_REQUIRED");
  }
  if (kind === "print") {
    if (quotaWouldExceed(entitlements.usage.printsThisMonth, 1, entitlements.printLimit)) {
      throw new ApiError(403, "PLAN_PRINT_LIMIT");
    }
  }
  try {
    await db.prepare("INSERT INTO quota_events (id, user_id, kind, created_at) VALUES (?,?,?,?)")
      .bind(crypto.randomUUID(), ownerUserId, kind, new Date().toISOString())
      .run();
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      code: "QUOTA_EVENT_INSERT_FAILED",
      message: error instanceof Error ? error.message : String(error),
      at: new Date().toISOString(),
    }));
  }
  invalidatePlanEntitlementsCache(ownerUserId);
  const nextUsage = {
    ...entitlements.usage,
    printsThisMonth: kind === "print" ? entitlements.usage.printsThisMonth + 1 : entitlements.usage.printsThisMonth,
  };
  return {
    ...entitlements,
    usage: nextUsage,
    warnings: buildQuotaWarnings(entitlements, nextUsage),
  };
}
