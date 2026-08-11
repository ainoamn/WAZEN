import { ensureSchema, getRawDb, getRequestUser, type RequestUser } from "../../../db/runtime";

const isoNow = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const day = 86_400_000;
const atOffset = (days: number) => new Date(Date.now() + days * day).toISOString();

const planSeeds = [
  {
    id: "starter", nameAr: "البداية", nameEn: "Starter",
    descriptionAr: "لتبدأ تنظيم أموالك", descriptionEn: "Start organizing your money",
    monthly: 0, annual: 0, wallets: 1, members: 2,
    features: ["personal", "basic_reports"], order: 1,
  },
  {
    id: "family", nameAr: "العائلة", nameEn: "Family",
    descriptionAr: "للأفراد والعائلات الصغيرة", descriptionEn: "For individuals and families",
    monthly: 2900, annual: 27840, wallets: 5, members: 15,
    features: ["personal", "household", "travel", "circle", "exports"], order: 2,
  },
  {
    id: "pro", nameAr: "الاحتراف", nameEn: "Professional",
    descriptionAr: "لمديري المجموعات والجمعيات", descriptionEn: "For group and circle managers",
    monthly: 7900, annual: 75840, wallets: 20, members: 75,
    features: ["all_wallets", "documents", "draws", "voting", "advanced_reports", "custom_roles"], order: 3,
  },
  {
    id: "business", nameAr: "الأعمال", nameEn: "Business",
    descriptionAr: "للفرق والمؤسسات", descriptionEn: "For teams and organizations",
    monthly: 19900, annual: 191040, wallets: 9999, members: 9999,
    features: ["unlimited", "multi_approval", "audit", "api", "priority_support"], order: 4,
  },
] as const;

async function seedPlans(db: D1Database) {
  const count = await db.prepare("SELECT COUNT(*) AS count FROM plans").first<{ count: number }>();
  if ((count?.count ?? 0) > 0) return;
  const createdAt = isoNow();
  await db.batch(planSeeds.map((plan) => db.prepare(
    "INSERT INTO plans (id,name_ar,name_en,description_ar,description_en,monthly_minor,annual_minor,wallet_limit,member_limit,features_json,is_active,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)",
  ).bind(plan.id, plan.nameAr, plan.nameEn, plan.descriptionAr, plan.descriptionEn, plan.monthly, plan.annual, plan.wallets, plan.members, JSON.stringify(plan.features), plan.order, createdAt)));
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
    db.prepare(`INSERT INTO users (id,email,display_name,locale,currency,created_at) VALUES (?,?,?,'ar','SAR',?)
      ON CONFLICT(id) DO UPDATE SET email=excluded.email, display_name=excluded.display_name`).bind(user.id, user.email, user.displayName, now),
    db.prepare(`INSERT INTO customer_profiles (user_id,status,country,last_seen_at,created_at) VALUES (?,'active','SA',?,?)
      ON CONFLICT(user_id) DO UPDATE SET last_seen_at=excluded.last_seen_at`).bind(user.id, now, now),
  ]);

  const role = await db.prepare("SELECT role FROM platform_roles WHERE user_id=?").bind(user.id).first<{ role: string }>();
  if (!role) {
    const count = await db.prepare("SELECT COUNT(*) AS count FROM platform_roles").first<{ count: number }>();
    const assigned = (count?.count ?? 0) === 0 ? "super_admin" : "customer";
    await db.prepare("INSERT INTO platform_roles VALUES (?,?,?, ?, ?)")
      .bind(user.id, assigned, JSON.stringify(assigned === "super_admin" ? ["*"] : ["wallets:own", "documents:own"]), now, now).run();
  }

  const subscription = await db.prepare("SELECT id FROM subscriptions WHERE user_id=? LIMIT 1").bind(user.id).first();
  if (!subscription) {
    await db.prepare("INSERT INTO subscriptions VALUES (?,?,?,'trialing','monthly',?,?,0,?,?)")
      .bind(id(), user.id, "family", now, atOffset(14), now, now).run();
  }
}

async function seedCommercialData(db: D1Database, user: RequestUser) {
  await seedPlans(db);
  await ensureIdentity(db, user);
  const now = isoNow();

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
        db.prepare("INSERT INTO users VALUES (?, ?, ?, 'ar', 'SAR', ?)").bind(userId, demo[2], demo[1], atOffset(-120 + index * 12)),
        db.prepare("INSERT INTO customer_profiles VALUES (?, ?, ?, NULL, ?, ?)").bind(userId, demo[4] === "suspended" ? "suspended" : "active", demo[5], atOffset(-index), atOffset(-120 + index * 12)),
        db.prepare("INSERT INTO platform_roles VALUES (?, 'customer', '[\"wallets:own\",\"documents:own\"]', ?, ?)").bind(userId, now, now),
        db.prepare("INSERT INTO subscriptions VALUES (?, ?, ?, ?, 'monthly', ?, ?, 0, ?, ?)").bind(subId, userId, demo[3], demo[4], atOffset(-20), atOffset(10), atOffset(-120), now),
      );
      const amount = [7900, 2900, 19900, 0][index];
      if (amount > 0) {
        const invoiceId = `demo-inv-${index + 1}`;
        const tax = Math.round(amount * 0.15);
        statements.push(
          db.prepare("INSERT INTO invoices VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'SAR', ?, ?, ?, ?)").bind(invoiceId, userId, subId, `WZN-INV-2026-00${index + 1}`, amount, tax, amount + tax, index === 2 ? "pending" : "paid", atOffset(8), index === 2 ? null : atOffset(-2 - index), atOffset(-5 - index)),
          db.prepare("INSERT INTO payments VALUES (?, ?, ?, ?, ?, 'SAR', ?, ?, ?, ?, ?)").bind(`demo-pay-${index + 1}`, userId, invoiceId, `WZN-PAY-2026-00${index + 1}`, amount + tax, index === 1 ? "card" : "bank_transfer", index === 2 ? "pending" : "succeeded", index === 2 ? "unsettled" : "settled", atOffset(-3 - index), atOffset(-3 - index)),
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
    await db.batch(docs.map((doc, index) => db.prepare(
      "INSERT INTO documents VALUES (?,?,NULL,?,?,?,?,?,'SAR','issued','bank_transfer',?,?,?)",
    ).bind(id(), user.id, doc[0], doc[1], doc[2], doc[3], doc[4], user.displayName, atOffset(-index * 2), now)));
    for (const key of ["receipt-2026", "disbursement-2026", "handover-2026", "member_statement-2026"]) {
      await db.prepare("INSERT OR IGNORE INTO document_sequences VALUES (?,1)").bind(key).run();
    }
  }
}

async function roleOf(db: D1Database, userId: string) {
  return (await db.prepare("SELECT role FROM platform_roles WHERE user_id=?").bind(userId).first<{ role: string }>())?.role ?? "customer";
}

async function assertAdmin(db: D1Database, userId: string) {
  const role = await roleOf(db, userId);
  if (!new Set(["super_admin", "admin", "finance", "support"]).has(role)) throw new Error("FORBIDDEN");
  return role;
}

async function audit(db: D1Database, userId: string, action: string, entityType: string, entityId: string, metadata: unknown = {}) {
  await db.prepare("INSERT INTO audit_logs VALUES (?,?,?,?,?,?,?)")
    .bind(id(), userId, action, entityType, entityId, JSON.stringify(metadata), isoNow()).run();
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
  const [users, subscriptions, invoices, payments, coupons, plans, roles, logs] = await Promise.all([
    db.prepare(`SELECT u.id,u.email,u.display_name,u.created_at,p.status,p.country,p.last_seen_at,
      s.id AS subscription_id,s.status AS subscription_status,s.billing_cycle,s.current_period_end,pl.name_ar AS plan_name,pl.id AS plan_id
      FROM users u LEFT JOIN customer_profiles p ON p.user_id=u.id
      LEFT JOIN subscriptions s ON s.user_id=u.id LEFT JOIN plans pl ON pl.id=s.plan_id ORDER BY u.created_at DESC`).all(),
    db.prepare("SELECT * FROM subscriptions ORDER BY created_at DESC").all(),
    db.prepare("SELECT i.*,u.display_name,u.email FROM invoices i LEFT JOIN users u ON u.id=i.user_id ORDER BY i.created_at DESC").all(),
    db.prepare("SELECT p.*,u.display_name,u.email FROM payments p LEFT JOIN users u ON u.id=p.user_id ORDER BY p.occurred_at DESC").all(),
    db.prepare("SELECT * FROM coupons ORDER BY created_at DESC").all(),
    db.prepare("SELECT * FROM plans ORDER BY sort_order").all<Record<string, unknown>>(),
    db.prepare("SELECT r.*,u.display_name,u.email FROM platform_roles r LEFT JOIN users u ON u.id=r.user_id ORDER BY r.created_at").all(),
    db.prepare("SELECT a.*,u.display_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 30").all(),
  ]);
  return {
    users: users.results, subscriptions: subscriptions.results, invoices: invoices.results,
    payments: payments.results, coupons: coupons.results,
    plans: plans.results.map(parseFeatures), roles: roles.results, logs: logs.results,
  };
}

export async function GET(request: Request) {
  try {
    const db = getRawDb();
    await ensureSchema(db);
    await seedPlans(db);
    await seedCoupons(db);
    const url = new URL(request.url);
    const view = url.searchParams.get("view") ?? "pricing";
    if (view === "pricing") return Response.json({ plans: await publicPlans(db) });

    const user = getRequestUser(request);
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    await seedCommercialData(db, user);
    const role = await roleOf(db, user.id);

    if (view === "documents") {
      const [documents, spaces] = await Promise.all([
        db.prepare("SELECT * FROM documents WHERE owner_user_id=? ORDER BY issued_at DESC").bind(user.id).all(),
        db.prepare("SELECT id,name_ar,name_en,type,currency FROM spaces WHERE owner_user_id=? ORDER BY created_at").bind(user.id).all(),
      ]);
      return Response.json({ user, role, documents: documents.results, spaces: spaces.results });
    }
    if (view === "billing") {
      const [subscription, invoices, payments, plans] = await Promise.all([
        db.prepare("SELECT s.*,p.name_ar,p.name_en,p.wallet_limit,p.member_limit FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=? ORDER BY s.created_at DESC LIMIT 1").bind(user.id).first(),
        db.prepare("SELECT * FROM invoices WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all(),
        db.prepare("SELECT * FROM payments WHERE user_id=? ORDER BY occurred_at DESC").bind(user.id).all(),
        publicPlans(db),
      ]);
      return Response.json({ user, role, subscription, invoices: invoices.results, payments: payments.results, plans });
    }
    if (view === "admin") {
      await assertAdmin(db, user.id);
      return Response.json({ user, role, ...(await adminData(db)) });
    }
    return Response.json({ user, role });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: message === "FORBIDDEN" ? 403 : 500 });
  }
}

const documentPrefixes: Record<string, string> = {
  receipt: "RCV", disbursement: "PAY", handover: "HND", member_statement: "MEM",
  society_statement: "SOC", trip_statement: "TRP", household_statement: "HOM", personal_report: "PER",
};

async function nextDocumentReference(db: D1Database, type: string) {
  const year = new Date().getUTCFullYear();
  const key = `${type}-${year}`;
  const row = await db.prepare(`INSERT INTO document_sequences (key,next_value) VALUES (?,1)
    ON CONFLICT(key) DO UPDATE SET next_value=next_value+1 RETURNING next_value`).bind(key).first<{ next_value: number }>();
  const sequence = String(row?.next_value ?? 1).padStart(4, "0");
  return `WZN-${documentPrefixes[type] ?? "DOC"}-${year}-${sequence}`;
}

export async function POST(request: Request) {
  try {
    const db = getRawDb();
    await ensureSchema(db);
    await seedPlans(db);
    await seedCoupons(db);
    const payload = (await request.json()) as Record<string, unknown>;
    const action = String(payload.action ?? "");

    if (action === "validateCoupon") {
      const code = String(payload.code ?? "").trim().toUpperCase();
      const coupon = await db.prepare("SELECT code,discount_type,value,expires_at FROM coupons WHERE code=? AND is_active=1 AND used_count<usage_limit").bind(code).first<Record<string, unknown>>();
      const valid = Boolean(coupon && (!coupon.expires_at || new Date(String(coupon.expires_at)) > new Date()));
      return Response.json({ valid, coupon: valid ? coupon : null });
    }

    const user = getRequestUser(request);
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    await seedCommercialData(db, user);

    if (action === "selectPlan") {
      const planId = String(payload.planId ?? "");
      const cycle = payload.cycle === "annual" ? "annual" : "monthly";
      const plan = await db.prepare("SELECT * FROM plans WHERE id=? AND is_active=1").bind(planId).first<Record<string, unknown>>();
      if (!plan) return Response.json({ error: "Plan not found" }, { status: 404 });
      const subtotal = Number(cycle === "annual" ? plan.annual_minor : plan.monthly_minor);
      let discount = 0;
      const couponCode = String(payload.coupon ?? "").trim().toUpperCase();
      if (couponCode) {
        const coupon = await db.prepare("SELECT * FROM coupons WHERE code=? AND is_active=1 AND used_count<usage_limit").bind(couponCode).first<Record<string, unknown>>();
        if (coupon && (!coupon.expires_at || new Date(String(coupon.expires_at)) > new Date())) {
          discount = coupon.discount_type === "fixed" ? Number(coupon.value) : Math.round(subtotal * Number(coupon.value) / 100);
          await db.prepare("UPDATE coupons SET used_count=used_count+1 WHERE code=?").bind(couponCode).run();
        }
      }
      const tax = Math.round((subtotal - discount) * 0.15);
      const total = Math.max(0, subtotal - discount + tax);
      const now = isoNow();
      const periodEnd = cycle === "annual" ? atOffset(365) : atOffset(30);
      const current = await db.prepare("SELECT id FROM subscriptions WHERE user_id=? ORDER BY created_at DESC LIMIT 1").bind(user.id).first<{ id: string }>();
      const subscriptionId = current?.id ?? id();
      if (current) await db.prepare("UPDATE subscriptions SET plan_id=?,status='pending_payment',billing_cycle=?,current_period_start=?,current_period_end=?,updated_at=? WHERE id=?")
        .bind(planId, cycle, now, periodEnd, now, subscriptionId).run();
      else await db.prepare("INSERT INTO subscriptions VALUES (?,?,?,'pending_payment',?,?,?,0,?,?)")
        .bind(subscriptionId, user.id, planId, cycle, now, periodEnd, now, now).run();
      const invoiceId = id();
      const reference = `WZN-INV-${new Date().getUTCFullYear()}-${Date.now().toString().slice(-6)}`;
      await db.prepare("INSERT INTO invoices VALUES (?,?,?,?,?,?,?,?,'SAR',?,?,NULL,?)")
        .bind(invoiceId, user.id, subscriptionId, reference, subtotal, discount, tax, total, total === 0 ? "paid" : "pending", atOffset(7), now).run();
      await audit(db, user.id, "subscription.plan_selected", "subscription", subscriptionId, { planId, cycle, invoiceId });
      return Response.json({ ok: true, invoice: { id: invoiceId, reference, subtotal_minor: subtotal, discount_minor: discount, tax_minor: tax, total_minor: total } });
    }

    if (action === "createDocument") {
      const type = String(payload.type ?? "receipt");
      const personName = String(payload.personName ?? "").trim();
      const description = String(payload.description ?? "").trim();
      const amountMinor = Math.round(Number(payload.amount ?? 0) * 100);
      if (!documentPrefixes[type] || !personName || !description || !Number.isFinite(amountMinor) || amountMinor < 0) {
        return Response.json({ error: "Invalid document" }, { status: 400 });
      }
      const reference = await nextDocumentReference(db, type);
      const documentId = id();
      const now = isoNow();
      await db.prepare("INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,'SAR','issued',?,?,?,?)")
        .bind(documentId, user.id, payload.spaceId ? String(payload.spaceId) : null, type, reference, personName, description, amountMinor, String(payload.paymentMethod ?? "bank_transfer"), user.displayName, now, now).run();
      await audit(db, user.id, "document.created", "document", documentId, { reference, type });
      const document = await db.prepare("SELECT * FROM documents WHERE id=?").bind(documentId).first();
      return Response.json({ ok: true, document });
    }

    if (action === "inviteMember") {
      const spaceId = String(payload.spaceId ?? "");
      const email = String(payload.email ?? "").trim().toLowerCase();
      const role = String(payload.role ?? "member");
      const space = await db.prepare("SELECT id FROM spaces WHERE id=? AND owner_user_id=?").bind(spaceId, user.id).first();
      if (!space || !email.includes("@") || !["member", "treasurer", "manager", "auditor", "viewer"].includes(role)) {
        return Response.json({ error: "Invalid invitation" }, { status: 400 });
      }
      const invitationId = id();
      const token = crypto.randomUUID().replaceAll("-", "");
      await db.prepare("INSERT INTO invites VALUES (?,?,?,?,?,'pending',?,?,?)")
        .bind(invitationId, spaceId, email, role, token, atOffset(7), user.id, isoNow()).run();
      await audit(db, user.id, "member.invited", "invite", invitationId, { spaceId, email, role });
      return Response.json({ ok: true, invitation: { id: invitationId, email, role, token } });
    }

    await assertAdmin(db, user.id);
    if (action === "setUserStatus") {
      const targetUserId = String(payload.userId ?? "");
      const status = String(payload.status ?? "active");
      if (!["active", "suspended", "closed"].includes(status)) return Response.json({ error: "Invalid status" }, { status: 400 });
      await db.prepare("UPDATE customer_profiles SET status=? WHERE user_id=?").bind(status, targetUserId).run();
      await audit(db, user.id, "customer.status_changed", "user", targetUserId, { status });
    } else if (action === "setRole") {
      const targetUserId = String(payload.userId ?? "");
      const role = String(payload.role ?? "customer");
      if (!["customer", "support", "finance", "admin", "super_admin"].includes(role)) return Response.json({ error: "Invalid role" }, { status: 400 });
      await db.prepare("UPDATE platform_roles SET role=?,updated_at=? WHERE user_id=?").bind(role, isoNow(), targetUserId).run();
      await audit(db, user.id, "admin.role_changed", "user", targetUserId, { role });
    } else if (action === "setPaymentStatus") {
      const paymentId = String(payload.paymentId ?? "");
      const status = String(payload.status ?? "succeeded");
      if (!["pending", "succeeded", "failed", "refunded"].includes(status)) return Response.json({ error: "Invalid status" }, { status: 400 });
      await db.prepare("UPDATE payments SET status=?,settlement_status=? WHERE id=?").bind(status, status === "succeeded" ? "settled" : "unsettled", paymentId).run();
      await audit(db, user.id, "payment.status_changed", "payment", paymentId, { status });
    } else if (action === "createCoupon") {
      const code = String(payload.code ?? "").trim().toUpperCase();
      const value = Math.max(1, Math.min(100, Number(payload.value ?? 0)));
      if (!/^[A-Z0-9_-]{3,20}$/.test(code)) return Response.json({ error: "Invalid coupon" }, { status: 400 });
      await db.prepare("INSERT INTO coupons VALUES (?,?,'percent',?,100,0,?,1,?)").bind(id(), code, value, atOffset(90), isoNow()).run();
      await audit(db, user.id, "coupon.created", "coupon", code, { value });
    } else {
      return Response.json({ error: "Unsupported action" }, { status: 400 });
    }
    return Response.json({ ok: true, ...(await adminData(db)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: message === "FORBIDDEN" ? 403 : 500 });
  }
}
