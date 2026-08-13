import { env } from "../lib/cloudflare-workers-stub";
import { getLibsqlD1 } from "./libsql-d1";
import { getNeonD1, hasNeonDatabaseUrl } from "./neon-d1";
import { getNodeSqliteD1 } from "./node-sqlite-d1";
import {
  isProductionLikeRuntime,
  productionAuthRisks,
  productionSetupChecklist,
  type ProductionSetupItem,
} from "../lib/production-setup";

export {
  isProductionLikeRuntime,
  productionAuthRisks,
  productionSetupChecklist,
  type ProductionSetupItem,
};

export function getRawDb(): D1Database {
  const bindings = env as unknown as { DB?: D1Database };
  if (bindings.DB) {
    return bindings.DB;
  }

  // Prefer Neon Postgres when configured.
  if (hasNeonDatabaseUrl()) return getNeonD1();
  // Legacy Turso/libSQL remains supported.
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) return getLibsqlD1();
  if (process.env.WAZEN_USE_NODE_SQLITE === "1" || process.env.NODE_ENV === "development") return getNodeSqliteD1();

  throw new Error(
    "DATABASE_NOT_CONFIGURED",
  );
}

const schemaCache = new WeakMap<object, Promise<void>>();

export function ensureSchema(db: D1Database) {
  const key = db as unknown as object;
  const existing = schemaCache.get(key);
  if (existing) return existing;
  const pending = initializeSchema(db).catch((error) => { schemaCache.delete(key); throw error; });
  schemaCache.set(key, pending);
  return pending;
}

async function initializeSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      display_name TEXT NOT NULL,
      locale TEXT NOT NULL DEFAULT 'ar',
      currency TEXT NOT NULL DEFAULT 'OMR',
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS spaces (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      type TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'OMR',
      balance_minor INTEGER NOT NULL DEFAULT 0,
      goal_minor INTEGER NOT NULL DEFAULT 0,
      accent TEXT NOT NULL DEFAULT 'emerald',
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      user_id TEXT,
      display_name TEXT NOT NULL,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'active',
      due_minor INTEGER NOT NULL DEFAULT 0,
      paid_minor INTEGER NOT NULL DEFAULT 0,
      extra_minor INTEGER NOT NULL DEFAULT 0,
      avatar TEXT NOT NULL DEFAULT '#0f766e',
      joined_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS contribution_plans (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      interval TEXT NOT NULL DEFAULT 'monthly',
      due_day INTEGER NOT NULL DEFAULT 1,
      extra_policy TEXT NOT NULL DEFAULT 'personal_reserve',
      duration_months INTEGER NOT NULL DEFAULT 60,
      starts_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      member_id TEXT,
      kind TEXT NOT NULL,
      allocation TEXT NOT NULL DEFAULT 'general',
      amount_minor INTEGER NOT NULL,
      description_ar TEXT NOT NULL,
      description_en TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'approved',
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS platform_roles (
      user_id TEXT PRIMARY KEY,
      role TEXT NOT NULL DEFAULT 'customer',
      permissions_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS customer_profiles (
      user_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'active',
      country TEXT NOT NULL DEFAULT 'OM',
      phone TEXT,
      last_seen_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_ar TEXT NOT NULL,
      description_en TEXT NOT NULL,
      monthly_minor INTEGER NOT NULL DEFAULT 0,
      annual_minor INTEGER NOT NULL DEFAULT 0,
      wallet_limit INTEGER NOT NULL DEFAULT 1,
      member_limit INTEGER NOT NULL DEFAULT 2,
      features_json TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'trialing',
      billing_cycle TEXT NOT NULL DEFAULT 'monthly',
      current_period_start TEXT NOT NULL,
      current_period_end TEXT NOT NULL,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subscription_id TEXT,
      reference TEXT NOT NULL UNIQUE,
      subtotal_minor INTEGER NOT NULL,
      discount_minor INTEGER NOT NULL DEFAULT 0,
      tax_minor INTEGER NOT NULL DEFAULT 0,
      total_minor INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'OMR',
      status TEXT NOT NULL DEFAULT 'pending',
      due_at TEXT NOT NULL,
      paid_at TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      invoice_id TEXT,
      reference TEXT NOT NULL UNIQUE,
      amount_minor INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'OMR',
      method TEXT NOT NULL DEFAULT 'bank_transfer',
      status TEXT NOT NULL DEFAULT 'pending',
      settlement_status TEXT NOT NULL DEFAULT 'unsettled',
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS coupons (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      discount_type TEXT NOT NULL DEFAULT 'percent',
      value INTEGER NOT NULL,
      usage_limit INTEGER NOT NULL DEFAULT 100,
      used_count INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      space_id TEXT,
      type TEXT NOT NULL,
      reference TEXT NOT NULL UNIQUE,
      person_name TEXT NOT NULL,
      description TEXT NOT NULL,
      amount_minor INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'OMR',
      status TEXT NOT NULL DEFAULT 'issued',
      payment_method TEXT NOT NULL DEFAULT 'bank_transfer',
      approved_by TEXT,
      issued_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS document_sequences (
      key TEXT PRIMARY KEY,
      next_value INTEGER NOT NULL DEFAULT 1
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_credentials (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_iterations INTEGER NOT NULL DEFAULT 600000,
      email_verified_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS admin_bootstrap_tokens (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      display_name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      hits INTEGER NOT NULL DEFAULT 0,
      window_started_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      response_json TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      PRIMARY KEY (key, user_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE RESTRICT,
      transaction_id TEXT REFERENCES transactions(id) ON DELETE RESTRICT,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'posted' CHECK(status IN ('posted','reversed')),
      reversal_of TEXT REFERENCES journal_entries(id) ON DELETE RESTRICT,
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS journal_lines (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      account_code TEXT NOT NULL,
      member_id TEXT,
      debit_minor INTEGER NOT NULL DEFAULT 0 CHECK(debit_minor >= 0),
      credit_minor INTEGER NOT NULL DEFAULT 0 CHECK(credit_minor >= 0),
      created_at TEXT NOT NULL,
      CHECK((debit_minor = 0 AND credit_minor > 0) OR (credit_minor = 0 AND debit_minor > 0))
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS circle_configs (
      space_id TEXT PRIMARY KEY REFERENCES spaces(id) ON DELETE CASCADE,
      ordering_mode TEXT NOT NULL DEFAULT 'manual',
      draw_seed_hash TEXT,
      current_turn INTEGER NOT NULL DEFAULT 0,
      updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS circle_turns (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
      turn_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
      scheduled_at TEXT,
      paid_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(space_id, turn_number)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS trip_expenses (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
      paid_by_member_id TEXT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
      amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
      description TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS expense_splits (
      id TEXT PRIMARY KEY,
      expense_id TEXT NOT NULL REFERENCES trip_expenses(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
      share_minor INTEGER NOT NULL CHECK(share_minor >= 0),
      UNIQUE(expense_id, member_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS settlements (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
      from_member_id TEXT NOT NULL,
      to_member_id TEXT NOT NULL,
      amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
      status TEXT NOT NULL DEFAULT 'pending',
      settled_at TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS email_outbox (
      id TEXT PRIMARY KEY,
      recipient TEXT NOT NULL,
      template TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      sent_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS webhook_events (
      provider TEXT NOT NULL,
      event_id TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      processed_at TEXT NOT NULL,
      PRIMARY KEY(provider,event_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS coupon_redemptions (
      id TEXT PRIMARY KEY,
      coupon_id TEXT NOT NULL REFERENCES coupons(id) ON DELETE RESTRICT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL UNIQUE REFERENCES invoices(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'reserved',
      created_at TEXT NOT NULL,
      redeemed_at TEXT
    )`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS trg_coupon_usage_limit BEFORE UPDATE OF used_count ON coupons
      WHEN NEW.used_count > NEW.usage_limit BEGIN SELECT RAISE(ABORT, 'COUPON_USAGE_LIMIT'); END`),
    db.prepare(`CREATE TABLE IF NOT EXISTS data_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('export','deletion')),
      status TEXT NOT NULL DEFAULT 'pending',
      requested_at TEXT NOT NULL,
      completed_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, country TEXT NOT NULL DEFAULT 'OM', currency TEXT NOT NULL DEFAULT 'OMR',
      locale TEXT NOT NULL DEFAULT 'ar', timezone TEXT NOT NULL DEFAULT 'Asia/Muscat', created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS tenant_memberships (
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('owner','admin','finance','member','auditor','viewer')), status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL,
      PRIMARY KEY(tenant_id,user_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS tenant_resources (
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, resource_type TEXT NOT NULL, resource_id TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY(resource_type,resource_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS totp_credentials (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, encrypted_secret TEXT NOT NULL, key_version TEXT NOT NULL,
      last_used_step INTEGER, enabled_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL, key_prefix TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, scopes_json TEXT NOT NULL, expires_at TEXT, last_used_at TEXT, revoked_at TEXT, created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS payment_provider_settings (
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, provider TEXT NOT NULL, endpoint_url TEXT NOT NULL,
      encrypted_config TEXT NOT NULL, key_version TEXT NOT NULL, updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, updated_at TEXT NOT NULL,
      PRIMARY KEY(tenant_id,provider)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS financial_operation_claims (
      operation_type TEXT NOT NULL, resource_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY(operation_type,resource_id)
    )`),
    db.prepare("DROP TRIGGER IF EXISTS trg_payment_status_transition"),
    db.prepare(`CREATE TRIGGER trg_payment_status_transition BEFORE UPDATE OF status ON payments
      WHEN NOT ((OLD.status='pending' AND NEW.status IN ('succeeded','failed')) OR (OLD.status='failed' AND NEW.status='pending') OR (OLD.status='succeeded' AND NEW.status='refunded'))
      BEGIN SELECT RAISE(ABORT, 'INVALID_PAYMENT_TRANSITION'); END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS trg_space_nonnegative_balance BEFORE UPDATE OF balance_minor ON spaces
      WHEN NEW.balance_minor < 0 BEGIN SELECT RAISE(ABORT, 'INSUFFICIENT_FUNDS'); END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS trg_member_financial_bounds BEFORE UPDATE OF paid_minor,extra_minor ON members
      WHEN NEW.extra_minor < 0 OR NEW.paid_minor < 0 OR NEW.paid_minor > NEW.due_minor BEGIN SELECT RAISE(ABORT, 'MEMBER_FINANCIAL_BOUNDS'); END`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email COLLATE NOCASE)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_expiry ON auth_sessions(user_id,expires_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_journal_entries_space_date ON journal_entries(space_id,occurred_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(entry_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_trip_expenses_space ON trip_expenses(space_id,occurred_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_spaces_owner_user_id ON spaces(owner_user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_members_space_id ON members(space_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_transactions_space_date ON transactions(space_id, occurred_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON subscriptions(user_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_invoices_user_created ON invoices(user_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_payments_status_date ON payments(status, occurred_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_documents_owner_date ON documents(owner_user_id, issued_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_audit_logs_user_date ON audit_logs(user_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user ON tenant_memberships(user_id,status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id,revoked_at)"),
  ]);
  const contributionColumns = await db.prepare("PRAGMA table_info(contribution_plans)").all<{ name: string }>();
  if (!contributionColumns.results.some((column) => column.name === "duration_months")) {
    try {
      await db.prepare("ALTER TABLE contribution_plans ADD COLUMN duration_months INTEGER NOT NULL DEFAULT 60").run();
    } catch (error) {
      const refreshed = await db.prepare("PRAGMA table_info(contribution_plans)").all<{ name: string }>();
      if (!refreshed.results.some((column) => column.name === "duration_months")) throw error;
    }
  }
  const sessionColumns = await db.prepare("PRAGMA table_info(auth_sessions)").all<{ name: string }>();
  if (!sessionColumns.results.some((column) => column.name === "csrf_token_hash")) {
    try { await db.prepare("ALTER TABLE auth_sessions ADD COLUMN csrf_token_hash TEXT").run(); }
    catch (error) { const refreshed = await db.prepare("PRAGMA table_info(auth_sessions)").all<{ name: string }>(); if (!refreshed.results.some((column) => column.name === "csrf_token_hash")) throw error; }
  }
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO tenants (id,name,country,currency,locale,timezone,created_by,created_at)
      SELECT 'tenant:'||id,display_name,'OM',currency,locale,'Asia/Muscat',id,created_at FROM users`),
    db.prepare(`INSERT OR IGNORE INTO tenant_memberships (tenant_id,user_id,role,status,created_at)
      SELECT 'tenant:'||id,id,'owner','active',created_at FROM users`),
    db.prepare(`INSERT OR IGNORE INTO tenant_resources (tenant_id,resource_type,resource_id,created_at)
      SELECT 'tenant:'||owner_user_id,'space',id,created_at FROM spaces`),
    db.prepare(`INSERT OR IGNORE INTO tenant_resources (tenant_id,resource_type,resource_id,created_at)
      SELECT 'tenant:'||owner_user_id,'document',id,created_at FROM documents`),
    db.prepare(`INSERT OR IGNORE INTO tenant_resources (tenant_id,resource_type,resource_id,created_at)
      SELECT 'tenant:'||user_id,'invoice',id,created_at FROM invoices`),
    db.prepare(`INSERT OR IGNORE INTO tenant_resources (tenant_id,resource_type,resource_id,created_at)
      SELECT 'tenant:'||user_id,'payment',id,created_at FROM payments`),
  ]);
}

export type RequestUser = {
  id: string;
  email: string;
  displayName: string;
  isDemo: boolean;
  authType?: "session" | "api_key" | "hosted" | "demo";
  scopes?: string[];
};

export function getRequestUser(request: Request): RequestUser | null {
  // Production/Vercel must never honor demo identity or spoofable hosted headers,
  // even if misconfigured env vars are present.
  if (isProductionLikeRuntime()) return null;

  const id = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email");
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");

  const trustHostedHeaders = process.env.WAZEN_TRUST_OAI_HEADERS === "1";
  if (trustHostedHeaders && id && email) {
    let fullName: string | null = null;
    if (encodedName && encoding === "percent-encoded-utf-8") {
      try {
        fullName = decodeURIComponent(encodedName);
      } catch {
        fullName = null;
      }
    }
    return { id, email, displayName: fullName ?? email.split("@")[0], isDemo: false, authType: "hosted" };
  }

  if (process.env.WAZEN_DEMO_MODE === "1") {
    return {
      id: "local-demo-user",
      email: "demo@wazen.app",
      displayName: "أحمد محمد",
      isDemo: true, authType: "demo",
    };
  }

  return null;
}
