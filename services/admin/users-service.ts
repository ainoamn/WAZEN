/**
 * Admin users query helpers — pagination/filter whitelist for platform admin APIs.
 * Keep route handlers thin; move list/detail logic here gradually.
 */

export type AdminUserListQuery = {
  q?: string;
  status?: "active" | "suspended" | "closed" | "all";
  page?: number;
  pageSize?: number;
};

export type AdminUserListItem = {
  user_id: string;
  email: string;
  display_name: string;
  status: string;
  country: string | null;
  role: string;
  last_seen_at: string | null;
  created_at: string;
};

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export function normalizeAdminUserListQuery(input: AdminUserListQuery = {}) {
  const page = Math.max(1, Number(input.page ?? 1) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(input.pageSize ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE));
  const status = input.status && ["active", "suspended", "closed", "all"].includes(input.status) ? input.status : "all";
  const q = String(input.q ?? "").trim().slice(0, 80);
  return { page, pageSize, status, q, offset: (page - 1) * pageSize };
}

export async function listAdminUsers(db: D1Database, input: AdminUserListQuery = {}) {
  const query = normalizeAdminUserListQuery(input);
  const where: string[] = [];
  const args: Array<string | number> = [];

  if (query.status !== "all") {
    where.push("COALESCE(p.status,'active') = ?");
    args.push(query.status);
  }
  if (query.q) {
    where.push("(u.email LIKE ? OR u.display_name LIKE ?)");
    args.push(`%${query.q}%`, `%${query.q}%`);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const countRow = await db.prepare(`SELECT COUNT(*) AS count
    FROM users u
    LEFT JOIN customer_profiles p ON p.user_id = u.id
    LEFT JOIN platform_roles r ON r.user_id = u.id
    ${clause}`).bind(...args).first<{ count: number }>();

  const rows = await db.prepare(`SELECT u.id AS user_id, u.email, u.display_name, u.created_at,
      COALESCE(p.status,'active') AS status, p.country, p.last_seen_at,
      COALESCE(r.role,'customer') AS role
    FROM users u
    LEFT JOIN customer_profiles p ON p.user_id = u.id
    LEFT JOIN platform_roles r ON r.user_id = u.id
    ${clause}
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?`).bind(...args, query.pageSize, query.offset).all<AdminUserListItem>();

  return {
    items: rows.results,
    page: query.page,
    pageSize: query.pageSize,
    total: Number(countRow?.count ?? 0),
  };
}

export async function adminVerifyUserEmail(db: D1Database, userId: string, actorUserId: string) {
  const now = new Date().toISOString();
  const credential = await db
    .prepare("SELECT user_id, email_verified_at FROM auth_credentials WHERE user_id=?")
    .bind(userId)
    .first<{ user_id: string; email_verified_at: string | null }>();
  if (!credential) return { ok: false as const, reason: "NO_CREDENTIALS" as const };
  if (credential.email_verified_at) return { ok: true as const, alreadyVerified: true as const, verifiedAt: credential.email_verified_at };

  await db.batch([
    db.prepare("UPDATE auth_credentials SET email_verified_at=?, updated_at=? WHERE user_id=?").bind(now, now, userId),
    db.prepare("UPDATE email_verification_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL").bind(now, userId),
  ]);
  const { writeAudit } = await import("../../lib/audit");
  await writeAudit(db, {
    userId: actorUserId,
    action: "admin.email_verified_manual",
    entityType: "user",
    entityId: userId,
    metadata: { method: "manual" },
    createdAt: now,
  });
  return { ok: true as const, alreadyVerified: false as const, verifiedAt: now };
}

export async function adminUpdateUserProfile(
  db: D1Database,
  input: { userId: string; displayName?: string; status?: "active" | "suspended" | "closed"; actorUserId: string },
) {
  const now = new Date().toISOString();
  const user = await db.prepare("SELECT id, display_name FROM users WHERE id=?").bind(input.userId).first<{ id: string; display_name: string }>();
  if (!user) return null;

  if (input.displayName && input.displayName.trim().length >= 2) {
    await db.prepare("UPDATE users SET display_name=? WHERE id=?").bind(input.displayName.trim().slice(0, 120), input.userId).run();
  }

  if (input.status) {
    const existing = await db.prepare("SELECT user_id FROM customer_profiles WHERE user_id=?").bind(input.userId).first();
    if (existing) {
      await db.prepare("UPDATE customer_profiles SET status=? WHERE user_id=?").bind(input.status, input.userId).run();
    } else {
      await db
        .prepare("INSERT INTO customer_profiles (user_id,status,country,last_seen_at,created_at) VALUES (?,?,?,?,?)")
        .bind(input.userId, input.status, "OM", now, now)
        .run();
    }
    if (input.status !== "active") {
      await db.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(input.userId).run();
    }
  }

  const { writeAudit } = await import("../../lib/audit");
  await writeAudit(db, {
    userId: input.actorUserId,
    action: "admin.user_profile_updated",
    entityType: "user",
    entityId: input.userId,
    metadata: { displayName: input.displayName ?? null, status: input.status ?? null },
    createdAt: now,
  });
  return getAdminUserDetail(db, input.userId);
}

export async function getAdminUserDetail(db: D1Database, userId: string) {
  const profile = await db.prepare(`SELECT u.id AS user_id, u.email, u.display_name, u.locale, u.currency, u.created_at,
      COALESCE(p.status,'active') AS status, p.country, p.phone, p.last_seen_at,
      COALESCE(r.role,'customer') AS role, r.permissions_json,
      c.email_verified_at,
      s.id AS subscription_id, s.status AS subscription_status, s.billing_cycle,
      s.current_period_start, s.current_period_end, s.paused_at, s.admin_note,
      s.discount_percent, s.discount_fixed_minor, s.discount_label, s.gateway_id,
      s.features_grant_json, s.features_deny_json, s.wallet_limit_override, s.member_limit_override,
      s.transaction_limit_override, s.record_limit_override, s.user_limit_override,
      pl.id AS plan_id, pl.name_ar AS plan_name_ar, pl.name_en AS plan_name_en,
      pl.wallet_limit, pl.member_limit, pl.transaction_limit, pl.record_limit, pl.user_limit,
      pl.features_json, pl.monthly_minor, pl.annual_minor,
      CASE WHEN t.enabled_at IS NOT NULL THEN 1 ELSE 0 END AS totp_enabled
    FROM users u
    LEFT JOIN customer_profiles p ON p.user_id=u.id
    LEFT JOIN platform_roles r ON r.user_id=u.id
    LEFT JOIN auth_credentials c ON c.user_id=u.id
    LEFT JOIN subscriptions s ON s.user_id=u.id
    LEFT JOIN plans pl ON pl.id=s.plan_id
    LEFT JOIN totp_credentials t ON t.user_id=u.id
    WHERE u.id=?
    ORDER BY s.created_at DESC
    LIMIT 1`).bind(userId).first<Record<string, unknown>>();
  if (!profile) return null;

  const { getUserBillingHistory } = await import("./billing-service");
  const [sessions, apiKeys, spaces, memberships, recentAudit, billing] = await Promise.all([
    db.prepare(`SELECT id, created_at, last_seen_at, expires_at FROM auth_sessions WHERE user_id=? ORDER BY last_seen_at DESC LIMIT 50`)
      .bind(userId).all(),
    db.prepare(`SELECT id, name, key_prefix, scopes_json, expires_at, last_used_at, revoked_at, created_at
      FROM api_keys WHERE user_id=? ORDER BY created_at DESC LIMIT 50`).bind(userId).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, name_ar, name_en, type, currency, balance_minor, created_at FROM spaces WHERE owner_user_id=? ORDER BY created_at DESC`)
      .bind(userId).all(),
    db.prepare(`SELECT tm.tenant_id, tm.role, tm.status, t.name AS tenant_name, t.country, t.currency
      FROM tenant_memberships tm JOIN tenants t ON t.id=tm.tenant_id WHERE tm.user_id=? ORDER BY tm.created_at DESC`)
      .bind(userId).all(),
    db.prepare(`SELECT id, action, entity_type, entity_id, created_at FROM audit_logs WHERE user_id=? OR entity_id=? ORDER BY created_at DESC LIMIT 30`)
      .bind(userId, userId).all(),
    getUserBillingHistory(db, userId),
  ]);

  let features: string[] = [];
  try { features = JSON.parse(String(profile.features_json ?? "[]")); } catch { features = []; }
  const { resolveEntitlements, parsePlanFeatures } = await import("../../lib/plan-features");
  const effective = resolveEntitlements({
    planFeatures: features,
    grant: parsePlanFeatures(profile.features_grant_json),
    deny: parsePlanFeatures(profile.features_deny_json),
    walletLimit: Number(profile.wallet_limit ?? 1),
    memberLimit: Number(profile.member_limit ?? 2),
    transactionLimit: Number(profile.transaction_limit ?? 0),
    recordLimit: Number(profile.record_limit ?? 0),
    userLimit: Number(profile.user_limit ?? 1),
    walletLimitOverride: profile.wallet_limit_override as number | null,
    memberLimitOverride: profile.member_limit_override as number | null,
    transactionLimitOverride: profile.transaction_limit_override as number | null,
    recordLimitOverride: profile.record_limit_override as number | null,
    userLimitOverride: profile.user_limit_override as number | null,
    status: String(profile.subscription_status ?? "none"),
  });

  return {
    profile: {
      ...profile,
      features,
      features_grant: parsePlanFeatures(profile.features_grant_json),
      features_deny: parsePlanFeatures(profile.features_deny_json),
      effective_features: effective.features,
      effective_wallet_limit: effective.walletLimit,
      effective_member_limit: effective.memberLimit,
      effective_transaction_limit: effective.transactionLimit,
      effective_record_limit: effective.recordLimit,
      effective_user_limit: effective.userLimit,
    },
    sessions: sessions.results,
    apiKeys: apiKeys.results.map((row) => {
      try { return { ...row, scopes: JSON.parse(String(row.scopes_json ?? "[]")), scopes_json: undefined }; }
      catch { return { ...row, scopes: [], scopes_json: undefined }; }
    }),
    spaces: spaces.results,
    tenants: memberships.results,
    audit: recentAudit.results,
    billing,
  };
}
