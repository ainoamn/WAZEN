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

const SCHEMA_VERSION = 22;
const schemaCache = new WeakMap<object, Promise<void>>();

type SchemaGlobal = typeof globalThis & { __wazen_schema_version__?: number };

export function ensureSchema(db: D1Database) {
  const global = globalThis as SchemaGlobal;
  if (global.__wazen_schema_version__ === SCHEMA_VERSION) return Promise.resolve();
  const key = db as unknown as object;
  const existing = schemaCache.get(key);
  if (existing) return existing;
  const pending = initializeSchema(db).catch((error) => { schemaCache.delete(key); throw error; });
  schemaCache.set(key, pending);
  return pending;
}

async function markSchemaReady() {
  (globalThis as SchemaGlobal).__wazen_schema_version__ = SCHEMA_VERSION;
}

async function ensureWalletLinkTables(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS space_links (
      id TEXT PRIMARY KEY,
      hub_space_id TEXT NOT NULL,
      linked_space_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      UNIQUE(hub_space_id, linked_space_id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_space_links_hub ON space_links(hub_space_id, status)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS space_bank_links (
      id TEXT PRIMARY KEY,
      hub_space_id TEXT NOT NULL,
      linked_space_id TEXT NOT NULL UNIQUE,
      account_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_space_bank_hub ON space_bank_links(hub_space_id, account_id)"),
  ]);
}

async function applyPostgresPaymentGuard(db: D1Database) {
  if (!hasNeonDatabaseUrl()) return;
  await db.prepare(`CREATE OR REPLACE FUNCTION wazen_payment_status_guard() RETURNS trigger AS $fn$
BEGIN
  IF NOT (
    (OLD.status = 'pending' AND NEW.status IN ('succeeded','failed'))
    OR (OLD.status = 'failed' AND NEW.status = 'pending')
    OR (OLD.status = 'succeeded' AND NEW.status = 'refunded')
  ) THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_TRANSITION';
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql`).run();
  await db.prepare("DROP TRIGGER IF EXISTS trg_payment_status_transition_pg ON payments").run();
  await db.prepare(`CREATE TRIGGER trg_payment_status_transition_pg
    BEFORE UPDATE OF status ON payments
    FOR EACH ROW
    EXECUTE FUNCTION wazen_payment_status_guard()`).run();
}

/** Defense-in-depth RLS on Neon. Default session sets app.bypass_rls=1 (see neon-d1).
 *  Set WAZEN_RLS_ENFORCE=1 and app.user_id per request to enforce membership policies. */
async function applyPostgresRls(db: D1Database) {
  if (!hasNeonDatabaseUrl()) return;
  const tables = [
    "spaces", "members", "member_installments", "contribution_plans", "transactions",
    "transaction_revisions", "documents", "invites", "journal_entries", "circle_configs",
    "circle_turns", "trip_expenses", "expense_splits", "settlements", "accounting_periods",
    "period_ledger_events", "personal_accounts", "personal_rules", "personal_occurrences",
    "space_payout_accounts", "family_events", "space_links", "space_bank_links",
  ];
  await db.prepare(`CREATE OR REPLACE FUNCTION wazen_space_visible(p_space_id text) RETURNS boolean AS $fn$
DECLARE
  uid text := nullif(current_setting('app.user_id', true), '');
BEGIN
  IF current_setting('app.bypass_rls', true) IS DISTINCT FROM '0' THEN
    RETURN true;
  END IF;
  IF uid IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM spaces s
    WHERE s.id = p_space_id AND (s.owner_user_id = uid OR EXISTS (
      SELECT 1 FROM members m WHERE m.space_id = s.id AND m.user_id = uid AND m.status = 'active'
    ))
  );
END;
$fn$ LANGUAGE plpgsql STABLE`).run();

  for (const table of tables) {
    try {
      await db.prepare(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`).run();
    } catch { /* table may not exist on partial DBs */ }
    try {
      await db.prepare(`DROP POLICY IF EXISTS wazen_tenant_all ON ${table}`).run();
    } catch { /* ignore */ }
  }

  const spaceIdExpr: Record<string, string> = {
    spaces: "id",
    transaction_revisions: `(SELECT t.space_id FROM transactions t WHERE t.id = transaction_revisions.transaction_id)`,
    expense_splits: `(SELECT te.space_id FROM trip_expenses te WHERE te.id = expense_splits.expense_id)`,
  };

  for (const table of tables) {
    const spaceExpr = spaceIdExpr[table] ?? "space_id";
    try {
      await db.prepare(`CREATE POLICY wazen_tenant_all ON ${table}
        FOR ALL
        USING (wazen_space_visible(${spaceExpr}))
        WITH CHECK (wazen_space_visible(${spaceExpr}))`).run();
    } catch { /* table missing or policy already valid */ }
  }
}

async function ensureBhdSubColumn(db: D1Database) {
  const userCols = await db.prepare("PRAGMA table_info(users)").all<{ name: string }>();
  if (!userCols.results.some((column) => column.name === "bhd_sub")) {
    try { await db.prepare("ALTER TABLE users ADD COLUMN bhd_sub TEXT").run(); }
    catch (error) {
      const refreshed = await db.prepare("PRAGMA table_info(users)").all<{ name: string }>();
      if (!refreshed.results.some((column) => column.name === "bhd_sub")) throw error;
    }
  }
  try { await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS users_bhd_sub_idx ON users(bhd_sub)").run(); } catch { /* exists */ }
}

async function ensureSchemaPatches(db: D1Database) {
  try {
    const { ensureEmailTemplatesTable } = await import("../lib/email-template-store");
    await ensureEmailTemplatesTable(db);
  } catch { /* best-effort */ }
  try { await ensureWalletLinkTables(db); } catch { /* created in batch on empty DBs that failed early */ }
  const memberColumns = await db.prepare("PRAGMA table_info(members)").all<{ name: string }>();
  if (!memberColumns.results.some((column) => column.name === "phone")) {
    try { await db.prepare("ALTER TABLE members ADD COLUMN phone TEXT").run(); }
    catch (error) {
      const refreshed = await db.prepare("PRAGMA table_info(members)").all<{ name: string }>();
      if (!refreshed.results.some((column) => column.name === "phone")) throw error;
    }
  }
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
  const sessionNames = new Set(sessionColumns.results.map((column) => column.name));
  if (!sessionNames.has("csrf_token_hash")) {
    try { await db.prepare("ALTER TABLE auth_sessions ADD COLUMN csrf_token_hash TEXT").run(); }
    catch (error) { const refreshed = await db.prepare("PRAGMA table_info(auth_sessions)").all<{ name: string }>(); if (!refreshed.results.some((column) => column.name === "csrf_token_hash")) throw error; }
  }
  for (const column of ["ip_hash", "ip_masked", "user_agent", "country_code"] as const) {
    if (!sessionNames.has(column)) {
      try { await db.prepare(`ALTER TABLE auth_sessions ADD COLUMN ${column} TEXT`).run(); } catch { /* exists */ }
    }
  }
  if (!sessionNames.has("browser_id")) {
    try { await db.prepare("ALTER TABLE auth_sessions ADD COLUMN browser_id TEXT").run(); } catch { /* exists */ }
    try { await db.prepare("CREATE INDEX IF NOT EXISTS idx_auth_sessions_browser ON auth_sessions(browser_id)").run(); } catch { /* exists */ }
  }
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS oauth_identities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      email TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(provider, provider_user_id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_oauth_identities_user ON oauth_identities(user_id)"),
  ]);
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS security_events (
      id TEXT PRIMARY KEY,
      ip_hash TEXT NOT NULL,
      ip_masked TEXT NOT NULL,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      country_code TEXT,
      user_agent TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_security_events_ip ON security_events(ip_hash, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id, created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS blocked_ips (
      ip_hash TEXT PRIMARY KEY,
      ip_masked TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'blocked' CHECK(status IN ('blocked','allowed')),
      blocked_by TEXT NOT NULL,
      blocked_at TEXT NOT NULL,
      expires_at TEXT
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_blocked_ips_status ON blocked_ips(status, expires_at)"),
  ]);
  const tripExpenseColumns = await db.prepare("PRAGMA table_info(trip_expenses)").all<{ name: string }>();
  const tripExpenseNames = new Set(tripExpenseColumns.results.map((column) => column.name));
  if (!tripExpenseNames.has("transaction_id")) {
    try { await db.prepare("ALTER TABLE trip_expenses ADD COLUMN transaction_id TEXT").run(); } catch { /* exists */ }
  }
  if (!tripExpenseNames.has("status")) {
    try { await db.prepare("ALTER TABLE trip_expenses ADD COLUMN status TEXT NOT NULL DEFAULT 'posted'").run(); } catch { /* exists */ }
  }
  if (!tripExpenseNames.has("paid_from")) {
    try { await db.prepare("ALTER TABLE trip_expenses ADD COLUMN paid_from TEXT NOT NULL DEFAULT 'member'").run(); } catch { /* exists */ }
  }
  const settlementColumns = await db.prepare("PRAGMA table_info(settlements)").all<{ name: string }>();
  if (!settlementColumns.results.some((column) => column.name === "expense_id")) {
    try { await db.prepare("ALTER TABLE settlements ADD COLUMN expense_id TEXT").run(); } catch { /* exists */ }
  }
  const memberAddon = await db.prepare("PRAGMA table_info(members)").all<{ name: string }>();
  if (!memberAddon.results.some((column) => column.name === "addon_minor")) {
    try { await db.prepare("ALTER TABLE members ADD COLUMN addon_minor INTEGER NOT NULL DEFAULT 0").run(); } catch { /* exists */ }
  }
  const spaceStart = await db.prepare("PRAGMA table_info(spaces)").all<{ name: string }>();
  if (!spaceStart.results.some((column) => column.name === "starts_at")) {
    try { await db.prepare("ALTER TABLE spaces ADD COLUMN starts_at TEXT").run(); } catch { /* exists */ }
  }
  if (!spaceStart.results.some((column) => column.name === "status")) {
    try { await db.prepare("ALTER TABLE spaces ADD COLUMN status TEXT NOT NULL DEFAULT 'active'").run(); } catch { /* exists */ }
  }
  const periodColumns = await db.prepare("PRAGMA table_info(accounting_periods)").all<{ name: string }>();
  const periodNames = new Set(periodColumns.results.map((column) => column.name));
  if (!periodNames.has("closed_by")) {
    try { await db.prepare("ALTER TABLE accounting_periods ADD COLUMN closed_by TEXT").run(); } catch { /* exists */ }
  }
  if (!periodNames.has("reopened_at")) {
    try { await db.prepare("ALTER TABLE accounting_periods ADD COLUMN reopened_at TEXT").run(); } catch { /* exists */ }
  }
  if (!periodNames.has("reopened_by")) {
    try { await db.prepare("ALTER TABLE accounting_periods ADD COLUMN reopened_by TEXT").run(); } catch { /* exists */ }
  }
  if (!periodNames.has("reopen_count")) {
    try { await db.prepare("ALTER TABLE accounting_periods ADD COLUMN reopen_count INTEGER NOT NULL DEFAULT 0").run(); } catch { /* exists */ }
  }
  const txnColumns = await db.prepare("PRAGMA table_info(transactions)").all<{ name: string }>();
  const txnNames = new Set(txnColumns.results.map((column) => column.name));
  if (!txnNames.has("account_id")) {
    try { await db.prepare("ALTER TABLE transactions ADD COLUMN account_id TEXT").run(); } catch { /* exists */ }
  }
  if (!txnNames.has("modified_at")) {
    try { await db.prepare("ALTER TABLE transactions ADD COLUMN modified_at TEXT").run(); } catch { /* exists */ }
  }
  if (!txnNames.has("edit_count")) {
    try { await db.prepare("ALTER TABLE transactions ADD COLUMN edit_count INTEGER NOT NULL DEFAULT 0").run(); } catch { /* exists */ }
  }
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS transaction_revisions (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      edited_by TEXT NOT NULL,
      editor_name TEXT NOT NULL,
      edited_at TEXT NOT NULL,
      kind TEXT NOT NULL,
      allocation TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      member_id TEXT,
      description_ar TEXT NOT NULL,
      description_en TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      status TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_transaction_revisions_txn ON transaction_revisions(transaction_id, edited_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_transactions_space_status_date ON transactions(space_id, status, occurred_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_transactions_member ON transactions(member_id, occurred_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS user_notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      title_ar TEXT NOT NULL,
      title_en TEXT NOT NULL,
      body_ar TEXT NOT NULL,
      body_en TEXT NOT NULL,
      href TEXT,
      read_at TEXT,
      created_at TEXT NOT NULL,
      dedupe_key TEXT NOT NULL,
      UNIQUE(user_id, dedupe_key)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications(user_id, created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS push_outbox (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      dedupe_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      sent_at TEXT,
      UNIQUE(user_id, dedupe_key)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_push_outbox_pending ON push_outbox(status, created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS job_runs (
      id TEXT PRIMARY KEY,
      job TEXT NOT NULL,
      status TEXT NOT NULL,
      detail_json TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_job_runs_created ON job_runs(created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS dues_digest_log (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      digest_day TEXT NOT NULL,
      overdue_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, digest_day)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_dues_digest_day ON dues_digest_log(digest_day)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS privacy_artifacts (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_privacy_artifacts_user ON privacy_artifacts(user_id, expires_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS integration_webhooks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      url TEXT NOT NULL,
      secret TEXT NOT NULL,
      events_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      revoked_at TEXT
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_integration_webhooks_user ON integration_webhooks(user_id, status)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS webhook_outbox (
      id TEXT PRIMARY KEY,
      webhook_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      event TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      sent_at TEXT
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_webhook_outbox_pending ON webhook_outbox(status, created_at)"),
  ]);
  const dataRequestCols = await db.prepare("PRAGMA table_info(data_requests)").all<{ name: string }>();
  if (!dataRequestCols.results.some((column) => column.name === "artifact_id")) {
    try { await db.prepare("ALTER TABLE data_requests ADD COLUMN artifact_id TEXT").run(); } catch { /* exists */ }
  }
  await applyPostgresRls(db);
  const personalRuleCols = await db.prepare("PRAGMA table_info(personal_rules)").all<{ name: string }>();
  if (!personalRuleCols.results.some((column) => column.name === "schedule")) {
    try { await db.prepare("ALTER TABLE personal_rules ADD COLUMN schedule TEXT NOT NULL DEFAULT 'monthly'").run(); } catch { /* exists */ }
  }
  const userCols = await db.prepare("PRAGMA table_info(users)").all<{ name: string }>();
  if (!userCols.results.some((column) => column.name === "avatar_url")) {
    try { await db.prepare("ALTER TABLE users ADD COLUMN avatar_url TEXT").run(); } catch { /* exists */ }
  }
  await ensureBhdSubColumn(db);
  const totpCols = await db.prepare("PRAGMA table_info(totp_credentials)").all<{ name: string }>();
  const totpNames = new Set(totpCols.results.map((column) => column.name));
  if (!totpNames.has("pending_encrypted_secret")) {
    try { await db.prepare("ALTER TABLE totp_credentials ADD COLUMN pending_encrypted_secret TEXT").run(); } catch { /* exists */ }
  }
  if (!totpNames.has("pending_key_version")) {
    try { await db.prepare("ALTER TABLE totp_credentials ADD COLUMN pending_key_version TEXT").run(); } catch { /* exists */ }
  }
  const { ensureSubscriptionAdminColumns, ensurePlanQuotaColumns, ensurePaymentGateways } = await import("../services/admin/billing-service");
  await ensureSubscriptionAdminColumns(db);
  await ensurePlanQuotaColumns(db);
  await ensurePaymentGateways(db);
  const { ensureInvoicePlanColumns } = await import("../lib/plan-change");
  await ensureInvoicePlanColumns(db);
  const { ensurePlanRetentionSchema } = await import("../lib/plan-retention");
  await ensurePlanRetentionSchema(db);
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

async function initializeSchema(db: D1Database) {
  try {
    const row = await db.prepare("SELECT version FROM schema_meta WHERE id=1").first<{ version: number }>();
    if (row && Number(row.version) >= SCHEMA_VERSION) {
      // Already current: do not CREATE/ALTER/INDEX here. Extra round-trips on Neon
      // (oauth tables + bhd_sub PRAGMA) made /home and /dashboard hang on the splash.
      await markSchemaReady();
      return;
    }
  } catch {
    /* schema_meta missing */
  }

  try {
    await db.prepare("SELECT id FROM users LIMIT 1").first();
    await db.prepare(`CREATE TABLE IF NOT EXISTS schema_meta (id INTEGER PRIMARY KEY, version INTEGER NOT NULL)`).run();
    await ensureSchemaPatches(db);
    await applyPostgresPaymentGuard(db);
    await applyPostgresRls(db);
    await db.prepare("INSERT INTO schema_meta (id, version) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET version=excluded.version").bind(SCHEMA_VERSION).run();
    await markSchemaReady();
    return;
  } catch {
    /* empty database — create tables */
  }

  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS schema_meta (
      id INTEGER PRIMARY KEY,
      version INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      locale TEXT NOT NULL DEFAULT 'ar',
      currency TEXT NOT NULL DEFAULT 'OMR',
      bhd_sub TEXT,
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
    db.prepare(`CREATE TABLE IF NOT EXISTS member_installments (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      space_id TEXT NOT NULL,
      period_index INTEGER NOT NULL,
      period_key TEXT NOT NULL,
      due_at TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      paid_minor INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'unpaid',
      created_at TEXT NOT NULL,
      UNIQUE(member_id, period_index)
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
      created_at TEXT NOT NULL,
      modified_at TEXT,
      edit_count INTEGER NOT NULL DEFAULT 0
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
      transaction_limit INTEGER NOT NULL DEFAULT 0,
      record_limit INTEGER NOT NULL DEFAULT 0,
      user_limit INTEGER NOT NULL DEFAULT 1,
      daily_transaction_limit INTEGER NOT NULL DEFAULT 0,
      monthly_transaction_limit INTEGER NOT NULL DEFAULT 0,
      print_limit INTEGER NOT NULL DEFAULT 0,
      features_json TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS quota_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_quota_events_user_kind ON quota_events(user_id, kind, created_at)"),
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
      csrf_token_hash TEXT,
      browser_id TEXT,
      ip_hash TEXT,
      ip_masked TEXT,
      user_agent TEXT,
      country_code TEXT,
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
    db.prepare(`CREATE TABLE IF NOT EXISTS security_events (
      id TEXT PRIMARY KEY,
      ip_hash TEXT NOT NULL,
      ip_masked TEXT NOT NULL,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      country_code TEXT,
      user_agent TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_security_events_ip ON security_events(ip_hash, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id, created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS blocked_ips (
      ip_hash TEXT PRIMARY KEY,
      ip_masked TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'blocked' CHECK(status IN ('blocked','allowed')),
      blocked_by TEXT NOT NULL,
      blocked_at TEXT NOT NULL,
      expires_at TEXT
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_blocked_ips_status ON blocked_ips(status, expires_at)"),
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
    db.prepare(`CREATE TABLE IF NOT EXISTS email_templates (
      id TEXT PRIMARY KEY,
      subject_ar TEXT NOT NULL,
      subject_en TEXT NOT NULL,
      body_html_ar TEXT NOT NULL,
      body_html_en TEXT NOT NULL,
      text_ar TEXT NOT NULL,
      text_en TEXT NOT NULL,
      updated_at TEXT
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
      completed_at TEXT,
      artifact_id TEXT
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
      last_used_step INTEGER, enabled_at TEXT, pending_encrypted_secret TEXT, pending_key_version TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
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
    db.prepare(`CREATE TABLE IF NOT EXISTS payment_gateways (
      id TEXT PRIMARY KEY,
      provider_key TEXT NOT NULL UNIQUE,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'local',
      countries_json TEXT NOT NULL DEFAULT '[]',
      methods_json TEXT NOT NULL DEFAULT '[]',
      is_enabled INTEGER NOT NULL DEFAULT 0,
      is_test_mode INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      config_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS plan_payment_gateways (
      plan_id TEXT NOT NULL,
      gateway_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(plan_id, gateway_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS financial_operation_claims (
      operation_type TEXT NOT NULL, resource_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY(operation_type,resource_id)
    )`),
    db.prepare("DROP TRIGGER IF EXISTS trg_payment_status_transition"),
    db.prepare(`CREATE TRIGGER trg_payment_status_transition BEFORE UPDATE OF status ON payments
      WHEN NOT ((OLD.status='pending' AND NEW.status IN ('succeeded','failed')) OR (OLD.status='failed' AND NEW.status='pending') OR (OLD.status='succeeded' AND NEW.status='refunded'))
      BEGIN SELECT RAISE(ABORT, 'INVALID_PAYMENT_TRANSITION'); END`),
    db.prepare("DROP TRIGGER IF EXISTS trg_space_nonnegative_balance"),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS trg_member_financial_bounds BEFORE UPDATE OF paid_minor,extra_minor ON members
      WHEN NEW.extra_minor < 0 OR NEW.paid_minor < 0 OR NEW.paid_minor > NEW.due_minor BEGIN SELECT RAISE(ABORT, 'MEMBER_FINANCIAL_BOUNDS'); END`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email COLLATE NOCASE)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_expiry ON auth_sessions(user_id,expires_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_auth_sessions_browser ON auth_sessions(browser_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS oauth_identities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      email TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(provider, provider_user_id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_oauth_identities_user ON oauth_identities(user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_journal_entries_space_date ON journal_entries(space_id,occurred_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(entry_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_trip_expenses_space ON trip_expenses(space_id,occurred_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_spaces_owner_user_id ON spaces(owner_user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_members_space_id ON members(space_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_member_installments_member ON member_installments(member_id, period_index)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_member_installments_space ON member_installments(space_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_transactions_space_date ON transactions(space_id, occurred_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON subscriptions(user_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_invoices_user_created ON invoices(user_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_payments_status_date ON payments(status, occurred_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_documents_owner_date ON documents(owner_user_id, issued_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_audit_logs_user_date ON audit_logs(user_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user ON tenant_memberships(user_id,status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id,revoked_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS saved_contacts (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS accounting_periods (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      label TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      closed_at TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS period_ledger_events (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      period_id TEXT,
      user_id TEXT NOT NULL,
      actor_name TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      summary_ar TEXT,
      summary_en TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_period_ledger_space_date ON period_ledger_events(space_id, created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS personal_accounts (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'bank',
      opening_minor INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_personal_accounts_space ON personal_accounts(space_id, status)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS personal_rules (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      account_id TEXT,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      amount_mode TEXT NOT NULL DEFAULT 'fixed',
      schedule TEXT NOT NULL DEFAULT 'monthly',
      amount_minor INTEGER NOT NULL DEFAULT 0,
      due_day INTEGER NOT NULL DEFAULT 1,
      starts_at TEXT NOT NULL,
      ends_at TEXT,
      total_minor INTEGER NOT NULL DEFAULT 0,
      duration_months INTEGER NOT NULL DEFAULT 0,
      paid_minor INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_personal_rules_space ON personal_rules(space_id, status)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS personal_occurrences (
      id TEXT PRIMARY KEY,
      rule_id TEXT NOT NULL,
      space_id TEXT NOT NULL,
      account_id TEXT,
      period_key TEXT NOT NULL,
      due_at TEXT NOT NULL,
      expected_minor INTEGER NOT NULL DEFAULT 0,
      actual_minor INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      transaction_id TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(rule_id, period_key)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_personal_occ_space ON personal_occurrences(space_id, status, period_key)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS space_payout_accounts (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      account_number TEXT NOT NULL,
      linked_member_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS family_events (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      title TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'outing',
      target_at TEXT NOT NULL,
      expected_minor INTEGER NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'planned',
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_family_events_space ON family_events(space_id, target_at)"),
  ]);
  await ensureSchemaPatches(db);
  await applyPostgresPaymentGuard(db);
  await applyPostgresRls(db);
  await db.prepare("INSERT INTO schema_meta (id, version) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET version=excluded.version").bind(SCHEMA_VERSION).run();
  await markSchemaReady();
}

export type RequestUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
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
