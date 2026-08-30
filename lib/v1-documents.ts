/** Business API v1 — list documents visible to the caller. */

import { formatMoneyMinor } from "./money";
import { planHasFeature } from "../services/admin/billing-service";
import { filterSpacesForPlanAccess } from "./plan-retention";

export async function listV1Documents(db: D1Database, userId: string) {
  const { getActivePlanEntitlements } = await import("../services/admin/billing-service");
  const entitlements = await getActivePlanEntitlements(db, userId, { skipSideEffects: true, skipUsage: true });
  if (!planHasFeature(entitlements.features, "documents")) {
    return { documents: [] as Array<Record<string, unknown>>, locked: true as const };
  }

  const [documents, spaces] = await Promise.all([
    db.prepare(`SELECT * FROM documents
      WHERE owner_user_id=? OR space_id IN (
        SELECT s.id FROM spaces s LEFT JOIN members m ON m.space_id=s.id AND m.status='active'
        WHERE s.owner_user_id=? OR m.user_id=?
      )
      ORDER BY issued_at DESC LIMIT 100`).bind(userId, userId, userId).all<Record<string, unknown>>(),
    db.prepare(`SELECT s.id,s.type,s.owner_user_id,s.grace_until,s.status FROM spaces s
      WHERE s.owner_user_id=? OR EXISTS (
        SELECT 1 FROM members m WHERE m.space_id=s.id AND m.status='active' AND m.user_id=?
      )`).bind(userId, userId).all<{ id: string; type: string; owner_user_id: string; grace_until: string | null; status: string | null }>(),
  ]);

  const allowedIds = new Set(
    filterSpacesForPlanAccess(spaces.results ?? [], entitlements.features, Date.now(), userId)
      .map((space) => String(space.id)),
  );

  const rows = (documents.results ?? []).filter((doc) => !doc.space_id || allowedIds.has(String(doc.space_id)));
  return {
    locked: false as const,
    documents: rows.map((doc) => {
      const currency = String(doc.currency ?? "OMR");
      const amountMinor = Number(doc.amount_minor) || 0;
      return {
        id: String(doc.id),
        type: String(doc.type),
        reference: String(doc.reference),
        personName: String(doc.person_name ?? ""),
        description: String(doc.description ?? ""),
        amountMinor,
        amountLabel: formatMoneyMinor(amountMinor, currency, "en"),
        currency,
        status: String(doc.status ?? "issued"),
        spaceId: doc.space_id == null ? null : String(doc.space_id),
        issuedAt: String(doc.issued_at ?? ""),
      };
    }),
  };
}
