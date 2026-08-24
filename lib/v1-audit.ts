/** Business API v1 — list space audit rows. */

export async function listV1SpaceAudit(
  db: D1Database,
  spaceId: string,
  options?: { limit?: number; q?: string },
) {
  const limit = Math.min(100, Math.max(1, options?.limit ?? 40));
  const q = options?.q?.trim() ?? "";
  const likeSpace = `%"spaceId":"${spaceId}"%`;
  const rows = q
    ? await db.prepare(`
        SELECT id, user_id, action, entity_type, entity_id, metadata_json, created_at
        FROM audit_logs
        WHERE (entity_id=? OR metadata_json LIKE ?)
          AND (action LIKE ? OR entity_type LIKE ? OR entity_id LIKE ? OR COALESCE(metadata_json,'') LIKE ?)
        ORDER BY created_at DESC
        LIMIT ?
      `).bind(spaceId, likeSpace, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, limit).all<{
        id: string; user_id: string; action: string; entity_type: string; entity_id: string;
        metadata_json: string | null; created_at: string;
      }>()
    : await db.prepare(`
        SELECT id, user_id, action, entity_type, entity_id, metadata_json, created_at
        FROM audit_logs
        WHERE entity_id=? OR metadata_json LIKE ?
        ORDER BY created_at DESC
        LIMIT ?
      `).bind(spaceId, likeSpace, limit).all<{
        id: string; user_id: string; action: string; entity_type: string; entity_id: string;
        metadata_json: string | null; created_at: string;
      }>();

  return (rows.results ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    createdAt: row.created_at,
  }));
}
