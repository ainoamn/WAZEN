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
