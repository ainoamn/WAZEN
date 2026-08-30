/** Server-only space role checks (DB + authorizeSpace). Do not import from Client Components. */

import type { RequestUser } from "../db/runtime";
import { ApiError } from "./api-error.ts";
import {
  canMutateCreatorTxn,
  parseSpaceRolePermissions,
  roleAllowsTxnAction,
  type SpaceTxnAction,
} from "./space-role-permissions.ts";

export async function resolveUserSpaceRole(
  db: D1Database,
  space: { id: string; owner_user_id: string },
  userId: string | null | undefined,
): Promise<string> {
  if (!userId) return "member";
  if (userId === space.owner_user_id) return "owner";
  const row = await db.prepare(
    "SELECT role FROM members WHERE space_id=? AND user_id=? AND status='active' LIMIT 1",
  ).bind(space.id, userId).first<{ role: string }>();
  return row?.role || "member";
}

export async function assertSpaceTxnAction(
  db: D1Database,
  user: RequestUser,
  spaceId: string,
  action: SpaceTxnAction,
  transaction?: { user_id?: string | null; space_id?: string } | null,
) {
  const { authorizeSpace } = await import("./authorization");
  const capability = action === "view" ? "read" : "transact";
  const space = await authorizeSpace(db, user, spaceId, capability);
  const permsRaw = await db.prepare("SELECT role_permissions_json FROM spaces WHERE id=?")
    .bind(spaceId)
    .first<{ role_permissions_json?: string | null }>()
    .catch(() => null);
  const map = parseSpaceRolePermissions(permsRaw?.role_permissions_json);
  const actorRole = space.effective_role || "member";

  if (!roleAllowsTxnAction(map, actorRole, action)) {
    throw new ApiError(403, "ROLE_PERMISSION_DENIED");
  }

  if ((action === "edit" || action === "delete") && transaction?.user_id) {
    const creatorRole = await resolveUserSpaceRole(db, space, transaction.user_id);
    if (!canMutateCreatorTxn(actorRole, creatorRole, action)) {
      throw new ApiError(403, "HIGHER_ROLE_TRANSACTION");
    }
  }

  return { space, actorRole, permissions: map };
}
