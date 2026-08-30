import type { RequestUser } from "../db/runtime";
import { ApiError } from "./security";
import { PLATFORM_CONSOLE_ROLES, canOpenPlatformConsole } from "./platform-console";
import { planHasFeature } from "./plan-features";

export type PlatformRole = "super_admin" | "admin" | "finance" | "support" | "customer";
/** documents:issue = print / receipts / statements (elevated roles only). */
export type SpaceCapability = "read" | "transact" | "members:write" | "circle:write" | "settlements:write" | "documents:issue";

const platformPermissions: Record<PlatformRole, ReadonlySet<string>> = {
  super_admin: new Set(["*"]),
  admin: new Set(["users:read", "users:status", "roles:write", "plans:write", "coupons:write", "payments:write", "providers:write", "billing:read", "reports:read"]),
  finance: new Set(["payments:write", "providers:write", "billing:read", "reports:read", "plans:write"]),
  support: new Set(["users:read"]),
  customer: new Set(),
};

const spaceRoles: Record<SpaceCapability, ReadonlySet<string>> = {
  read: new Set(["owner", "manager", "supervisor", "treasurer", "member", "auditor", "viewer"]),
  // Invited members may view; add/edit/delete further gated by role_permissions_json.
  transact: new Set(["owner", "manager", "supervisor", "treasurer", "member"]),
  "members:write": new Set(["owner", "manager"]),
  "circle:write": new Set(["owner", "manager"]),
  "settlements:write": new Set(["owner", "manager", "treasurer", "supervisor"]),
  "documents:issue": new Set(["owner", "manager", "treasurer", "supervisor"]),
};

const apiScopes: Record<SpaceCapability, string> = {
  read: "wallets:read",
  transact: "wallets:write",
  "members:write": "members:write",
  "circle:write": "circles:write",
  "settlements:write": "settlements:write",
  "documents:issue": "documents:write",
};

export { PLATFORM_CONSOLE_ROLES, canOpenPlatformConsole };

/** Print / statements / invoices: elevated space role AND a paid print-capable plan on the actor. */
export function actorCanIssueSpaceDocuments(role: string, features: string[]) {
  if (!spaceRoles["documents:issue"].has(role)) return false;
  return planHasFeature(features, "documents")
    || planHasFeature(features, "statements")
    || planHasFeature(features, "downloads");
}

export async function platformRoleOf(db: D1Database, userId: string) {
  const row = await db.prepare("SELECT role FROM platform_roles WHERE user_id=?").bind(userId).first<{ role: string }>();
  return row?.role ?? "customer";
}

export function assertPlatformPermission(role: string, permission: string) {
  const granted = platformPermissions[role as PlatformRole] ?? platformPermissions.customer;
  if (!granted.has("*") && !granted.has(permission)) throw new ApiError(403, "FORBIDDEN");
}

export function assertApiScope(user: RequestUser, required: string) {
  if (user.authType !== "api_key") return;
  if (!user.scopes?.includes(required)) throw new ApiError(403, "API_SCOPE_REQUIRED");
}

export async function authorizeSpace(db: D1Database, user: RequestUser, spaceId: string, capability: SpaceCapability, allowedTypes?: string[]) {
  assertApiScope(user, apiScopes[capability]);
  const row = await db.prepare(`SELECT s.id,s.owner_user_id,s.type,s.currency,s.balance_minor,s.grace_until,s.status,
      CASE WHEN s.owner_user_id=? THEN 'owner' ELSE m.role END AS effective_role
    FROM spaces s LEFT JOIN members m ON m.space_id=s.id AND m.user_id=? AND m.status='active'
    WHERE s.id=? AND (s.owner_user_id=? OR m.user_id=?) LIMIT 1`)
    .bind(user.id, user.id, spaceId, user.id, user.id)
    .first<{ id: string; owner_user_id: string; type: string; currency: string; balance_minor: number; grace_until: string | null; status: string | null; effective_role: string }>();
  if (!row) throw new ApiError(404, "WALLET_NOT_FOUND");
  if (!spaceRoles[capability].has(row.effective_role)) throw new ApiError(403, "FORBIDDEN");
  if (allowedTypes && !allowedTypes.includes(row.type)) throw new ApiError(400, "INVALID_WALLET_TYPE");

  const isOwner = row.owner_user_id === user.id;
  // Owners: plan must include the wallet type (or grace). Guests: membership grants access to that space.
  if (isOwner) {
    const { getActivePlanEntitlements, planAllowsSpaceType } = await import("../services/admin/billing-service");
    const { spaceInUserGrace } = await import("./plan-retention");
    const entitlements = await getActivePlanEntitlements(db, user.id, { skipSideEffects: true, skipUsage: true });
    if (!planAllowsSpaceType(entitlements.features, row.type) && !spaceInUserGrace(row)) {
      throw new ApiError(403, "PLAN_FEATURE_REQUIRED");
    }
  }

  if (capability === "documents:issue") {
    const { getActivePlanEntitlements } = await import("../services/admin/billing-service");
    const entitlements = await getActivePlanEntitlements(db, user.id, { skipSideEffects: true, skipUsage: true });
    if (!actorCanIssueSpaceDocuments(row.effective_role, entitlements.features)) {
      throw new ApiError(403, "PLAN_FEATURE_REQUIRED");
    }
  }

  return row;
}

export async function ensureDefaultTenant(db: D1Database, user: Pick<RequestUser, "id" | "displayName">) {
  const tenantId = `tenant:${user.id}`; const now = new Date().toISOString();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO tenants (id,name,country,currency,locale,timezone,created_by,created_at) VALUES (?,?, 'OM','OMR','ar','Asia/Muscat',?,?)").bind(tenantId, user.displayName, user.id, now),
    db.prepare("INSERT OR IGNORE INTO tenant_memberships (tenant_id,user_id,role,status,created_at) VALUES (?,?,'owner','active',?)").bind(tenantId, user.id, now),
  ]);
  return tenantId;
}

export async function bindTenantResource(db: D1Database, tenantId: string, resourceType: string, resourceId: string) {
  await db.prepare("INSERT OR IGNORE INTO tenant_resources (tenant_id,resource_type,resource_id,created_at) VALUES (?,?,?,?)")
    .bind(tenantId, resourceType, resourceId, new Date().toISOString()).run();
}

export async function assertTenantResource(db: D1Database, userId: string, resourceType: string, resourceId: string) {
  const row = await db.prepare(`SELECT tr.resource_id FROM tenant_resources tr JOIN tenant_memberships tm ON tm.tenant_id=tr.tenant_id
    WHERE tr.resource_type=? AND tr.resource_id=? AND tm.user_id=? AND tm.status='active' LIMIT 1`).bind(resourceType, resourceId, userId).first();
  if (!row) throw new ApiError(404, "RESOURCE_NOT_FOUND");
}
