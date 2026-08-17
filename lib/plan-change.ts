/** Plan upgrade / downgrade rules for customer self-service. */

import { calculatePercentMinor } from "./money";
import { ApiError } from "./api-error";
import { prepareAudit } from "./audit";
import { nextReference } from "./reference";
import { countryPack } from "./country-packs";
import { ensureDefaultTenant } from "./authorization";
import type { RequestUser } from "../db/runtime";
import { classifyPlanChange, dayAfterIso, type PlanChangeKind } from "./plan-change-rules";

export { classifyPlanChange, dayAfterIso, type PlanChangeKind } from "./plan-change-rules";

const DAY_MS = 86_400_000;

let invoicePlanColumnsReady = false;
let pendingPlanColumnsReady = false;

export async function ensureInvoicePlanColumns(db: D1Database) {
  if (invoicePlanColumnsReady) return;
  const columns = await db.prepare("PRAGMA table_info(invoices)").all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  for (const [name, ddl] of [
    ["target_plan_id", "TEXT"],
    ["target_billing_cycle", "TEXT"],
  ] as const) {
    if (names.has(name)) continue;
    try {
      await db.prepare(`ALTER TABLE invoices ADD COLUMN ${name} ${ddl}`).run();
    } catch (error) {
      const refreshed = await db.prepare("PRAGMA table_info(invoices)").all<{ name: string }>();
      if (!refreshed.results.some((column) => column.name === name)) throw error;
    }
  }
  invoicePlanColumnsReady = true;
}

export async function ensurePendingPlanColumns(db: D1Database) {
  if (pendingPlanColumnsReady) return;
  const { ensureSubscriptionAdminColumns } = await import("../services/admin/billing-service");
  await ensureSubscriptionAdminColumns(db);
  const columns = await db.prepare("PRAGMA table_info(subscriptions)").all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  for (const [name, ddl] of [
    ["pending_plan_id", "TEXT"],
    ["pending_billing_cycle", "TEXT"],
    ["pending_effective_at", "TEXT"],
  ] as const) {
    if (names.has(name)) continue;
    try {
      await db.prepare(`ALTER TABLE subscriptions ADD COLUMN ${name} ${ddl}`).run();
    } catch (error) {
      const refreshed = await db.prepare("PRAGMA table_info(subscriptions)").all<{ name: string }>();
      if (!refreshed.results.some((column) => column.name === name)) throw error;
    }
  }
  await ensureInvoicePlanColumns(db);
  pendingPlanColumnsReady = true;
}

export async function applyDuePlanChanges(db: D1Database, userId: string) {
  await ensurePendingPlanColumns(db);
  const now = new Date().toISOString();
  const row = await db.prepare(
    `SELECT id, pending_plan_id, pending_billing_cycle, pending_effective_at
     FROM subscriptions
     WHERE user_id=? AND pending_plan_id IS NOT NULL AND pending_effective_at IS NOT NULL AND pending_effective_at<=?
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(userId, now).first<{
    id: string;
    pending_plan_id: string;
    pending_billing_cycle: string | null;
    pending_effective_at: string;
  }>();
  if (!row?.pending_plan_id) return false;
  const plan = await db.prepare("SELECT id FROM plans WHERE id=? AND is_active=1").bind(row.pending_plan_id).first();
  if (!plan) {
    await db.prepare("UPDATE subscriptions SET pending_plan_id=NULL, pending_billing_cycle=NULL, pending_effective_at=NULL, updated_at=? WHERE id=?")
      .bind(now, row.id).run();
    return false;
  }
  const cycle = row.pending_billing_cycle === "annual" ? "annual" : "monthly";
  const periodEnd = new Date(Date.now() + (cycle === "annual" ? 365 : 30) * DAY_MS).toISOString();
  await db.batch([
    db.prepare(
      `UPDATE subscriptions SET plan_id=?, billing_cycle=?, status='active',
        current_period_start=?, current_period_end=?,
        pending_plan_id=NULL, pending_billing_cycle=NULL, pending_effective_at=NULL, updated_at=?
       WHERE id=?`,
    ).bind(row.pending_plan_id, cycle, now, periodEnd, now, row.id),
    prepareAudit(db, {
      userId,
      action: "subscription.downgrade_applied",
      entityType: "subscription",
      entityId: row.id,
      metadata: { planId: row.pending_plan_id, effectiveAt: row.pending_effective_at },
      createdAt: now,
    }),
  ]);
  return true;
}

export async function applyInvoicePlanChange(db: D1Database, invoiceId: string, userId: string) {
  await ensurePendingPlanColumns(db);
  const invoice = await db.prepare(
    "SELECT id,user_id,subscription_id,target_plan_id,target_billing_cycle,status FROM invoices WHERE id=?",
  ).bind(invoiceId).first<{
    id: string;
    user_id: string;
    subscription_id: string | null;
    target_plan_id: string | null;
    target_billing_cycle: string | null;
    status: string;
  }>();
  if (!invoice || invoice.user_id !== userId) throw new ApiError(404, "INVOICE_NOT_FOUND");
  const planId = invoice.target_plan_id;
  if (!planId) return { applied: false };
  const plan = await db.prepare("SELECT id FROM plans WHERE id=? AND is_active=1").bind(planId).first();
  if (!plan) throw new ApiError(404, "PLAN_NOT_FOUND");
  const now = new Date().toISOString();
  const cycle = invoice.target_billing_cycle === "annual" ? "annual" : "monthly";
  const periodEnd = new Date(Date.now() + (cycle === "annual" ? 365 : 30) * DAY_MS).toISOString();
  const subscriptionId = invoice.subscription_id;
  if (subscriptionId) {
    await db.prepare(
      `UPDATE subscriptions SET plan_id=?, status='active', billing_cycle=?,
        current_period_start=?, current_period_end=?,
        pending_plan_id=NULL, pending_billing_cycle=NULL, pending_effective_at=NULL, updated_at=?
       WHERE id=?`,
    ).bind(planId, cycle, now, periodEnd, now, subscriptionId).run();
  }
  await prepareAudit(db, {
    userId,
    action: "subscription.upgrade_applied",
    entityType: "subscription",
    entityId: subscriptionId ?? invoiceId,
    metadata: { planId, invoiceId, cycle },
    createdAt: now,
  }).run();
  return { applied: true, planId, cycle };
}

type SelectPlanInput = {
  planId: string;
  cycle: "monthly" | "annual";
  coupon?: string;
};

export async function selectCustomerPlan(db: D1Database, user: RequestUser, input: SelectPlanInput) {
  await ensurePendingPlanColumns(db);
  const plan = await db.prepare(
    "SELECT id, monthly_minor, annual_minor, sort_order, is_active FROM plans WHERE id=? AND is_active=1",
  ).bind(input.planId).first<{
    id: string;
    monthly_minor: number;
    annual_minor: number;
    sort_order: number;
    is_active: number;
  }>();
  if (!plan) throw new ApiError(404, "PLAN_NOT_FOUND");

  const current = await db.prepare(
    `SELECT s.id, s.plan_id, s.status, s.billing_cycle, s.current_period_end,
            s.discount_percent, s.discount_fixed_minor,
            p.monthly_minor, p.sort_order
     FROM subscriptions s
     LEFT JOIN plans p ON p.id=s.plan_id
     WHERE s.user_id=?
     ORDER BY s.created_at DESC LIMIT 1`,
  ).bind(user.id).first<{
    id: string;
    plan_id: string;
    status: string;
    billing_cycle: string;
    current_period_end: string;
    discount_percent: number | null;
    discount_fixed_minor: number | null;
    monthly_minor: number | null;
    sort_order: number | null;
  }>();

  const change = classifyPlanChange(
    current
      ? { sort_order: Number(current.sort_order ?? 0), monthly_minor: Number(current.monthly_minor ?? 0) }
      : null,
    { sort_order: Number(plan.sort_order), monthly_minor: Number(plan.monthly_minor) },
  );

  const subtotal = Number(input.cycle === "annual" ? plan.annual_minor : plan.monthly_minor);
  let discount = 0;
  let couponId: string | null = null;
  const couponCode = String(input.coupon ?? "").trim().toUpperCase();
  if (couponCode) {
    const coupon = await db.prepare(
      `SELECT * FROM coupons c WHERE code=? AND is_active=1 AND
        used_count+(SELECT COUNT(*) FROM coupon_redemptions r WHERE r.coupon_id=c.id AND r.status='reserved')<usage_limit`,
    ).bind(couponCode).first<Record<string, unknown>>();
    if (coupon && (!coupon.expires_at || new Date(String(coupon.expires_at)) > new Date())) {
      discount = coupon.discount_type === "fixed"
        ? Number(coupon.value)
        : calculatePercentMinor(subtotal, Number(coupon.value) * 100);
      couponId = String(coupon.id);
    }
  }
  discount += calculatePercentMinor(subtotal, Number(current?.discount_percent ?? 0) * 100);
  discount += Number(current?.discount_fixed_minor ?? 0);
  discount = Math.min(discount, subtotal);

  const profile = await db.prepare(
    "SELECT p.country,u.currency FROM customer_profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=?",
  ).bind(user.id).first<{ country: string; currency: string }>();
  const pack = countryPack(profile?.country ?? "OM");
  const currency = profile?.currency ?? pack.currency;
  const tax = calculatePercentMinor(subtotal - discount, pack.taxBasisPoints);
  const total = subtotal - discount + tax;
  const now = new Date().toISOString();
  const periodEnd = input.cycle === "annual"
    ? new Date(Date.now() + 365 * DAY_MS).toISOString()
    : new Date(Date.now() + 30 * DAY_MS).toISOString();
  const subscriptionId = current?.id ?? crypto.randomUUID();
  const tenantId = await ensureDefaultTenant(db, user);

  if (change === "downgrade") {
    const effectiveAt = dayAfterIso(current?.current_period_end ?? now);
    const statements: D1PreparedStatement[] = [];
    if (current) {
      statements.push(
        db.prepare(
          `UPDATE subscriptions SET pending_plan_id=?, pending_billing_cycle=?, pending_effective_at=?, updated_at=? WHERE id=?`,
        ).bind(plan.id, input.cycle, effectiveAt, now, subscriptionId),
      );
    } else {
      statements.push(
        db.prepare(
          `INSERT INTO subscriptions (
            id,user_id,plan_id,status,billing_cycle,current_period_start,current_period_end,cancel_at_period_end,
            pending_plan_id,pending_billing_cycle,pending_effective_at,created_at,updated_at
          ) VALUES (?,?,?,'active',?,?,?,0,?,?,?,?,?)`,
        ).bind(subscriptionId, user.id, "starter", input.cycle, now, effectiveAt, plan.id, input.cycle, effectiveAt, now, now),
      );
    }
    statements.push(
      prepareAudit(db, {
        userId: user.id,
        action: "subscription.downgrade_scheduled",
        entityType: "subscription",
        entityId: subscriptionId,
        metadata: { planId: plan.id, cycle: input.cycle, effectiveAt },
        createdAt: now,
      }),
    );
    await db.batch(statements);
    return {
      ok: true,
      change: "scheduled_downgrade" as const,
      effectiveAt,
      planId: plan.id,
      cycle: input.cycle,
      invoice: null,
      keepsCurrentUntil: effectiveAt,
    };
  }

  if (total === 0) {
    const invoiceId = crypto.randomUUID();
    const reference = await nextReference(db, "invoice", "INV");
    const statements: D1PreparedStatement[] = [];
    if (current) {
      statements.push(
        db.prepare(
          `UPDATE subscriptions SET plan_id=?, status='active', billing_cycle=?,
            current_period_start=?, current_period_end=?,
            pending_plan_id=NULL, pending_billing_cycle=NULL, pending_effective_at=NULL, updated_at=?
           WHERE id=?`,
        ).bind(plan.id, input.cycle, now, periodEnd, now, subscriptionId),
      );
    } else {
      statements.push(
        db.prepare(
          `INSERT INTO subscriptions (
            id,user_id,plan_id,status,billing_cycle,current_period_start,current_period_end,cancel_at_period_end,created_at,updated_at
          ) VALUES (?,?,?,'active',?,?,?,0,?,?)`,
        ).bind(subscriptionId, user.id, plan.id, input.cycle, now, periodEnd, now, now),
      );
    }
    statements.push(
      db.prepare(
        `INSERT INTO invoices (
          id,user_id,subscription_id,reference,subtotal_minor,discount_minor,tax_minor,total_minor,currency,status,due_at,paid_at,created_at,target_plan_id,target_billing_cycle
        ) VALUES (?,?,?,?,?,?,?,?,?,'paid',?,?,?,?,?)`,
      ).bind(invoiceId, user.id, subscriptionId, reference, subtotal, discount, tax, total, currency, periodEnd, now, now, plan.id, input.cycle),
      db.prepare("INSERT INTO tenant_resources (tenant_id,resource_type,resource_id,created_at) VALUES (?,?,?,?)")
        .bind(tenantId, "invoice", invoiceId, now),
      prepareAudit(db, {
        userId: user.id,
        action: "subscription.plan_selected",
        entityType: "subscription",
        entityId: subscriptionId,
        metadata: { planId: plan.id, cycle: input.cycle, invoiceId, change, couponCode: couponCode || null },
        createdAt: now,
      }),
    );
    await db.batch(statements);
    return {
      ok: true,
      change: change === "same" || change === "renew" ? "renewed" : "upgraded",
      planId: plan.id,
      cycle: input.cycle,
      invoice: {
        id: invoiceId,
        reference,
        subtotal_minor: subtotal,
        discount_minor: discount,
        tax_minor: tax,
        total_minor: total,
        currency,
        status: "paid",
      },
    };
  }

  // Paid upgrade / renew: keep current entitlements until payment succeeds.
  const invoiceId = crypto.randomUUID();
  const paymentId = crypto.randomUUID();
  const reference = await nextReference(db, "invoice", "INV");
  const paymentRef = await nextReference(db, "payment", "PAY");
  const statements: D1PreparedStatement[] = [];
  if (!current) {
    statements.push(
      db.prepare(
        `INSERT INTO subscriptions (
          id,user_id,plan_id,status,billing_cycle,current_period_start,current_period_end,cancel_at_period_end,created_at,updated_at
        ) VALUES (?,?,?,'active',?,?,?,0,?,?)`,
      ).bind(subscriptionId, user.id, "starter", input.cycle, now, periodEnd, now, now),
    );
  } else {
    statements.push(
      db.prepare("UPDATE subscriptions SET updated_at=? WHERE id=?").bind(now, subscriptionId),
    );
  }
  statements.push(
    db.prepare(
      `INSERT INTO invoices (
        id,user_id,subscription_id,reference,subtotal_minor,discount_minor,tax_minor,total_minor,currency,status,due_at,paid_at,created_at,target_plan_id,target_billing_cycle
      ) VALUES (?,?,?,?,?,?,?,?,?,'pending',?,NULL,?,?,?)`,
    ).bind(invoiceId, user.id, subscriptionId, reference, subtotal, discount, tax, total, currency, new Date(Date.now() + 7 * DAY_MS).toISOString(), now, plan.id, input.cycle),
    db.prepare(
      `INSERT INTO payments (
        id,user_id,invoice_id,reference,amount_minor,currency,method,status,settlement_status,occurred_at,created_at
      ) VALUES (?,?,?,?,?,?,'bank_transfer','pending','unsettled',?,?)`,
    ).bind(paymentId, user.id, invoiceId, paymentRef, total, currency, now, now),
    db.prepare("INSERT INTO tenant_resources (tenant_id,resource_type,resource_id,created_at) VALUES (?,?,?,?)")
      .bind(tenantId, "invoice", invoiceId, now),
    db.prepare("INSERT INTO tenant_resources (tenant_id,resource_type,resource_id,created_at) VALUES (?,?,?,?)")
      .bind(tenantId, "payment", paymentId, now),
    prepareAudit(db, {
      userId: user.id,
      action: "subscription.plan_selected",
      entityType: "subscription",
      entityId: subscriptionId,
      metadata: { planId: plan.id, cycle: input.cycle, invoiceId, paymentId, change, couponCode: couponCode || null },
      createdAt: now,
    }),
  );
  if (couponId) {
    statements.push(
      db.prepare(
        "INSERT INTO coupon_redemptions (id,coupon_id,user_id,invoice_id,status,created_at) VALUES (?,?,?,?,'reserved',?)",
      ).bind(crypto.randomUUID(), couponId, user.id, invoiceId, now),
    );
  }
  await db.batch(statements);
  return {
    ok: true,
    change: "upgrade_pending_payment" as const,
    planId: plan.id,
    cycle: input.cycle,
    paymentId,
    invoice: {
      id: invoiceId,
      reference,
      subtotal_minor: subtotal,
      discount_minor: discount,
      tax_minor: tax,
      total_minor: total,
      currency,
      status: "pending",
    },
  };
}

export async function confirmInvoicePayment(db: D1Database, user: RequestUser, invoiceId: string) {
  await ensurePendingPlanColumns(db);
  const invoice = await db.prepare(
    "SELECT id,user_id,subscription_id,total_minor,currency,status,target_plan_id FROM invoices WHERE id=?",
  ).bind(invoiceId).first<{
    id: string;
    user_id: string;
    subscription_id: string | null;
    total_minor: number;
    currency: string;
    status: string;
    target_plan_id: string | null;
  }>();
  if (!invoice || invoice.user_id !== user.id) throw new ApiError(404, "INVOICE_NOT_FOUND");
  if (invoice.status === "paid") {
    return { ok: true, alreadyPaid: true, ...(await applyInvoicePlanChange(db, invoiceId, user.id)) };
  }
  if (invoice.status !== "pending") throw new ApiError(409, "INVOICE_NOT_PAYABLE");

  const now = new Date().toISOString();
  let payment = await db.prepare(
    "SELECT id,status FROM payments WHERE invoice_id=? ORDER BY created_at DESC LIMIT 1",
  ).bind(invoiceId).first<{ id: string; status: string }>();
  const statements: D1PreparedStatement[] = [];
  if (!payment) {
    const paymentId = crypto.randomUUID();
    const paymentRef = await nextReference(db, "payment", "PAY");
    statements.push(
      db.prepare(
        `INSERT INTO payments (
          id,user_id,invoice_id,reference,amount_minor,currency,method,status,settlement_status,occurred_at,created_at
        ) VALUES (?,?,?,?,?,?,'bank_transfer','succeeded','settled',?,?)`,
      ).bind(paymentId, user.id, invoiceId, paymentRef, invoice.total_minor, invoice.currency, now, now),
    );
    payment = { id: paymentId, status: "succeeded" };
  } else if (payment.status !== "succeeded") {
    statements.push(
      db.prepare("UPDATE payments SET status='succeeded', settlement_status='settled' WHERE id=?").bind(payment.id),
    );
  }
  statements.push(
    db.prepare("UPDATE invoices SET status='paid', paid_at=? WHERE id=?").bind(now, invoiceId),
    db.prepare("UPDATE coupons SET used_count=used_count+1 WHERE id=(SELECT coupon_id FROM coupon_redemptions WHERE invoice_id=? AND status='reserved')").bind(invoiceId),
    db.prepare("UPDATE coupon_redemptions SET status='redeemed', redeemed_at=? WHERE invoice_id=? AND status='reserved'").bind(now, invoiceId),
  );
  await db.batch(statements);
  const applied = await applyInvoicePlanChange(db, invoiceId, user.id);
  return { ok: true, paymentId: payment.id, ...applied };
}
