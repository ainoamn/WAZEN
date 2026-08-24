/** Business API v1 — personal wallet accounts (banks/cash). */

import type { RequestUser } from "../db/runtime";
import { prepareAudit } from "./audit";
import { writeApprovedCashBalance } from "./ledger-void";
import { parseNonNegativeMoneyToMinor } from "./money";
import { accountLiveBalance } from "./personal-finance";
import { ApiError } from "./security";

async function rebuildPersonalSpaceBalance(db: D1Database, spaceId: string) {
  const accounts = await db.prepare(
    "SELECT id,opening_minor FROM personal_accounts WHERE space_id=? AND status='active'",
  ).bind(spaceId).all<{ id: string; opening_minor: number }>();
  if (!accounts.results?.length) {
    await writeApprovedCashBalance(db, spaceId);
    return;
  }
  const txns = (await db.prepare(
    "SELECT account_id,kind,amount_minor,status FROM transactions WHERE space_id=? AND status='approved'",
  ).bind(spaceId).all<{ account_id?: string | null; kind: string; amount_minor: number; status: string }>()).results ?? [];
  const unassigned = txns
    .filter((row) => !row.account_id)
    .reduce((sum, row) => {
      if (row.kind === "income" || row.kind === "contribution") return sum + Number(row.amount_minor);
      if (row.kind === "expense") return sum - Number(row.amount_minor);
      return sum;
    }, 0);
  const assigned = accounts.results.reduce(
    (sum, account) => sum + accountLiveBalance(Number(account.opening_minor), txns, account.id),
    0,
  );
  await db.prepare("UPDATE spaces SET balance_minor=? WHERE id=?")
    .bind(assigned + unassigned, spaceId).run();
}

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
    await rebuildPersonalSpaceBalance(db, space.id);
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

export async function updateV1PersonalAccount(
  db: D1Database,
  user: RequestUser,
  space: { id: string; currency: string },
  accountId: string,
  input: {
    name?: string;
    kind?: "bank" | "cash" | "wallet";
    opening?: string | number;
    status?: "active" | "paused" | "archived";
  },
) {
  const account = await db.prepare(
    "SELECT id,space_id,name,kind,opening_minor,status FROM personal_accounts WHERE id=? AND space_id=?",
  ).bind(accountId, space.id).first<{
    id: string; space_id: string; name: string; kind: string; opening_minor: number; status: string;
  }>();
  if (!account) throw new ApiError(404, "ACCOUNT_NOT_FOUND");

  const name = input.name?.trim() ?? account.name;
  if (name.length < 2 || name.length > 80) throw new ApiError(400, "INVALID_ACCOUNT");
  const kind = input.kind ?? (account.kind as "bank" | "cash" | "wallet");
  let openingMinor = Number(account.opening_minor) || 0;
  if (input.opening !== undefined && input.opening !== "") {
    try {
      openingMinor = parseNonNegativeMoneyToMinor(input.opening, space.currency);
    } catch {
      throw new ApiError(400, "INVALID_AMOUNT");
    }
  }
  const status = input.status ?? account.status;
  if (!["active", "paused", "archived"].includes(status)) throw new ApiError(400, "INVALID_ACCOUNT");

  const createdAt = new Date().toISOString();
  const statements = [
    db.prepare("UPDATE personal_accounts SET name=?, kind=?, opening_minor=?, status=? WHERE id=?")
      .bind(name, kind, openingMinor, status, account.id),
  ];
  if (input.status && input.status !== account.status) {
    statements.push(prepareAudit(db, {
      userId: user.id,
      action: "personal.account_status",
      entityType: "personal_account",
      entityId: account.id,
      metadata: { status, via: "api.v1" },
      createdAt,
    }));
  }
  statements.push(prepareAudit(db, {
    userId: user.id,
    action: "personal.account_updated",
    entityType: "personal_account",
    entityId: account.id,
    metadata: { name, kind, openingMinor, status, via: "api.v1" },
    createdAt,
  }));
  await db.batch(statements);
  try {
    await rebuildPersonalSpaceBalance(db, space.id);
  } catch { /* best-effort */ }

  const txns = (await db.prepare(
    "SELECT account_id,kind,amount_minor,status FROM transactions WHERE space_id=? AND status='approved'",
  ).bind(space.id).all<{ account_id?: string | null; kind: string; amount_minor: number; status: string }>()).results ?? [];

  return {
    id: account.id,
    spaceId: space.id,
    name,
    kind,
    openingMinor,
    balanceMinor: accountLiveBalance(openingMinor, txns, account.id),
    status,
    updatedAt: createdAt,
  };
}

export async function deleteV1PersonalAccount(
  db: D1Database,
  user: RequestUser,
  spaceId: string,
  accountId: string,
) {
  const account = await db.prepare(
    "SELECT id,space_id FROM personal_accounts WHERE id=? AND space_id=?",
  ).bind(accountId, spaceId).first<{ id: string; space_id: string }>();
  if (!account) throw new ApiError(404, "ACCOUNT_NOT_FOUND");
  const used = await db.prepare(
    "SELECT id FROM transactions WHERE account_id=? AND status='approved' LIMIT 1",
  ).bind(account.id).first();
  if (used) throw new ApiError(409, "ACCOUNT_HAS_ACTIVITY");
  const createdAt = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE personal_rules SET account_id=NULL WHERE account_id=?").bind(account.id),
    db.prepare("UPDATE personal_occurrences SET account_id=NULL WHERE account_id=? AND status='pending'").bind(account.id),
    db.prepare("DELETE FROM personal_accounts WHERE id=?").bind(account.id),
    prepareAudit(db, {
      userId: user.id,
      action: "personal.account_deleted",
      entityType: "personal_account",
      entityId: account.id,
      metadata: { via: "api.v1" },
      createdAt,
    }),
  ]);
  try {
    await rebuildPersonalSpaceBalance(db, spaceId);
  } catch { /* best-effort */ }
  return { id: account.id, spaceId, status: "deleted" as const, deletedAt: createdAt };
}
