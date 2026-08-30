/** Configurable space role → transaction permissions (client-safe; no server imports). */

export type SpaceMemberRole = "owner" | "manager" | "supervisor" | "treasurer" | "member" | "auditor" | "viewer";
export type SpaceTxnAction = "view" | "add" | "edit" | "delete";

export type RoleTxnPermissions = {
  view: boolean;
  add: boolean;
  edit: boolean;
  delete: boolean;
};

export type SpaceRolePermissionsMap = Record<string, RoleTxnPermissions>;

/** Higher number = higher authority. Members cannot edit/delete posts from a higher rank. */
export const SPACE_ROLE_RANK: Record<string, number> = {
  owner: 100,
  manager: 80,
  supervisor: 60,
  treasurer: 40,
  member: 20,
  auditor: 10,
  viewer: 10,
};

export const CONFIGURABLE_SPACE_ROLES = ["manager", "supervisor", "treasurer", "member"] as const;

export const DEFAULT_SPACE_ROLE_PERMISSIONS: SpaceRolePermissionsMap = {
  manager: { view: true, add: true, edit: true, delete: true },
  supervisor: { view: true, add: true, edit: true, delete: false },
  treasurer: { view: true, add: true, edit: false, delete: true },
  member: { view: true, add: false, edit: false, delete: false },
  auditor: { view: true, add: false, edit: false, delete: false },
  viewer: { view: true, add: false, edit: false, delete: false },
};

export function parseSpaceRolePermissions(raw: string | null | undefined): SpaceRolePermissionsMap {
  let parsed: unknown = null;
  if (raw && String(raw).trim()) {
    try { parsed = JSON.parse(String(raw)); } catch { parsed = null; }
  }
  const out: SpaceRolePermissionsMap = {};
  for (const role of Object.keys(DEFAULT_SPACE_ROLE_PERMISSIONS)) {
    const defaults = DEFAULT_SPACE_ROLE_PERMISSIONS[role];
    const row = parsed && typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, Partial<RoleTxnPermissions>>)[role]
      : undefined;
    out[role] = {
      view: row?.view ?? defaults.view,
      add: row?.add ?? defaults.add,
      edit: row?.edit ?? defaults.edit,
      delete: row?.delete ?? defaults.delete,
    };
  }
  out.owner = { view: true, add: true, edit: true, delete: true };
  return out;
}

export function serializeSpaceRolePermissions(map: SpaceRolePermissionsMap): string {
  const slim: SpaceRolePermissionsMap = {};
  for (const role of CONFIGURABLE_SPACE_ROLES) {
    const row = map[role] ?? DEFAULT_SPACE_ROLE_PERMISSIONS[role];
    slim[role] = {
      view: Boolean(row.view),
      add: Boolean(row.add),
      edit: Boolean(row.edit),
      delete: Boolean(row.delete),
    };
  }
  return JSON.stringify(slim);
}

export function roleRank(role: string | null | undefined) {
  return SPACE_ROLE_RANK[String(role ?? "member")] ?? 0;
}

export function permissionsForRole(map: SpaceRolePermissionsMap, role: string | null | undefined): RoleTxnPermissions {
  if (role === "owner") return { view: true, add: true, edit: true, delete: true };
  return map[String(role ?? "member")] ?? DEFAULT_SPACE_ROLE_PERMISSIONS.member;
}

export function roleAllowsTxnAction(map: SpaceRolePermissionsMap, role: string | null | undefined, action: SpaceTxnAction) {
  return Boolean(permissionsForRole(map, role)[action]);
}

export function canMutateCreatorTxn(actorRole: string, creatorRole: string | null | undefined, action: "edit" | "delete") {
  if (action !== "edit" && action !== "delete") return true;
  if (!creatorRole) return true;
  if (actorRole === "owner") return true;
  return roleRank(actorRole) >= roleRank(creatorRole);
}

export function clientSpaceRolePermissions(space: { role_permissions_json?: string | null } | null | undefined) {
  return parseSpaceRolePermissions(space?.role_permissions_json);
}

export function clientCanSpaceTxnAction(input: {
  actorRole: string;
  space: { role_permissions_json?: string | null; owner_user_id?: string } | null | undefined;
  action: SpaceTxnAction;
  creatorUserId?: string | null;
  creatorRole?: string | null;
  ownerUserId?: string | null;
}) {
  const map = clientSpaceRolePermissions(input.space);
  if (!roleAllowsTxnAction(map, input.actorRole, input.action)) return false;
  if (input.action === "edit" || input.action === "delete") {
    let creatorRole = input.creatorRole ?? null;
    if (!creatorRole && input.creatorUserId && input.ownerUserId && input.creatorUserId === input.ownerUserId) {
      creatorRole = "owner";
    }
    if (creatorRole && !canMutateCreatorTxn(input.actorRole, creatorRole, input.action)) return false;
  }
  return true;
}

export function spaceRoleLabel(role: string, locale: "ar" | "en") {
  const labels: Record<string, { ar: string; en: string }> = {
    owner: { ar: "المالك", en: "Owner" },
    manager: { ar: "مدير", en: "Manager" },
    supervisor: { ar: "مشرف", en: "Supervisor" },
    treasurer: { ar: "أمين صندوق", en: "Treasurer" },
    member: { ar: "عضو", en: "Member" },
    auditor: { ar: "مراجع", en: "Auditor" },
    viewer: { ar: "مشاهد", en: "Viewer" },
  };
  const row = labels[role] ?? labels.member;
  return locale === "ar" ? row.ar : row.en;
}
