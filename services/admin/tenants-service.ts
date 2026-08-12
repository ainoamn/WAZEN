/**
 * Admin tenants listing — server-side pagination with whitelist filters.
 */

export type AdminTenantListQuery = {
  q?: string;
  page?: number;
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export function normalizeAdminTenantListQuery(input: AdminTenantListQuery = {}) {
  const page = Math.max(1, Number(input.page ?? 1) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(input.pageSize ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE));
  const q = String(input.q ?? "").trim().slice(0, 80);
  return { page, pageSize, q, offset: (page - 1) * pageSize };
}

export async function listAdminTenants(db: D1Database, input: AdminTenantListQuery = {}) {
  const query = normalizeAdminTenantListQuery(input);
  const where: string[] = [];
  const args: Array<string | number> = [];
  if (query.q) {
    where.push("(t.name LIKE ? OR u.email LIKE ? OR u.display_name LIKE ?)");
    args.push(`%${query.q}%`, `%${query.q}%`, `%${query.q}%`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countRow = await db.prepare(`SELECT COUNT(*) AS count
    FROM tenants t
    LEFT JOIN users u ON u.id = t.created_by
    ${clause}`).bind(...args).first<{ count: number }>();

  const rows = await db.prepare(`SELECT t.id, t.name, t.country, t.currency, t.locale, t.timezone, t.created_at,
      t.created_by AS owner_user_id, u.email AS owner_email, u.display_name AS owner_name,
      (SELECT COUNT(*) FROM tenant_memberships m WHERE m.tenant_id=t.id AND m.status='active') AS member_count,
      (SELECT COUNT(*) FROM tenant_resources r WHERE r.tenant_id=t.id AND r.resource_type='space') AS space_count
    FROM tenants t
    LEFT JOIN users u ON u.id = t.created_by
    ${clause}
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?`).bind(...args, query.pageSize, query.offset).all<Record<string, unknown>>();

  return {
    items: rows.results,
    page: query.page,
    pageSize: query.pageSize,
    total: Number(countRow?.count ?? 0),
  };
}

export async function getAdminTenantDetail(db: D1Database, tenantId: string) {
  const tenant = await db.prepare(`SELECT t.*, u.email AS owner_email, u.display_name AS owner_name
    FROM tenants t LEFT JOIN users u ON u.id=t.created_by WHERE t.id=? LIMIT 1`).bind(tenantId).first<Record<string, unknown>>();
  if (!tenant) return null;
  const [members, resources] = await Promise.all([
    db.prepare(`SELECT m.user_id, m.role, m.status, m.created_at, u.email, u.display_name
      FROM tenant_memberships m LEFT JOIN users u ON u.id=m.user_id
      WHERE m.tenant_id=? ORDER BY m.created_at`).bind(tenantId).all(),
    db.prepare(`SELECT resource_type, resource_id, created_at FROM tenant_resources WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100`)
      .bind(tenantId).all(),
  ]);
  return { tenant, members: members.results, resources: resources.results };
}
