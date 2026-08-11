import { env } from "cloudflare:workers";
import { getNodeSqliteD1 } from "./node-sqlite-d1";

export function getRawDb(): D1Database {
  const bindings = env as unknown as { DB?: D1Database };
  if (bindings.DB) {
    return bindings.DB;
  }

  // Next.js (Vercel / local `next start`) — not Cloudflare Workers.
  const preferNodeSqlite =
    process.env.VERCEL === "1" ||
    process.env.WAZEN_USE_NODE_SQLITE === "1" ||
    process.env.NEXT_RUNTIME === "nodejs";

  if (preferNodeSqlite) {
    return getNodeSqliteD1();
  }

  throw new Error(
    "Database binding DB is unavailable. Enable D1 (`d1: DB` in .openai/hosting.json) or set WAZEN_USE_NODE_SQLITE=1 for Next.js/Vercel.",
  );
}

export async function ensureSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      display_name TEXT NOT NULL,
      locale TEXT NOT NULL DEFAULT 'ar',
      currency TEXT NOT NULL DEFAULT 'SAR',
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS spaces (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      type TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'SAR',
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
      country TEXT NOT NULL DEFAULT 'SA',
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
      currency TEXT NOT NULL DEFAULT 'SAR',
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
      currency TEXT NOT NULL DEFAULT 'SAR',
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
      currency TEXT NOT NULL DEFAULT 'SAR',
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
    db.prepare("CREATE INDEX IF NOT EXISTS idx_spaces_owner_user_id ON spaces(owner_user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_members_space_id ON members(space_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_transactions_space_date ON transactions(space_id, occurred_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON subscriptions(user_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_invoices_user_created ON invoices(user_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_payments_status_date ON payments(status, occurred_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_documents_owner_date ON documents(owner_user_id, issued_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_audit_logs_user_date ON audit_logs(user_id, created_at)"),
  ]);
}

export type RequestUser = {
  id: string;
  email: string;
  displayName: string;
  isDemo: boolean;
};

export function getRequestUser(request: Request): RequestUser | null {
  const id = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email");
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");

  if (id && email) {
    let fullName: string | null = null;
    if (encodedName && encoding === "percent-encoded-utf-8") {
      try {
        fullName = decodeURIComponent(encodedName);
      } catch {
        fullName = null;
      }
    }
    return { id, email, displayName: fullName ?? email.split("@")[0], isDemo: false };
  }

  const host = new URL(request.url).hostname;
  const isLocalHost = host === "localhost" || host === "127.0.0.1";
  // On Vercel (no OpenAI SIWC headers) keep a stable demo identity so the UI works.
  if (isLocalHost || process.env.VERCEL === "1" || process.env.WAZEN_DEMO_AUTH === "1") {
    return {
      id: "local-demo-user",
      email: "demo@wazen.app",
      displayName: "أحمد محمد",
      isDemo: true,
    };
  }

  return null;
}
