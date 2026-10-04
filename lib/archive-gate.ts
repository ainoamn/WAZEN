/** Archiving seals a wallet (read-only, hidden), so it is refused until every balance is settled and zeroed. */

import { ApiError } from "./api-error";
import { rebuildSpaceTripSettlements } from "./trip-settlements";

export type ArchiveBlockers = {
  pendingSettlements: number;
  pendingSettlementsMinor: number;
  unpaidInstallments: number;
  unpaidInstallmentsMinor: number;
};

export function archiveIsClear(blockers: ArchiveBlockers) {
  return blockers.pendingSettlements === 0 && blockers.unpaidInstallments === 0;
}

export async function archiveBlockers(db: D1Database, spaceId: string): Promise<ArchiveBlockers> {
  const space = await db.prepare("SELECT type FROM spaces WHERE id=?").bind(spaceId).first<{ type: string }>();
  if (space?.type === "trip" || space?.type === "household") await rebuildSpaceTripSettlements(db, spaceId);
  const [pending, unpaid] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(amount_minor),0) AS total FROM settlements WHERE space_id=? AND status='pending'")
      .bind(spaceId)
      .first<{ n: number; total: number }>(),
    db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(mi.amount_minor - mi.paid_minor),0) AS total
      FROM member_installments mi
      JOIN members m ON m.id=mi.member_id AND m.status='active'
      WHERE mi.space_id=? AND mi.paid_minor < mi.amount_minor`)
      .bind(spaceId)
      .first<{ n: number; total: number }>(),
  ]);
  return {
    pendingSettlements: Number(pending?.n ?? 0),
    pendingSettlementsMinor: Number(pending?.total ?? 0),
    unpaidInstallments: Number(unpaid?.n ?? 0),
    unpaidInstallmentsMinor: Number(unpaid?.total ?? 0),
  };
}

export async function assertSpaceSettledForArchive(db: D1Database, spaceId: string) {
  const blockers = await archiveBlockers(db, spaceId);
  if (!archiveIsClear(blockers)) throw new ApiError(409, "ARCHIVE_NOT_SETTLED", blockers);
}
