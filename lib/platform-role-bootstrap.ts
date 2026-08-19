export const CUSTOMER_PERMISSIONS_JSON = '["wallets:own","documents:own"]';
export const SUPER_ADMIN_PERMISSIONS_JSON = '["*"]';

function normalizeAdminEmail(email: string) {
  return email.trim().toLowerCase();
}

function configuredAdminEmails() {
  return (process.env.WAZEN_ADMIN_EMAILS ?? "")
    .split(",")
    .map(normalizeAdminEmail)
    .filter(Boolean);
}

export function shouldBootstrapPlatformAdmin(email: string) {
  return configuredAdminEmails().includes(normalizeAdminEmail(email));
}

export async function ensureBootstrapPlatformRole(db: D1Database, userId: string, email: string, createdAt: string) {
  const current = await db.prepare("SELECT role FROM platform_roles WHERE user_id=?").bind(userId).first<{ role: string }>();
  const shouldBeAdmin = shouldBootstrapPlatformAdmin(email);
  const nextRole = shouldBeAdmin ? "super_admin" : "customer";
  const nextPermissions = shouldBeAdmin ? SUPER_ADMIN_PERMISSIONS_JSON : CUSTOMER_PERMISSIONS_JSON;

  if (!current) {
    await db.prepare("INSERT INTO platform_roles (user_id,role,permissions_json,created_at,updated_at) VALUES (?,?,?,?,?)")
      .bind(userId, nextRole, nextPermissions, createdAt, createdAt)
      .run();
    return nextRole;
  }

  // Promote bootstrap admins created earlier through BHD/Google/local flows,
  // but never demote an existing explicit role when the env list changes.
  if (shouldBeAdmin && current.role === "customer") {
    await db.prepare("UPDATE platform_roles SET role='super_admin',permissions_json=?,updated_at=? WHERE user_id=?")
      .bind(SUPER_ADMIN_PERMISSIONS_JSON, createdAt, userId)
      .run();
    return "super_admin";
  }

  return current.role;
}
