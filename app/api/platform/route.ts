import { z } from "zod";
import { ensureSchema, getRawDb, type RequestUser } from "../../../db/runtime";
import { authenticateRequest, createSessionToken, csrfCookie, issueCsrfToken, normalizeEmail, sha256 } from "../../../lib/auth";
import { ApiError, claimIdempotency, completeIdempotency, enforceCsrf, enforceWriteRequest, errorResponse, rateLimit, releaseIdempotency } from "../../../lib/security";
import { appOrigin } from "../../../lib/app-origin";
import { assertApiScope, assertPlatformPermission, authorizeSpace, ensureDefaultTenant } from "../../../lib/authorization";
import { prepareAudit, writeAudit } from "../../../lib/audit";
import { calculatePercentMinor, multiplyMinor, parseNonNegativeMoneyToMinor } from "../../../lib/money";
import { countryPack } from "../../../lib/country-packs";
import { nextReference } from "../../../lib/reference";
import { encryptSecret, loadKeyring } from "../../../lib/encryption";
import { configuredAllowedHosts, validateOutboundHttpsUrl } from "../../../lib/outbound";
import { listAdminUsers, getAdminUserDetail, adminVerifyUserEmail, adminUpdateUserProfile } from "../../../services/admin/users-service";
import { computeAdminAlerts } from "../../../services/admin/alerts-service";
import { blockIpByHash, unblockIpByHash, trustIpByHash, IP_BLOCK_HOURS } from "../../../lib/ip-security";
import { listAdminTenants, getAdminTenantDetail } from "../../../services/admin/tenants-service";
import {
  adminUpdateSubscription,
  getActivePlanEntitlements,
  listAdminPlans,
  listGatewaysWithPlans,
  planHasFeature,
  planAllowsSpaceType,
  filterSpacesForPlanAccess,
  updatePaymentGateway,
  upsertAdminPlan,
  assertOwnerPlanQuota,
} from "../../../services/admin/billing-service";

const isoNow = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const day = 86_400_000;
const atOffset = (days: number) => new Date(Date.now() + days * day).toISOString();

const planSeeds = [
  {
    id: "starter", nameAr: "البداية", nameEn: "Starter",
    descriptionAr: "لتبدأ تنظيم أموالك", descriptionEn: "Start organizing your money",
    monthly: 0, annual: 0, wallets: 1, members: 2, transactions: 50, records: 20, users: 1,
    dailyTransactions: 5, monthlyTransactions: 50, prints: 10,
    features: ["personal", "basic_reports"], order: 1,
  },
  {
    id: "family", nameAr: "العائلة", nameEn: "Family",
    descriptionAr: "للأفراد والعائلات الصغيرة", descriptionEn: "For individuals and families",
    monthly: 2900, annual: 27840, wallets: 5, members: 15, transactions: 300, records: 100, users: 5,
    dailyTransactions: 20, monthlyTransactions: 300, prints: 50,
    features: ["personal", "household", "trips", "travel", "circles", "circle", "exports", "statements", "advanced_reports", "whatsapp"], order: 2,
  },
  {
    id: "pro", nameAr: "الاحتراف", nameEn: "Professional",
    descriptionAr: "لمديري المجموعات والجمعيات", descriptionEn: "For group and circle managers",
    monthly: 7900, annual: 75840, wallets: 20, members: 75, transactions: 2000, records: 500, users: 25,
    dailyTransactions: 80, monthlyTransactions: 2000, prints: 200,
    features: ["personal", "household", "trips", "circles", "all_wallets", "documents", "exports", "statements", "advanced_reports", "draws", "voting", "custom_roles", "email", "whatsapp", "downloads"], order: 3,
  },
  {
    id: "business", nameAr: "الأعمال", nameEn: "Business",
    descriptionAr: "للفرق والمؤسسات", descriptionEn: "For teams and organizations",
    monthly: 19900, annual: 191040, wallets: 9999, members: 9999, transactions: 0, records: 0, users: 9999,
    dailyTransactions: 0, monthlyTransactions: 0, prints: 0,
    features: ["personal", "household", "trips", "circles", "unlimited", "documents", "exports", "multi_approval", "audit", "api", "priority_support", "email", "whatsapp", "downloads"], order: 4,
  },
] as const;

async function seedPlans(db: D1Database) {
  const count = await db.prepare("SELECT COUNT(*) AS count FROM plans").first<{ count: number }>();
  if ((count?.count ?? 0) > 0) return;
  const createdAt = isoNow();
  await db.batch(planSeeds.map((plan) => db.prepare(
    "INSERT INTO plans (id,name_ar,name_en,description_ar,description_en,monthly_minor,annual_minor,wallet_limit,member_limit,transaction_limit,record_limit,user_limit,daily_transaction_limit,monthly_transaction_limit,print_limit,features_json,is_active,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)",
  ).bind(plan.id, plan.nameAr, plan.nameEn, plan.descriptionAr, plan.descriptionEn, plan.monthly, plan.annual, plan.wallets, plan.members, plan.transactions, plan.records, plan.users, plan.dailyTransactions, plan.monthlyTransactions, plan.prints, JSON.stringify(plan.features), plan.order, createdAt)));
  const { ensurePaymentGateways } = await import("../../../services/admin/billing-service");
  await ensurePaymentGateways(db);
}

async function seedCoupons(db: D1Database) {
  const couponCount = await db.prepare("SELECT COUNT(*) AS count FROM coupons").first<{ count: number }>();
  if ((couponCount?.count ?? 0) > 0) return;
  const now = isoNow();
  await db.batch([
    db.prepare("INSERT INTO coupons VALUES (?,?, 'percent',20,250,34,?,1,?)").bind(id(), "WAZEN20", atOffset(90), now),
    db.prepare("INSERT INTO coupons VALUES (?,?, 'percent',15,500,86,?,1,?)").bind(id(), "FAMILY15", atOffset(180), now),
  ]);
}

async function ensureIdentity(db: D1Database, user: RequestUser) {
  const now = isoNow();
  await db.batch([
    db.prepare(`INSERT INTO users (id,email,display_name,locale,currency,created_at) VALUES (?,?,?,'ar','OMR',?)
      ON CONFLICT(id) DO UPDATE SET email=excluded.email, display_name=excluded.display_name, currency='OMR'`).bind(user.id, user.email, user.displayName, now),
    db.prepare(`INSERT INTO customer_profiles (user_id,status,country,last_seen_at,created_at) VALUES (?,'active','OM',?,?)
      ON CONFLICT(user_id) DO UPDATE SET last_seen_at=excluded.last_seen_at, country='OM'`).bind(user.id, now, now),
  ]);

  const role = await db.prepare("SELECT role FROM platform_roles WHERE user_id=?").bind(user.id).first<{ role: string }>();
  if (!role) {
    const administrators = (process.env.WAZEN_ADMIN_EMAILS ?? "").split(",").map(normalizeEmail).filter(Boolean);
    const assigned = administrators.includes(normalizeEmail(user.email)) ? "super_admin" : "customer";
    await db.prepare("INSERT INTO platform_roles VALUES (?,?,?, ?, ?)")
      .bind(user.id, assigned, JSON.stringify(assigned === "super_admin" ? ["*"] : ["wallets:own", "documents:own"]), now, now).run();
  }

  const subscription = await db.prepare("SELECT id FROM subscriptions WHERE user_id=? LIMIT 1").bind(user.id).first();
  if (!subscription) {
    await db.prepare(`INSERT INTO subscriptions (id,user_id,plan_id,status,billing_cycle,current_period_start,current_period_end,cancel_at_period_end,created_at,updated_at)
      VALUES (?,?,?,'active','monthly',?,?,0,?,?)`)
      .bind(id(), user.id, "starter", now, atOffset(3650), now, now).run();
  }
  await ensureDefaultTenant(db, user);
}

async function seedCommercialData(db: D1Database, user: RequestUser) {
  await seedPlans(db);
  await ensureIdentity(db, user);
  const now = isoNow();

  if (!user.isDemo) return;
  await seedCoupons(db);

  const demoExists = await db.prepare("SELECT id FROM users WHERE id='demo-customer-1'").first();
  if (!demoExists) {
    const demos = [
      ["demo-customer-1", "سارة العتيبي", "sara@example.com", "pro", "active", "SA"],
      ["demo-customer-2", "خالد المنصوري", "khalid@example.com", "family", "active", "AE"],
      ["demo-customer-3", "مريم البلوشي", "mariam@example.com", "business", "trialing", "OM"],
      ["demo-customer-4", "عبدالله الهاشمي", "abdullah@example.com", "starter", "suspended", "SA"],
    ] as const;
    const statements: D1PreparedStatement[] = [];
    demos.forEach((demo, index) => {
      const userId = demo[0];
      const subId = `demo-sub-${index + 1}`;
      statements.push(
        db.prepare("INSERT INTO users (id, email, display_name, locale, currency, created_at) VALUES (?, ?, ?, 'ar', 'OMR', ?)").bind(userId, demo[2], demo[1], atOffset(-120 + index * 12)),
        db.prepare("INSERT INTO customer_profiles VALUES (?, ?, ?, NULL, ?, ?)").bind(userId, demo[4] === "suspended" ? "suspended" : "active", demo[5], atOffset(-index), atOffset(-120 + index * 12)),
        db.prepare("INSERT INTO platform_roles VALUES (?, 'customer', '[\"wallets:own\",\"documents:own\"]', ?, ?)").bind(userId, now, now),
        db.prepare(`INSERT INTO subscriptions (id,user_id,plan_id,status,billing_cycle,current_period_start,current_period_end,cancel_at_period_end,created_at,updated_at)
          VALUES (?, ?, ?, ?, 'monthly', ?, ?, 0, ?, ?)`).bind(subId, userId, demo[3], demo[4], atOffset(-20), atOffset(10), atOffset(-120), now),
      );
      const amount = [7900, 2900, 19900, 0][index];
      if (amount > 0) {
        const invoiceId = `demo-inv-${index + 1}`;
        const tax = calculatePercentMinor(amount, 1500);
        statements.push(
          db.prepare("INSERT INTO invoices VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'OMR', ?, ?, ?, ?)").bind(invoiceId, userId, subId, `WZN-INV-2026-00${index + 1}`, amount, tax, amount + tax, index === 2 ? "pending" : "paid", atOffset(8), index === 2 ? null : atOffset(-2 - index), atOffset(-5 - index)),
          db.prepare("INSERT INTO payments VALUES (?, ?, ?, ?, ?, 'OMR', ?, ?, ?, ?, ?)").bind(`demo-pay-${index + 1}`, userId, invoiceId, `WZN-PAY-2026-00${index + 1}`, amount + tax, index === 1 ? "card" : "bank_transfer", index === 2 ? "pending" : "succeeded", index === 2 ? "unsettled" : "settled", atOffset(-3 - index), atOffset(-3 - index)),
        );
      }
    });
    await db.batch(statements);
  }

  const docCount = await db.prepare("SELECT COUNT(*) AS count FROM documents WHERE owner_user_id=?").bind(user.id).first<{ count: number }>();
  if ((docCount?.count ?? 0) === 0) {
    const docs = [
      ["receipt", "WZN-RCV-2026-0001", "خالد محمد", "مساهمة رحلة العائلة لشهر أغسطس", 5000],
      ["disbursement", "WZN-PAY-2026-0001", "شركة السفر", "دفعة حجز تذاكر العائلة", 60000],
      ["handover", "WZN-HND-2026-0001", "أحمد محمد", "تسليم فائض شخصي مسترد", 3000],
      ["member_statement", "WZN-STM-2026-0001", "فاطمة محمد", "كشف حساب عضو حتى أغسطس 2026", 0],
    ] as const;
    const suffix = user.id.replace(/[^a-zA-Z0-9]/g, "").slice(-8) || "user";
    await db.batch(docs.map((doc, index) => db.prepare(
      "INSERT OR IGNORE INTO documents VALUES (?,?,NULL,?,?,?,?,?,'OMR','issued','bank_transfer',?,?,?)",
    ).bind(id(), user.id, doc[0], `${doc[1]}-${suffix}`, doc[2], doc[3], doc[4], user.displayName, atOffset(-index * 2), now)));
    for (const key of ["receipt-2026", "disbursement-2026", "handover-2026", "member_statement-2026"]) {
      await db.prepare("INSERT OR IGNORE INTO document_sequences VALUES (?,1)").bind(key).run();
    }
  }
}

async function roleOf(db: D1Database, userId: string) {
  return (await db.prepare("SELECT role FROM platform_roles WHERE user_id=?").bind(userId).first<{ role: string }>())?.role ?? "customer";
}

function parseFeatures(row: Record<string, unknown>) {
  try { return { ...row, features: JSON.parse(String(row.features_json ?? "[]")) }; }
  catch { return { ...row, features: [] }; }
}

async function publicPlans(db: D1Database) {
  const rows = await db.prepare("SELECT * FROM plans WHERE is_active=1 ORDER BY sort_order").all<Record<string, unknown>>();
  return rows.results.map(parseFeatures);
}

async function adminData(db: D1Database) {
  const [users, subscriptions, invoices, payments, coupons, plans, roles, logs, spaceCount, memberCount, txnCount, countryCount, monthly, alerts] = await Promise.all([
    db.prepare(`SELECT u.id,u.email,u.display_name,u.created_at,p.status,p.country,p.last_seen_at,
      s.id AS subscription_id,s.status AS subscription_status,s.billing_cycle,
      s.current_period_start,s.current_period_end,pl.name_ar AS plan_name,pl.id AS plan_id
      FROM users u LEFT JOIN customer_profiles p ON p.user_id=u.id
      LEFT JOIN subscriptions s ON s.user_id=u.id LEFT JOIN plans pl ON pl.id=s.plan_id ORDER BY u.created_at DESC`).all(),
    db.prepare("SELECT * FROM subscriptions ORDER BY created_at DESC").all(),
    db.prepare("SELECT i.*,u.display_name,u.email FROM invoices i LEFT JOIN users u ON u.id=i.user_id ORDER BY i.created_at DESC").all(),
    db.prepare("SELECT p.*,u.display_name,u.email FROM payments p LEFT JOIN users u ON u.id=p.user_id ORDER BY p.occurred_at DESC").all(),
    db.prepare("SELECT * FROM coupons ORDER BY created_at DESC").all(),
    db.prepare("SELECT * FROM plans ORDER BY sort_order").all<Record<string, unknown>>(),
    db.prepare("SELECT r.*,u.display_name,u.email FROM platform_roles r LEFT JOIN users u ON u.id=r.user_id ORDER BY r.created_at").all(),
    db.prepare("SELECT a.id,a.user_id,a.action,a.entity_type,a.entity_id,a.created_at,u.display_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 30").all(),
    db.prepare("SELECT COUNT(*) AS count FROM spaces").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM members WHERE COALESCE(status,'active')='active'").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE COALESCE(status,'approved')='approved'").first<{ count: number }>(),
    db.prepare("SELECT COUNT(DISTINCT COALESCE(country,'UN')) AS count FROM customer_profiles").first<{ count: number }>(),
    db.prepare(`SELECT substr(occurred_at,1,7) AS month, SUM(amount_minor) AS total
      FROM payments WHERE status='succeeded' GROUP BY substr(occurred_at,1,7) ORDER BY month DESC LIMIT 12`).all<{ month: string; total: number }>(),
    computeAdminAlerts(db),
  ]);
  return {
    users: users.results, subscriptions: subscriptions.results, invoices: invoices.results,
    payments: payments.results, coupons: coupons.results,
    plans: plans.results.map(parseFeatures), roles: roles.results, logs: logs.results,
    alerts,
    platform: {
      spaces: Number(spaceCount?.count ?? 0),
      members: Number(memberCount?.count ?? 0),
      transactions: Number(txnCount?.count ?? 0),
      countries: Number(countryCount?.count ?? 0),
      monthlyRevenue: [...monthly.results].reverse(),
    },
  };
}

async function scopedAdminData(db: D1Database, role: string, scope: string) {
  if (!["super_admin", "admin", "support", "finance"].includes(role)) throw new ApiError(403, "FORBIDDEN");

  const loadPaymentsScope = async () => {
    const [subscriptions, invoices, payments, plans] = await Promise.all([
      db.prepare("SELECT * FROM subscriptions ORDER BY created_at DESC LIMIT 200").all(),
      db.prepare("SELECT i.*,u.display_name,u.email FROM invoices i LEFT JOIN users u ON u.id=i.user_id ORDER BY i.created_at DESC LIMIT 200").all(),
      db.prepare("SELECT p.*,u.display_name,u.email FROM payments p LEFT JOIN users u ON u.id=p.user_id ORDER BY p.occurred_at DESC LIMIT 200").all(),
      db.prepare("SELECT * FROM plans ORDER BY sort_order").all<Record<string, unknown>>(),
    ]);
    return {
      users: [] as unknown[],
      subscriptions: subscriptions.results,
      invoices: invoices.results,
      payments: payments.results,
      coupons: [] as unknown[],
      plans: plans.results.map(parseFeatures),
      roles: [] as unknown[],
      logs: [] as unknown[],
    };
  };

  const loadReportsScope = async () => {
    const [users, subscriptions, invoices, payments, plans] = await Promise.all([
      db.prepare("SELECT COALESCE(p.status,'active') AS status FROM users u LEFT JOIN customer_profiles p ON p.user_id=u.id").all(),
      db.prepare("SELECT * FROM subscriptions ORDER BY created_at DESC LIMIT 200").all(),
      db.prepare("SELECT id,status,total_minor,created_at FROM invoices ORDER BY created_at DESC LIMIT 200").all(),
      db.prepare("SELECT id,status,amount_minor,occurred_at FROM payments ORDER BY occurred_at DESC LIMIT 200").all(),
      db.prepare("SELECT * FROM plans ORDER BY sort_order").all<Record<string, unknown>>(),
    ]);
    return {
      users: users.results,
      subscriptions: subscriptions.results,
      invoices: invoices.results,
      payments: payments.results,
      coupons: [] as unknown[],
      plans: plans.results.map(parseFeatures),
      roles: [] as unknown[],
      logs: [] as unknown[],
    };
  };

  if (["super_admin", "admin"].includes(role)) {
    if (scope === "payments") return loadPaymentsScope();
    if (scope === "reports") return loadReportsScope();
    return adminData(db);
  }

  const empty = { users: [], subscriptions: [], invoices: [], payments: [], coupons: [], plans: [], roles: [], logs: [] };
  if (scope === "users" && role === "support") {
    const data = await adminData(db);
    return { ...empty, users: data.users, subscriptions: data.subscriptions, plans: data.plans };
  }
  if (scope === "payments" && role === "finance") {
    const data = await loadPaymentsScope();
    return { ...empty, subscriptions: data.subscriptions, invoices: data.invoices, payments: data.payments, plans: data.plans };
  }
  if (scope === "reports" && role === "finance") {
    const data = await loadReportsScope();
    return { ...empty, users: data.users, subscriptions: data.subscriptions, invoices: data.invoices, payments: data.payments, plans: data.plans };
  }
  throw new ApiError(403, "FORBIDDEN");
}

export async function GET(request: Request) {
  try {
    const db = getRawDb();
    await ensureSchema(db);
    await seedPlans(db);
    const url = new URL(request.url);
    const view = url.searchParams.get("view") ?? "pricing";
    if (view === "pricing") return Response.json({ plans: await publicPlans(db) });

    const user = await authenticateRequest(db, request);
    if (!user) return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    await seedCommercialData(db, user);
    const role = await roleOf(db, user.id);
    const responseHeaders = new Headers({ "Cache-Control": "no-store" });
    const issued = user.authType === "session" ? await issueCsrfToken(db, request) : null;
    if (issued) responseHeaders.append("Set-Cookie", csrfCookie(issued.csrfToken, issued.expiresAt));

    if (view === "documents") {
      assertApiScope(user, "documents:read");
      const entitlements = await getActivePlanEntitlements(db, user.id);
      if (!planHasFeature(entitlements.features, "documents")) {
        return Response.json({ user, role, documents: [], spaces: [], entitlements }, { headers: responseHeaders });
      }
      const [documents, spaces] = await Promise.all([
        db.prepare(`SELECT * FROM documents
          WHERE owner_user_id=? OR space_id IN (
            SELECT s.id FROM spaces s LEFT JOIN members m ON m.space_id=s.id AND m.status='active'
            WHERE s.owner_user_id=? OR m.user_id=?
          )
          ORDER BY issued_at DESC`).bind(user.id, user.id, user.id).all(),
        db.prepare(`SELECT s.id,s.name_ar,s.name_en,s.type,s.currency FROM spaces s
          WHERE s.owner_user_id=? OR EXISTS (
            SELECT 1 FROM members m WHERE m.space_id=s.id AND m.status='active' AND m.user_id=?
          )
          ORDER BY s.created_at`).bind(user.id, user.id).all(),
      ]);
      const allowedSpaces = (spaces.results ?? []).filter((space) => planAllowsSpaceType(entitlements.features, String(space.type)));
      const allowedIds = new Set(allowedSpaces.map((space) => String(space.id)));
      const allowedDocs = (documents.results ?? []).filter((doc) => !doc.space_id || allowedIds.has(String(doc.space_id)));
      return Response.json({ user, role, documents: allowedDocs, spaces: allowedSpaces, entitlements }, { headers: responseHeaders });
    }
    if (view === "billing") {
      assertApiScope(user, "billing:read");
      const { ensurePendingPlanColumns } = await import("../../../lib/plan-change");
      await ensurePendingPlanColumns(db);
      const [subscription, invoices, payments, plans] = await Promise.all([
        db.prepare("SELECT s.*,p.name_ar,p.name_en,p.wallet_limit,p.member_limit,p.transaction_limit,p.record_limit,p.user_limit,p.daily_transaction_limit,p.monthly_transaction_limit,p.print_limit,p.sort_order, pending_plan.name_ar AS pending_plan_name_ar, pending_plan.name_en AS pending_plan_name_en FROM subscriptions s JOIN plans p ON p.id=s.plan_id LEFT JOIN plans pending_plan ON pending_plan.id=s.pending_plan_id WHERE s.user_id=? ORDER BY s.created_at DESC LIMIT 1").bind(user.id).first(),
        db.prepare("SELECT id,subscription_id,reference,subtotal_minor,discount_minor,tax_minor,total_minor,currency,status,due_at,paid_at,created_at,target_plan_id,target_billing_cycle FROM invoices WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all(),
        db.prepare("SELECT id,invoice_id,reference,amount_minor,currency,method,status,settlement_status,occurred_at FROM payments WHERE user_id=? ORDER BY occurred_at DESC").bind(user.id).all(),
        publicPlans(db),
      ]);
      return Response.json({ user, role, subscription, invoices: invoices.results, payments: payments.results, plans, entitlements: await getActivePlanEntitlements(db, user.id) }, { headers: responseHeaders });
    }
    if (view === "security") {
      if (user.authType === "api_key") throw new ApiError(403, "SESSION_AUTH_REQUIRED");
      const keys = await db.prepare("SELECT id,name,key_prefix,scopes_json,expires_at,last_used_at,revoked_at,created_at FROM api_keys WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all<Record<string, unknown>>();
      return Response.json({ user, role, apiKeys: keys.results.map((row) => ({ ...row, scopes: JSON.parse(String(row.scopes_json ?? "[]")), scopes_json: undefined })) }, { headers: responseHeaders });
    }
    if (view === "export") {
      assertApiScope(user, "data:export");
      const entitlements = await getActivePlanEntitlements(db, user.id);
      if (!planHasFeature(entitlements.features, "exports")) throw new ApiError(403, "PLAN_FEATURE_REQUIRED");
      const spaces = await db.prepare("SELECT * FROM spaces WHERE owner_user_id=? ORDER BY created_at").bind(user.id).all<Record<string, unknown>>();
      const allowedSpaces = filterSpacesForPlanAccess(
        (spaces.results ?? []).map((space) => ({ ...space, id: String(space.id ?? ""), type: String(space.type ?? ""), grace_until: space.grace_until == null ? null : String(space.grace_until), status: space.status == null ? null : String(space.status) })),
        entitlements.features,
      );
      const ids = allowedSpaces.map((space) => space.id); const placeholders = ids.map(() => "?").join(",");
      const [members, transactions, documents, subscriptions, invoices, payments] = await Promise.all([
        ids.length ? db.prepare(`SELECT * FROM members WHERE space_id IN (${placeholders})`).bind(...ids).all() : Promise.resolve({ results: [] }),
        ids.length ? db.prepare(`SELECT * FROM transactions WHERE space_id IN (${placeholders}) ORDER BY occurred_at`).bind(...ids).all() : Promise.resolve({ results: [] }),
        db.prepare("SELECT * FROM documents WHERE owner_user_id=? ORDER BY issued_at").bind(user.id).all<{ space_id?: string | null }>(),
        db.prepare("SELECT * FROM subscriptions WHERE user_id=? ORDER BY created_at").bind(user.id).all(),
        db.prepare("SELECT * FROM invoices WHERE user_id=? ORDER BY created_at").bind(user.id).all(),
        db.prepare("SELECT * FROM payments WHERE user_id=? ORDER BY occurred_at").bind(user.id).all(),
      ]);
      const allowedIds = new Set(ids);
      const allowedDocs = (documents.results ?? []).filter((doc) => !doc.space_id || allowedIds.has(String(doc.space_id)));
      const exportData = { exportedAt: isoNow(), user, spaces: allowedSpaces, members: members.results, transactions: transactions.results, documents: allowedDocs, subscriptions: subscriptions.results, invoices: invoices.results, payments: payments.results };
      responseHeaders.set("Content-Type", "application/json; charset=utf-8");
      responseHeaders.set("Content-Disposition", `attachment; filename="wazen-export-${new Date().toISOString().slice(0, 10)}.json"`);
      return new Response(JSON.stringify(exportData, null, 2), { headers: responseHeaders });
    }
    if (view === "admin") {
      if (user.authType === "api_key") throw new ApiError(403, "SESSION_AUTH_REQUIRED");
      const scope = url.searchParams.get("scope") ?? "overview";
      if (scope === "console") {
        if (!["super_admin", "admin"].includes(role)) throw new ApiError(403, "FORBIDDEN");
        const [core, gateways, tenantsPage] = await Promise.all([
          scopedAdminData(db, role, "overview"),
          listGatewaysWithPlans(db),
          listAdminTenants(db, { page: 1, pageSize: 25 }),
        ]);
        return Response.json({ user, role, ...core, gateways, tenantsPage }, { headers: responseHeaders });
      }
      if (scope === "overview" && !["super_admin", "admin"].includes(role)) throw new ApiError(403, "FORBIDDEN");
      if (scope === "users") {
        assertPlatformPermission(role, "users:read");
        if (!["super_admin", "admin", "support"].includes(role)) throw new ApiError(403, "FORBIDDEN");
        const userId = url.searchParams.get("userId");
        if (userId) {
          const detail = await getAdminUserDetail(db, userId);
          if (!detail) throw new ApiError(404, "USER_NOT_FOUND");
          const plans = await listAdminPlans(db);
          return Response.json({ user, role, detail, plans }, { headers: responseHeaders });
        }
        const usersPage = await listAdminUsers(db, {
          q: url.searchParams.get("q") ?? undefined,
          status: (url.searchParams.get("status") as "active" | "suspended" | "closed" | "all" | null) ?? "all",
          page: Number(url.searchParams.get("page") ?? 1),
          pageSize: Number(url.searchParams.get("pageSize") ?? 25),
        });
        const base = await scopedAdminData(db, role, scope);
        return Response.json({ user, role, ...base, usersPage }, { headers: responseHeaders });
      }
      if (scope === "tenants") {
        assertPlatformPermission(role, "users:read");
        if (!["super_admin", "admin", "support"].includes(role)) throw new ApiError(403, "FORBIDDEN");
        const tenantId = url.searchParams.get("tenantId");
        if (tenantId) {
          const detail = await getAdminTenantDetail(db, tenantId);
          if (!detail) throw new ApiError(404, "TENANT_NOT_FOUND");
          return Response.json({ user, role, detail }, { headers: responseHeaders });
        }
        const tenantsPage = await listAdminTenants(db, {
          q: url.searchParams.get("q") ?? undefined,
          page: Number(url.searchParams.get("page") ?? 1),
          pageSize: Number(url.searchParams.get("pageSize") ?? 25),
        });
        return Response.json({ user, role, tenantsPage }, { headers: responseHeaders });
      }
      if (scope === "payments") assertPlatformPermission(role, "billing:read");
      if (scope === "reports") assertPlatformPermission(role, "reports:read");
      if (scope === "gateways") {
        assertPlatformPermission(role, "providers:write");
        const gateways = await listGatewaysWithPlans(db);
        const plans = await listAdminPlans(db);
        return Response.json({ user, role, gateways, plans }, { headers: responseHeaders });
      }
      if (scope === "plans") {
        assertPlatformPermission(role, "plans:write");
        const plans = await listAdminPlans(db);
        const gateways = await listGatewaysWithPlans(db);
        return Response.json({ user, role, plans, gateways }, { headers: responseHeaders });
      }
      return Response.json({ user, role, ...(await scopedAdminData(db, role, scope)) }, { headers: responseHeaders });
    }
    return Response.json({ user, role }, { headers: responseHeaders });
  } catch (error) { return errorResponse(error); }
}

const documentPrefixes: Record<string, string> = {
  receipt: "RCV", disbursement: "PAY", handover: "HND", member_statement: "MEM",
  society_statement: "SOC", trip_statement: "TRP", household_statement: "HOM", personal_report: "PER",
};

export async function POST(request: Request) {
  let claimed: { db: D1Database; userId: string; key: string } | null = null;
  try {
    enforceWriteRequest(request);
    const db = getRawDb(); await ensureSchema(db); await seedPlans(db);
    await rateLimit(db, request, "platform-write", 90, 60);
    const payload = (await request.json()) as Record<string, unknown>;
    const action = String(payload.action ?? "");

    if (action === "validateCoupon") {
      const code = String(payload.code ?? "").trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,20}$/.test(code)) return Response.json({ valid: false, coupon: null });
      const coupon = await db.prepare(`SELECT code,discount_type,value,expires_at FROM coupons c WHERE code=? AND is_active=1 AND
        used_count+(SELECT COUNT(*) FROM coupon_redemptions r WHERE r.coupon_id=c.id AND r.status='reserved')<usage_limit`).bind(code).first<Record<string, unknown>>();
      const valid = Boolean(coupon && (!coupon.expires_at || new Date(String(coupon.expires_at)) > new Date()));
      return Response.json({ valid, coupon: valid ? coupon : null });
    }

    const user = await authenticateRequest(db, request);
    if (!user) return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    if (user.authType === "session") await enforceCsrf(db, request);
    await seedCommercialData(db, user);
    const idempotencyKey = String(payload.idempotencyKey ?? request.headers.get("idempotency-key") ?? "");
    const replay = await claimIdempotency(db, user.id, action, idempotencyKey);
    if (replay) return Response.json(replay);
    claimed = { db, userId: user.id, key: idempotencyKey };
    const respond = async (body: Record<string, unknown>) => {
      await completeIdempotency(db, user.id, idempotencyKey, body);
      claimed = null;
      return Response.json(body, { headers: { "Cache-Control": "no-store" } });
    };

    if (action === "selectPlan") {
      if (user.authType === "api_key") throw new ApiError(403, "SESSION_AUTH_REQUIRED");
      const parsed = z.object({ planId: z.string().min(1).max(50), cycle: z.enum(["monthly", "annual"]), coupon: z.string().max(20).optional() }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_PLAN_SELECTION");
      const { selectCustomerPlan } = await import("../../../lib/plan-change");
      return respond(await selectCustomerPlan(db, user, parsed.data) as Record<string, unknown>);
    }

    if (action === "confirmInvoicePayment") {
      if (user.authType === "api_key") throw new ApiError(403, "SESSION_AUTH_REQUIRED");
      const parsed = z.object({ invoiceId: z.string().min(1).max(120) }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_INVOICE");
      const { confirmInvoicePayment } = await import("../../../lib/plan-change");
      return respond(await confirmInvoicePayment(db, user, parsed.data.invoiceId) as Record<string, unknown>);
    }

    if (action === "createDocument") {
      assertApiScope(user, "documents:write");
      const parsed = z.object({ type: z.enum(["receipt", "disbursement", "handover", "member_statement", "society_statement", "trip_statement", "household_statement", "personal_report"]), personName: z.string().trim().min(2).max(120), description: z.string().trim().min(2).max(500), amount: z.union([z.string().min(1).max(40), z.number().nonnegative()]), spaceId: z.string().max(120).optional(), paymentMethod: z.enum(["bank_transfer", "cash", "card", "other"]).default("bank_transfer") }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_DOCUMENT");
      const entitlements = await getActivePlanEntitlements(db, user.id);
      if (!planHasFeature(entitlements.features, "documents")) throw new ApiError(403, "PLAN_FEATURE_REQUIRED");
      await assertOwnerPlanQuota(db, user.id, "record", 1);
      const { type, personName, description } = parsed.data;
      const space = parsed.data.spaceId ? await authorizeSpace(db, user, parsed.data.spaceId, "transact") : null;
      const ownCurrency = await db.prepare("SELECT currency FROM users WHERE id=?").bind(user.id).first<{ currency: string }>();
      const currency = space?.currency ?? ownCurrency?.currency ?? "OMR";
      let amountMinor: number; try { amountMinor = parseNonNegativeMoneyToMinor(parsed.data.amount, currency); } catch { throw new ApiError(400, "INVALID_AMOUNT"); }
      const reference = await nextReference(db, type, documentPrefixes[type] ?? "DOC");
      const documentId = id(); const now = isoNow();
      const tenantId = await ensureDefaultTenant(db, user);
      await db.batch([
        db.prepare("INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,'issued',?,?,?,?)")
          .bind(documentId, user.id, parsed.data.spaceId ?? null, type, reference, personName, description, amountMinor, currency, parsed.data.paymentMethod, user.displayName, now, now),
        db.prepare("INSERT INTO tenant_resources (tenant_id,resource_type,resource_id,created_at) VALUES (?,?,?,?)").bind(tenantId, "document", documentId, now),
        prepareAudit(db, { userId: user.id, action: "document.created", entityType: "document", entityId: documentId, metadata: { reference, type }, createdAt: now }),
      ]);
      const document = await db.prepare("SELECT * FROM documents WHERE id=?").bind(documentId).first();
      return respond({ ok: true, document: document as Record<string, unknown> });
    }

    if (action === "inviteMember") {
      const parsed = z.object({ spaceId: z.string().min(1).max(120), email: z.email().max(254), role: z.enum(["member", "treasurer", "manager", "auditor", "viewer"]) }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_INVITATION");
      const spaceId = parsed.data.spaceId; const email = normalizeEmail(parsed.data.email); const role = parsed.data.role;
      await authorizeSpace(db, user, spaceId, "members:write");
      const plan = await db.prepare(`SELECT p.member_limit FROM subscriptions s JOIN plans p ON p.id=s.plan_id
        WHERE s.user_id=? AND s.status IN ('active','trialing') ORDER BY s.created_at DESC LIMIT 1`).bind(user.id).first<{ member_limit: number }>();
      const memberCount = await db.prepare(`SELECT (SELECT COUNT(*) FROM members WHERE space_id=? AND status='active') +
        (SELECT COUNT(*) FROM invites WHERE space_id=? AND status='pending' AND expires_at>?) AS count`).bind(spaceId, spaceId, isoNow()).first<{ count: number }>();
      if (Number(memberCount?.count ?? 0) >= Number(plan?.member_limit ?? 2)) throw new ApiError(403, "PLAN_MEMBER_LIMIT");
      const owner = await db.prepare("SELECT owner_user_id FROM spaces WHERE id=?").bind(spaceId).first<{ owner_user_id: string }>();
      if (owner?.owner_user_id) {
        const pending = await db.prepare(
          `SELECT COUNT(*) AS count FROM invites i JOIN spaces s ON s.id=i.space_id
           WHERE s.owner_user_id=? AND i.status='pending' AND i.expires_at>?`,
        ).bind(owner.owner_user_id, isoNow()).first<{ count: number }>();
        await assertOwnerPlanQuota(db, owner.owner_user_id, "user", 1 + Number(pending?.count ?? 0));
      }
      const duplicate = await db.prepare("SELECT id FROM invites WHERE space_id=? AND email=? COLLATE NOCASE AND status='pending' AND expires_at>?").bind(spaceId, email, isoNow()).first();
      if (duplicate) throw new ApiError(409, "INVITATION_EXISTS");
      const invitationId = id(); const token = id().replaceAll("-", "") + id().replaceAll("-", ""); const tokenHash = await sha256(token); const createdAt = isoNow();
      const origin = appOrigin(request);
      await db.batch([
        db.prepare("INSERT INTO invites VALUES (?,?,?,?,?,'pending',?,?,?)").bind(invitationId, spaceId, email, role, tokenHash, atOffset(7), user.id, createdAt),
        db.prepare("INSERT INTO email_outbox (id,recipient,template,payload_json,status,created_at) VALUES (?,?,?,?,'pending',?)")
          .bind(id(), email, "member_invitation", JSON.stringify({ invitationId, inviter: user.displayName, link: `${origin}/invite?token=${encodeURIComponent(token)}` }), createdAt),
        prepareAudit(db, { userId: user.id, action: "member.invited", entityType: "invite", entityId: invitationId, metadata: { spaceId, email, role }, createdAt }),
      ]);
      return respond({ ok: true, invitation: { id: invitationId, email, role, delivery: "queued" } });
    }

    if (action === "acceptInvite") {
      if (user.authType === "api_key") throw new ApiError(403, "SESSION_AUTH_REQUIRED");
      const parsed = z.object({ token: z.string().min(40).max(200) }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_INVITATION");
      const invitation = await db.prepare("SELECT * FROM invites WHERE token=? AND status='pending' AND expires_at>?").bind(await sha256(parsed.data.token), isoNow()).first<{ id: string; space_id: string; email: string; role: string }>();
      if (!invitation || normalizeEmail(invitation.email) !== normalizeEmail(user.email)) throw new ApiError(404, "INVITATION_NOT_FOUND");
      const spaceOwner = await db.prepare("SELECT owner_user_id FROM spaces WHERE id=?").bind(invitation.space_id).first<{ owner_user_id: string }>();
      const alreadyLinked = await db.prepare("SELECT id FROM members WHERE space_id=? AND user_id=? AND status='active'").bind(invitation.space_id, user.id).first();
      if (spaceOwner?.owner_user_id && !alreadyLinked) await assertOwnerPlanQuota(db, spaceOwner.owner_user_id, "user", 1);
      const createdAt = isoNow();
      const ledgerMember = await db.prepare("SELECT id FROM members WHERE space_id=? AND email=? COLLATE NOCASE AND user_id IS NULL LIMIT 1").bind(invitation.space_id, user.email).first<{ id: string }>();
      const contribution = await db.prepare("SELECT amount_minor,duration_months FROM contribution_plans WHERE space_id=? LIMIT 1").bind(invitation.space_id).first<{ amount_minor: number; duration_months: number }>();
      const dueMinor = multiplyMinor(Number(contribution?.amount_minor ?? 0), Number(contribution?.duration_months ?? 0));
      const memberStatement = ledgerMember
        ? db.prepare("UPDATE members SET user_id=?,display_name=?,role=?,status='active' WHERE id=?").bind(user.id, user.displayName, invitation.role, ledgerMember.id)
        : db.prepare("INSERT INTO members (id,space_id,user_id,display_name,email,role,status,due_minor,paid_minor,extra_minor,avatar,joined_at) VALUES (?,?,?,?,?,?,'active',?,0,0,'#0f766e',?)").bind(id(), invitation.space_id, user.id, user.displayName, user.email, invitation.role, dueMinor, createdAt);
      await db.batch([
        memberStatement,
        db.prepare("UPDATE invites SET status='accepted' WHERE id=?").bind(invitation.id),
        prepareAudit(db, { userId: user.id, action: "member.invite_accepted", entityType: "invite", entityId: invitation.id, metadata: { spaceId: invitation.space_id }, createdAt }),
      ]);
      return respond({ ok: true, spaceId: invitation.space_id });
    }

    if (action === "createApiKey") {
      if (user.authType === "api_key") throw new ApiError(403, "SESSION_AUTH_REQUIRED");
      const allowedScopes = ["wallets:read", "wallets:write", "members:write", "circles:write", "settlements:write", "documents:read", "documents:write", "billing:read", "data:export"] as const;
      const parsed = z.object({ name: z.string().trim().min(2).max(80), scopes: z.array(z.enum(allowedScopes)).min(1).max(9), expiresInDays: z.number().int().min(1).max(365).default(90) }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_API_KEY");
      const count = await db.prepare("SELECT COUNT(*) AS count FROM api_keys WHERE user_id=? AND revoked_at IS NULL").bind(user.id).first<{ count: number }>();
      if (Number(count?.count ?? 0) >= 10) throw new ApiError(409, "API_KEY_LIMIT");
      const rawToken = `wzn_live_${createSessionToken()}`; const keyId = id(); const now = isoNow(); const tenantId = await ensureDefaultTenant(db, user);
      const prefix = rawToken.slice(0, 18); const expiresAt = atOffset(parsed.data.expiresInDays);
      await db.batch([
        db.prepare("INSERT INTO api_keys (id,user_id,tenant_id,name,key_prefix,token_hash,scopes_json,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
          .bind(keyId, user.id, tenantId, parsed.data.name, prefix, await sha256(rawToken), JSON.stringify([...new Set(parsed.data.scopes)]), expiresAt, now),
        prepareAudit(db, { userId: user.id, action: "security.api_key_created", entityType: "api_key", entityId: keyId, metadata: { name: parsed.data.name, scopes: parsed.data.scopes, expiresAt }, createdAt: now }),
      ]);
      const replayBody = { ok: true, apiKey: { id: keyId, name: parsed.data.name, prefix, scopes: parsed.data.scopes, expiresAt, replayed: true } };
      await completeIdempotency(db, user.id, idempotencyKey, replayBody); claimed = null;
      return Response.json({ ok: true, apiKey: { id: keyId, name: parsed.data.name, prefix, scopes: parsed.data.scopes, expiresAt, token: rawToken } }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "revokeApiKey") {
      if (user.authType === "api_key") throw new ApiError(403, "SESSION_AUTH_REQUIRED");
      const keyId = String(payload.apiKeyId ?? ""); if (!keyId) throw new ApiError(400, "INVALID_API_KEY");
      const now = isoNow(); const result = await db.prepare("UPDATE api_keys SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL").bind(now, keyId, user.id).run();
      if (Number(result.meta.changes) !== 1) throw new ApiError(404, "API_KEY_NOT_FOUND");
      await writeAudit(db, { userId: user.id, action: "security.api_key_revoked", entityType: "api_key", entityId: keyId, createdAt: now });
      return respond({ ok: true });
    }

    if (action === "savePaymentProvider") {
      if (user.authType === "api_key") throw new ApiError(403, "SESSION_AUTH_REQUIRED");
      const actorRole = await roleOf(db, user.id); assertPlatformPermission(actorRole, "providers:write");
      const parsed = z.object({ provider: z.string().regex(/^[a-z0-9_-]{2,40}$/), endpointUrl: z.string().max(500), config: z.record(z.string(), z.union([z.string().max(2000), z.number(), z.boolean()])) }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_PROVIDER_CONFIG");
      const endpoint = validateOutboundHttpsUrl(parsed.data.endpointUrl, configuredAllowedHosts("payment"));
      const serialized = JSON.stringify(parsed.data.config); if (serialized.length > 16_000) throw new ApiError(413, "PROVIDER_CONFIG_TOO_LARGE");
      const tenantId = await ensureDefaultTenant(db, user); const now = isoNow(); const keyring = loadKeyring();
      const encrypted = await encryptSecret(serialized, `payment-provider:${parsed.data.provider}`, keyring);
      await db.batch([
        db.prepare(`INSERT INTO payment_provider_settings (tenant_id,provider,endpoint_url,encrypted_config,key_version,updated_by,updated_at) VALUES (?,?,?,?,?,?,?)
          ON CONFLICT(tenant_id,provider) DO UPDATE SET endpoint_url=excluded.endpoint_url,encrypted_config=excluded.encrypted_config,key_version=excluded.key_version,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
          .bind(tenantId, parsed.data.provider, endpoint.toString(), encrypted, keyring.active, user.id, now),
        prepareAudit(db, { userId: user.id, action: "payment_provider.updated", entityType: "payment_provider", entityId: parsed.data.provider, metadata: { hostname: endpoint.hostname }, createdAt: now }),
      ]);
      return respond({ ok: true, provider: parsed.data.provider, hostname: endpoint.hostname });
    }

    const actorRole = await roleOf(db, user.id);
    if (["setUserStatus", "setRole", "setPaymentStatus", "createCoupon", "revokeUserSessions", "updateGateway", "upsertPlan", "adminUpdateSubscription", "adminVerifyEmail", "adminUpdateUser", "restoreRetentionArchive", "adminBlockIp", "adminUnblockIp", "adminTrustIp", "revokeSessionsByIp"].includes(action) && user.authType === "api_key") throw new ApiError(403, "SESSION_AUTH_REQUIRED");
    if (action === "setUserStatus") {
      assertPlatformPermission(actorRole, "users:status");
      const targetUserId = String(payload.userId ?? "");
      const status = String(payload.status ?? "active");
      if (!targetUserId || !["active", "suspended", "closed"].includes(status) || targetUserId === user.id) throw new ApiError(400, "INVALID_STATUS_CHANGE");
      await db.prepare("UPDATE customer_profiles SET status=? WHERE user_id=?").bind(status, targetUserId).run();
      if (status !== "active") await db.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(targetUserId).run();
      await writeAudit(db, { userId: user.id, action: "customer.status_changed", entityType: "user", entityId: targetUserId, metadata: { status } });
    } else if (action === "revokeUserSessions") {
      assertPlatformPermission(actorRole, "users:status");
      const targetUserId = String(payload.userId ?? "");
      const reason = String(payload.reason ?? "").trim().slice(0, 300);
      if (!targetUserId || targetUserId === user.id) throw new ApiError(400, "INVALID_SESSION_REVOKE");
      if (reason.length < 3) throw new ApiError(400, "REASON_REQUIRED");
      const result = await db.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(targetUserId).run();
      await writeAudit(db, { userId: user.id, action: "admin.sessions_revoked", entityType: "user", entityId: targetUserId, metadata: { reason, deleted: Number(result.meta.changes ?? 0) } });
    } else if (action === "setRole") {
      if (actorRole !== "super_admin") throw new ApiError(403, "FORBIDDEN");
      const targetUserId = String(payload.userId ?? "");
      const role = String(payload.role ?? "customer");
      if (!targetUserId || !["customer", "support", "finance", "admin", "super_admin"].includes(role)) throw new ApiError(400, "INVALID_ROLE");
      if (targetUserId === user.id && role !== "super_admin") throw new ApiError(400, "CANNOT_DEMOTE_SELF");
      const current = await db.prepare("SELECT role FROM platform_roles WHERE user_id=?").bind(targetUserId).first<{ role: string }>();
      if (current?.role === "super_admin" && role !== "super_admin") {
        const remaining = await db.prepare("SELECT COUNT(*) AS count FROM platform_roles WHERE role='super_admin' AND user_id<>?").bind(targetUserId).first<{ count: number }>();
        if (Number(remaining?.count ?? 0) < 1) throw new ApiError(409, "LAST_SUPER_ADMIN");
      }
      await db.prepare("UPDATE platform_roles SET role=?,updated_at=? WHERE user_id=?").bind(role, isoNow(), targetUserId).run();
      await writeAudit(db, { userId: user.id, action: "admin.role_changed", entityType: "user", entityId: targetUserId, metadata: { role } });
    } else if (action === "setPaymentStatus") {
      assertPlatformPermission(actorRole, "payments:write");
      const paymentId = String(payload.paymentId ?? "");
      const status = String(payload.status ?? "succeeded");
      const payment = await db.prepare("SELECT status,invoice_id FROM payments WHERE id=?").bind(paymentId).first<{ status: string; invoice_id: string | null }>();
      const transitions: Record<string, string[]> = { pending: ["succeeded", "failed"], failed: ["pending"], succeeded: ["refunded"], refunded: [] };
      if (!payment || !transitions[payment.status]?.includes(status)) throw new ApiError(409, "INVALID_PAYMENT_TRANSITION");
      const statements: D1PreparedStatement[] = [db.prepare("UPDATE payments SET status=?,settlement_status=? WHERE id=?").bind(status, status === "succeeded" ? "settled" : "unsettled", paymentId)];
      if (payment.invoice_id && status === "succeeded") statements.push(
        db.prepare("UPDATE invoices SET status='paid',paid_at=? WHERE id=?").bind(isoNow(), payment.invoice_id),
        db.prepare("UPDATE subscriptions SET status='active',updated_at=? WHERE id=(SELECT subscription_id FROM invoices WHERE id=?)").bind(isoNow(), payment.invoice_id),
        db.prepare("UPDATE coupons SET used_count=used_count+1 WHERE id=(SELECT coupon_id FROM coupon_redemptions WHERE invoice_id=? AND status='reserved')").bind(payment.invoice_id),
        db.prepare("UPDATE coupon_redemptions SET status='redeemed',redeemed_at=? WHERE invoice_id=? AND status='reserved'").bind(isoNow(), payment.invoice_id),
      );
      if (payment.invoice_id && status === "refunded") statements.push(db.prepare("UPDATE invoices SET status='refunded' WHERE id=?").bind(payment.invoice_id));
      await db.batch(statements);
      await writeAudit(db, { userId: user.id, action: "payment.status_changed", entityType: "payment", entityId: paymentId, metadata: { status } });
    } else if (action === "createCoupon") {
      assertPlatformPermission(actorRole, "coupons:write");
      const code = String(payload.code ?? "").trim().toUpperCase();
      const value = Math.max(1, Math.min(100, Number(payload.value ?? 0)));
      if (!/^[A-Z0-9_-]{3,20}$/.test(code) || !Number.isFinite(value)) throw new ApiError(400, "INVALID_COUPON");
      await db.prepare("INSERT INTO coupons VALUES (?,?,'percent',?,100,0,?,1,?)").bind(id(), code, value, atOffset(90), isoNow()).run();
      await writeAudit(db, { userId: user.id, action: "coupon.created", entityType: "coupon", entityId: code, metadata: { value } });
    } else if (action === "updateGateway") {
      assertPlatformPermission(actorRole, "providers:write");
      const gatewayId = String(payload.gatewayId ?? "");
      if (!gatewayId) throw new ApiError(400, "INVALID_GATEWAY");
      const planIds = Array.isArray(payload.planIds) ? payload.planIds.map(String) : undefined;
      const gateways = await updatePaymentGateway(db, {
        gatewayId,
        isEnabled: payload.isEnabled === undefined ? undefined : Boolean(payload.isEnabled),
        isTestMode: payload.isTestMode === undefined ? undefined : Boolean(payload.isTestMode),
        sortOrder: payload.sortOrder === undefined ? undefined : Number(payload.sortOrder),
        planIds,
      });
      if (!gateways) throw new ApiError(404, "GATEWAY_NOT_FOUND");
      await writeAudit(db, { userId: user.id, action: "gateway.updated", entityType: "payment_gateway", entityId: gatewayId, metadata: { isEnabled: payload.isEnabled, planIds } });
      return respond({ ok: true, gateways, plans: await listAdminPlans(db) });
    } else if (action === "upsertPlan") {
      assertPlatformPermission(actorRole, "plans:write");
      const parsed = z.object({
        id: z.string().min(1).max(50).optional(),
        nameAr: z.string().trim().min(2).max(80),
        nameEn: z.string().trim().min(2).max(80),
        descriptionAr: z.string().trim().min(2).max(300),
        descriptionEn: z.string().trim().min(2).max(300),
        monthlyMinor: z.coerce.number().int().min(0).max(10_000_000),
        annualMinor: z.coerce.number().int().min(0).max(100_000_000),
        walletLimit: z.coerce.number().int().min(1).max(9999),
        memberLimit: z.coerce.number().int().min(1).max(9999),
        transactionLimit: z.coerce.number().int().min(0).max(999999).default(0),
        recordLimit: z.coerce.number().int().min(0).max(999999).default(0),
        userLimit: z.coerce.number().int().min(0).max(9999).default(1),
        dailyTransactionLimit: z.coerce.number().int().min(0).max(999999).default(0),
        monthlyTransactionLimit: z.coerce.number().int().min(0).max(999999).default(0),
        printLimit: z.coerce.number().int().min(0).max(999999).default(0),
        features: z.array(z.string().min(1).max(40)).max(40),
        isActive: z.boolean().default(true),
        sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
        gatewayIds: z.array(z.string().min(1).max(80)).max(40).optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_PLAN");
      const result = await upsertAdminPlan(db, parsed.data);
      await writeAudit(db, { userId: user.id, action: "plan.upserted", entityType: "plan", entityId: result.planId, metadata: { features: parsed.data.features } });
      return respond({ ok: true, plans: result.plans, gateways: await listGatewaysWithPlans(db) });
    } else if (action === "adminUpdateSubscription") {
      assertPlatformPermission(actorRole, "plans:write");
      const periodEndRaw = payload.periodEnd;
      let periodEnd: string | undefined;
      if (typeof periodEndRaw === "string" && periodEndRaw.trim()) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(periodEndRaw.trim())) {
          periodEnd = new Date(`${periodEndRaw.trim()}T23:59:59.000Z`).toISOString();
        } else {
          const parsedDate = new Date(periodEndRaw);
          if (Number.isNaN(parsedDate.getTime())) throw new ApiError(400, "INVALID_SUBSCRIPTION_UPDATE");
          periodEnd = parsedDate.toISOString();
        }
      }
      const parsed = z.object({
        userId: z.string().min(1).max(120),
        planId: z.string().min(1).max(50).optional(),
        status: z.enum(["active", "trialing", "pending_payment", "suspended", "cancelled"]).optional(),
        billingCycle: z.enum(["monthly", "annual"]).optional(),
        discountPercent: z.coerce.number().min(0).max(100).optional(),
        discountFixedMinor: z.coerce.number().int().min(0).max(10_000_000).optional(),
        discountLabel: z.string().max(120).nullable().optional(),
        adminNote: z.string().max(500).nullable().optional(),
        gatewayId: z.string().max(80).nullable().optional(),
        pause: z.boolean().optional(),
        featuresGrant: z.array(z.string().min(1).max(40)).max(40).optional(),
        featuresDeny: z.array(z.string().min(1).max(40)).max(40).optional(),
        walletLimitOverride: z.coerce.number().int().min(0).max(9999).nullable().optional(),
        memberLimitOverride: z.coerce.number().int().min(0).max(9999).nullable().optional(),
        transactionLimitOverride: z.coerce.number().int().min(0).max(999999).nullable().optional(),
        recordLimitOverride: z.coerce.number().int().min(0).max(999999).nullable().optional(),
        userLimitOverride: z.coerce.number().int().min(0).max(9999).nullable().optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_SUBSCRIPTION_UPDATE");
      if (!parsed.data.planId) {
        const existing = await db.prepare("SELECT id FROM subscriptions WHERE user_id=? LIMIT 1").bind(parsed.data.userId).first();
        if (!existing) throw new ApiError(400, "PLAN_REQUIRED");
      }
      const billing = await adminUpdateSubscription(db, { ...parsed.data, periodEnd });
      if (!billing) throw new ApiError(404, "SUBSCRIPTION_NOT_FOUND");
      await writeAudit(db, { userId: user.id, action: "subscription.admin_updated", entityType: "user", entityId: parsed.data.userId, metadata: { ...parsed.data, periodEnd: periodEnd ?? null } });
      const detail = await getAdminUserDetail(db, parsed.data.userId);
      return respond({ ok: true, detail, billing });
    } else if (action === "adminVerifyEmail") {
      assertPlatformPermission(actorRole, "users:status");
      const targetUserId = String(payload.userId ?? "");
      if (!targetUserId) throw new ApiError(400, "INVALID_USER");
      const result = await adminVerifyUserEmail(db, targetUserId, user.id);
      if (!result.ok) throw new ApiError(404, result.reason);
      const detail = await getAdminUserDetail(db, targetUserId);
      return respond({ ok: true, detail, verifiedAt: result.verifiedAt, alreadyVerified: result.alreadyVerified });
    } else if (action === "adminUpdateUser") {
      assertPlatformPermission(actorRole, "users:status");
      const parsed = z.object({
        userId: z.string().min(1).max(120),
        displayName: z.string().trim().min(2).max(120).optional(),
        status: z.enum(["active", "suspended", "closed"]).optional(),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_USER_UPDATE");
      if (parsed.data.userId === user.id && parsed.data.status && parsed.data.status !== "active") {
        throw new ApiError(400, "CANNOT_SUSPEND_SELF");
      }
      const detail = await adminUpdateUserProfile(db, { ...parsed.data, actorUserId: user.id });
      if (!detail) throw new ApiError(404, "USER_NOT_FOUND");
      return respond({ ok: true, detail });
    } else if (action === "restoreRetentionArchive") {
      assertPlatformPermission(actorRole, "users:status");
      if (!["super_admin", "admin"].includes(actorRole)) throw new ApiError(403, "FORBIDDEN");
      const parsed = z.object({
        archiveId: z.string().min(1).max(120),
        userId: z.string().min(1).max(120),
        note: z.string().trim().min(3).max(300),
      }).safeParse(payload);
      if (!parsed.success) throw new ApiError(400, "INVALID_RETENTION_RESTORE");
      const { restoreRetentionArchive } = await import("../../../lib/plan-retention");
      const restored = await restoreRetentionArchive(db, parsed.data.archiveId, user.id);
      await writeAudit(db, {
        userId: user.id,
        action: "wallet.retention_restored",
        entityType: "space",
        entityId: restored.spaceId,
        metadata: { archiveId: parsed.data.archiveId, ownerUserId: parsed.data.userId, note: parsed.data.note, paidRestore: true },
      });
      const detail = await getAdminUserDetail(db, parsed.data.userId);
      return respond({ ok: true, detail, restored });
    } else if (action === "adminBlockIp") {
      assertPlatformPermission(actorRole, "users:status");
      const ipHashValue = String(payload.ipHash ?? "");
      const ipMasked = String(payload.ipMasked ?? "***");
      const reason = String(payload.reason ?? "admin_blocked").trim().slice(0, 300);
      const targetUserId = String(payload.userId ?? "");
      if (!ipHashValue || reason.length < 3) throw new ApiError(400, "INVALID_IP_BLOCK");
      await blockIpByHash(db, { ipHash: ipHashValue, ipMasked, reason, blockedBy: user.id, expiresInHours: IP_BLOCK_HOURS });
      if (targetUserId) await db.prepare("DELETE FROM auth_sessions WHERE user_id=? AND ip_hash=?").bind(targetUserId, ipHashValue).run();
      await writeAudit(db, { userId: user.id, action: "admin.ip_blocked", entityType: "user", entityId: targetUserId || ipHashValue, metadata: { ipHash: ipHashValue, ipMasked, reason } });
      const detail = targetUserId ? await getAdminUserDetail(db, targetUserId) : null;
      return respond({ ok: true, detail });
    } else if (action === "adminUnblockIp") {
      assertPlatformPermission(actorRole, "users:status");
      const ipHashValue = String(payload.ipHash ?? "");
      const targetUserId = String(payload.userId ?? "");
      if (!ipHashValue) throw new ApiError(400, "INVALID_IP_BLOCK");
      await unblockIpByHash(db, ipHashValue, user.id);
      await writeAudit(db, { userId: user.id, action: "admin.ip_unblocked", entityType: "user", entityId: targetUserId || ipHashValue, metadata: { ipHash: ipHashValue } });
      const detail = targetUserId ? await getAdminUserDetail(db, targetUserId) : null;
      return respond({ ok: true, detail });
    } else if (action === "adminTrustIp") {
      assertPlatformPermission(actorRole, "users:status");
      const ipHashValue = String(payload.ipHash ?? "");
      const ipMasked = String(payload.ipMasked ?? "***");
      const targetUserId = String(payload.userId ?? "");
      if (!ipHashValue) throw new ApiError(400, "INVALID_IP_BLOCK");
      await trustIpByHash(db, ipHashValue, ipMasked, user.id);
      await writeAudit(db, { userId: user.id, action: "admin.ip_trusted", entityType: "user", entityId: targetUserId || ipHashValue, metadata: { ipHash: ipHashValue } });
      const detail = targetUserId ? await getAdminUserDetail(db, targetUserId) : null;
      return respond({ ok: true, detail });
    } else if (action === "revokeSessionsByIp") {
      assertPlatformPermission(actorRole, "users:status");
      const targetUserId = String(payload.userId ?? "");
      const ipHashValue = String(payload.ipHash ?? "");
      const reason = String(payload.reason ?? "").trim().slice(0, 300);
      if (!targetUserId || !ipHashValue || reason.length < 3) throw new ApiError(400, "INVALID_SESSION_REVOKE");
      const result = await db.prepare("DELETE FROM auth_sessions WHERE user_id=? AND ip_hash=?").bind(targetUserId, ipHashValue).run();
      await writeAudit(db, { userId: user.id, action: "admin.sessions_revoked_by_ip", entityType: "user", entityId: targetUserId, metadata: { ipHash: ipHashValue, reason, deleted: Number(result.meta.changes ?? 0) } });
      const detail = await getAdminUserDetail(db, targetUserId);
      return respond({ ok: true, detail });
    } else if (action === "requestDataExport" || action === "requestDeletion") {
      const type = action === "requestDataExport" ? "export" : "deletion";
      const requestId = id(); await db.prepare("INSERT INTO data_requests (id,user_id,type,status,requested_at) VALUES (?,?,?,'pending',?)").bind(requestId, user.id, type, isoNow()).run();
      await writeAudit(db, { userId: user.id, action: `privacy.${type}_requested`, entityType: "data_request", entityId: requestId });
      return respond({ ok: true, requestId, status: "pending" });
    } else {
      throw new ApiError(400, "UNSUPPORTED_ACTION");
    }
    const scope = action === "setPaymentStatus" ? "payments"
      : ["setUserStatus", "revokeUserSessions", "adminUpdateSubscription", "adminVerifyEmail", "adminUpdateUser", "restoreRetentionArchive", "adminBlockIp", "adminUnblockIp", "adminTrustIp", "revokeSessionsByIp"].includes(action) ? "users"
      : ["updateGateway"].includes(action) ? "gateways"
      : ["upsertPlan"].includes(action) ? "plans"
      : "overview";
    return respond({ ok: true, ...(await scopedAdminData(db, actorRole, scope)) });
  } catch (error) {
    if (claimed) {
      try { await releaseIdempotency(claimed.db, claimed.userId, claimed.key); } catch { /* maintenance job will clean stale claims */ }
    }
    return errorResponse(error);
  }
}
