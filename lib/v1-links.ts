/** Business API v1 — personal hub wallet links. */

import type { RequestUser } from "../db/runtime";
import { prepareAudit } from "./audit";
import { ApiError } from "./security";

export async function listV1SpaceLinks(db: D1Database, hubSpaceId: string) {
  const rows = await db.prepare(`
    SELECT sl.id, sl.hub_space_id, sl.linked_space_id, sl.status, sl.created_at,
      s.name_ar, s.name_en, s.type, s.currency, s.balance_minor
    FROM space_links sl
    JOIN spaces s ON s.id=sl.linked_space_id
    WHERE sl.hub_space_id=? AND sl.status='active'
    ORDER BY sl.created_at DESC
  `).bind(hubSpaceId).all<{
    id: string; hub_space_id: string; linked_space_id: string; status: string; created_at: string;
    name_ar: string; name_en: string; type: string; currency: string; balance_minor: number;
  }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    hubSpaceId: row.hub_space_id,
    linkedSpaceId: row.linked_space_id,
    status: row.status,
    createdAt: row.created_at,
    linked: {
      id: row.linked_space_id,
      nameAr: row.name_ar,
      nameEn: row.name_en,
      type: row.type,
      currency: row.currency || "OMR",
      balanceMinor: Number(row.balance_minor) || 0,
    },
  }));
}

export async function linkV1Spaces(
  db: D1Database,
  user: RequestUser,
  hub: { id: string; owner_user_id: string; type: string },
  linked: { id: string; owner_user_id: string },
) {
  if (hub.id === linked.id) throw new ApiError(400, "CANNOT_LINK_SELF");
  if (hub.type !== "personal") throw new ApiError(400, "INVALID_WALLET_TYPE");
  if (hub.owner_user_id !== user.id || linked.owner_user_id !== user.id) throw new ApiError(403, "FORBIDDEN");
  const existing = await db.prepare("SELECT id FROM space_links WHERE hub_space_id=? AND linked_space_id=?")
    .bind(hub.id, linked.id).first();
  if (existing) throw new ApiError(409, "WALLET_ALREADY_LINKED");
  const createdAt = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO space_links (id,hub_space_id,linked_space_id,status,created_at) VALUES (?,?,?,'active',?)")
      .bind(id, hub.id, linked.id, createdAt),
    prepareAudit(db, {
      userId: user.id,
      action: "wallet.linked",
      entityType: "space",
      entityId: hub.id,
      metadata: { linkedSpaceId: linked.id, via: "api.v1" },
      createdAt,
    }),
  ]);
  return { id, hubSpaceId: hub.id, linkedSpaceId: linked.id, status: "active" as const, createdAt };
}

export async function unlinkV1Spaces(
  db: D1Database,
  user: RequestUser,
  hubSpaceId: string,
  linkedSpaceId: string,
) {
  const createdAt = new Date().toISOString();
  await db.batch([
    db.prepare("DELETE FROM space_bank_links WHERE hub_space_id=? AND linked_space_id=?")
      .bind(hubSpaceId, linkedSpaceId),
    db.prepare("DELETE FROM space_links WHERE hub_space_id=? AND linked_space_id=?")
      .bind(hubSpaceId, linkedSpaceId),
    prepareAudit(db, {
      userId: user.id,
      action: "wallet.unlinked",
      entityType: "space",
      entityId: hubSpaceId,
      metadata: { linkedSpaceId, via: "api.v1" },
      createdAt,
    }),
  ]);
  return { hubSpaceId, linkedSpaceId, status: "unlinked" as const, unlinkedAt: createdAt };
}
