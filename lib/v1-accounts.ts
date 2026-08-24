/** Business API v1 — personal wallet accounts (banks/cash). */

import type { RequestUser } from "../db/runtime";
import { prepareAudit } from "./audit";
import { writeApprovedCashBalance } from "./ledger-void";
import { parseNonNegativeMoneyToMinor } from "./money";
import { accountLiveBalance } from "./personal-finance";
import { ApiError } from "./security";

export async function listV1PersonalAccounts(db: D1Database, spaceId: string) {
  const accounts = await db.prepare(`
    SELECT id, space_id, name, kind, opening_minor, status, created_at
    FROM personal_accounts WHERE space_id=? ORDER BY created_at
  `).bind(spaceId).all<{
    id: string; space_id: string; name: string; kind: string;
    opening_minor: number; status: string; created_at: string;
  }>();
  const txns = (await db.prepare(
    "SELECT account_id,kind,amount_minor,status FROM transactions WHERE space_id=? AND status='approved'",
  ).bind(spaceId).all<{ account_id?: string | null; kind: string; amount_minor: number; status: string }>()).results ?? [];
  return (accounts.results ?? []).map((row) => ({
    id: row.id,
    spaceId: row.space_id,
    name: row.name,
    kind: row.kind,
    openingMinor: Number(row.opening_minor) || 0,
    balanceMinor: accountLiveBalance(Number(row.opening_minor), txns, row.id),
    status: row.status,
    createdAt: row.created_at,
  }));
}

export async function createV1PersonalAccount(
  db: D1Database,
  user: RequestUser,
  space: { id: string; currency: string },
  input: { name: string; kind?: "bank" | "cash" | "wallet"; opening?: string | number },
) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) throw new ApiError(400, "INVALID_ACCOUNT");
  const kind = input.kind ?? "bank";
  let openingMinor = 0;
  try {
    if (input.opening !== undefined && input.opening !== "") {
      openingMinor = parseNonNegativeMoneyToMinor(input.opening, space.currency);
    }
  } catch {
    throw new ApiError(400, "INVALID_AMOUNT");
  }
  const createdAt = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.batch([
    db.prepare(
      "INSERT INTO personal_accounts (id,space_id,name,kind,opening_minor,status,created_at) VALUES (?,?,?,?,?,'active',?)",
    ).bind(id, space.id, name, kind, openingMinor, createdAt),
    prepareAudit(db, {
      userId: user.id,
      action: "personal.account_added",
      entityType: "space",
      entityId: space.id,
      metadata: { name, kind, openingMinor, via: "api.v1" },
      createdAt,
    }),
  ]);
  try {
    await writeApprovedCashBalance(db, space.id);
  } catch { /* best-effort */ }
  return {
    id,
    spaceId: space.id,
    name,
    kind,
    openingMinor,
    balanceMinor: openingMinor,
    status: "active" as const,
    createdAt,
  };
}
