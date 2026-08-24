/** Business API v1 — personal hub wallet links. */

import type { RequestUser } from "../db/runtime";
import { prepareAudit } from "./audit";
import { writeApprovedCashBalance } from "./ledger-void";
import { parseMoneyToMinor } from "./money";
import { accountLiveBalance } from "./personal-finance";
import { ApiError } from "./security";

export async function listV1SpaceLinks(db: D1Database, hubSpaceId: string) {
  const rows = await db.prepare(`
    SELECT sl.id, sl.hub_space_id, sl.linked_space_id, sl.status, sl.created_at,
      s.name_ar, s.name_en, s.type, s.currency, s.balance_minor,
      sbl.account_id AS bank_account_id
    FROM space_links sl
    JOIN spaces s ON s.id=sl.linked_space_id
    LEFT JOIN space_bank_links sbl ON sbl.hub_space_id=sl.hub_space_id AND sbl.linked_space_id=sl.linked_space_id
    WHERE sl.hub_space_id=? AND sl.status='active'
    ORDER BY sl.created_at DESC
  `).bind(hubSpaceId).all<{
    id: string; hub_space_id: string; linked_space_id: string; status: string; created_at: string;
    name_ar: string; name_en: string; type: string; currency: string; balance_minor: number;
    bank_account_id: string | null;
  }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    hubSpaceId: row.hub_space_id,
    linkedSpaceId: row.linked_space_id,
    status: row.status,
    createdAt: row.created_at,
    bankAccountId: row.bank_account_id,
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

export async function setV1WalletBankLink(
  db: D1Database,
  user: RequestUser,
  input: { hubSpaceId: string; linkedSpaceId: string; accountId: string | null },
) {
  const link = await db.prepare(
    "SELECT id FROM space_links WHERE hub_space_id=? AND linked_space_id=? AND status='active'",
  ).bind(input.hubSpaceId, input.linkedSpaceId).first();
  if (!link) throw new ApiError(409, "WALLET_NOT_LINKED");
  const createdAt = new Date().toISOString();
  if (!input.accountId) {
    await db.batch([
      db.prepare("DELETE FROM space_bank_links WHERE hub_space_id=? AND linked_space_id=?")
        .bind(input.hubSpaceId, input.linkedSpaceId),
      prepareAudit(db, {
        userId: user.id,
        action: "wallet.bank_unlinked",
        entityType: "space",
        entityId: input.hubSpaceId,
        metadata: { linkedSpaceId: input.linkedSpaceId, via: "api.v1" },
        createdAt,
      }),
    ]);
    return {
      hubSpaceId: input.hubSpaceId,
      linkedSpaceId: input.linkedSpaceId,
      accountId: null,
      status: "bank_unlinked" as const,
      updatedAt: createdAt,
    };
  }
  const account = await db.prepare(
    "SELECT id FROM personal_accounts WHERE id=? AND space_id=? AND status='active'",
  ).bind(input.accountId, input.hubSpaceId).first();
  if (!account) throw new ApiError(400, "INVALID_ACCOUNT");
  await db.batch([
    db.prepare("DELETE FROM space_bank_links WHERE hub_space_id=? AND linked_space_id=?")
      .bind(input.hubSpaceId, input.linkedSpaceId),
    db.prepare(
      "INSERT INTO space_bank_links (id,hub_space_id,linked_space_id,account_id,created_at) VALUES (?,?,?,?,?)",
    ).bind(crypto.randomUUID(), input.hubSpaceId, input.linkedSpaceId, input.accountId, createdAt),
    prepareAudit(db, {
      userId: user.id,
      action: "wallet.bank_linked",
      entityType: "space",
      entityId: input.hubSpaceId,
      metadata: { linkedSpaceId: input.linkedSpaceId, accountId: input.accountId, via: "api.v1" },
      createdAt,
    }),
  ]);
  return {
    hubSpaceId: input.hubSpaceId,
    linkedSpaceId: input.linkedSpaceId,
    accountId: input.accountId,
    status: "bank_linked" as const,
    updatedAt: createdAt,
  };
}

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

export async function transferV1LinkedFunds(
  db: D1Database,
  user: RequestUser,
  hub: { id: string; owner_user_id: string; currency: string; type: string },
  linked: { id: string; type: string; balance_minor: number },
  input: {
    accountId: string;
    direction: "to_linked" | "to_hub";
    amount: string | number;
    note?: string;
  },
) {
  const pair = await db.prepare(
    "SELECT id FROM space_links WHERE hub_space_id=? AND linked_space_id=? AND status='active'",
  ).bind(hub.id, linked.id).first();
  if (!pair) throw new ApiError(409, "WALLET_NOT_LINKED");

  const { assertOwnerPlanQuota } = await import("../services/admin/billing-service");
  await assertOwnerPlanQuota(db, hub.owner_user_id, "transaction", 2);

  const account = await db.prepare(
    "SELECT id,opening_minor FROM personal_accounts WHERE id=? AND space_id=? AND status='active'",
  ).bind(input.accountId, hub.id).first<{ id: string; opening_minor: number }>();
  if (!account) throw new ApiError(400, "INVALID_ACCOUNT");

  let amountMinor: number;
  try {
    amountMinor = parseMoneyToMinor(input.amount, hub.currency);
  } catch {
    throw new ApiError(400, "INVALID_AMOUNT");
  }
  if (amountMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT");

  const hubTxns = (await db.prepare(
    "SELECT account_id,kind,amount_minor,status FROM transactions WHERE space_id=? AND status='approved'",
  ).bind(hub.id).all<{ account_id?: string | null; kind: string; amount_minor: number; status: string }>()).results ?? [];
  const ownMinor = accountLiveBalance(Number(account.opening_minor), hubTxns, account.id);
  const linkedBalance = Number(linked.balance_minor ?? 0);
  if (input.direction === "to_linked" && ownMinor < amountMinor) throw new ApiError(409, "INSUFFICIENT_FUNDS");
  if (input.direction === "to_hub" && linkedBalance < amountMinor) throw new ApiError(409, "INSUFFICIENT_FUNDS");

  const createdAt = new Date().toISOString();
  const outId = crypto.randomUUID();
  const inId = crypto.randomUUID();
  const note = input.note?.trim() || "";
  const toLinked = input.direction === "to_linked";
  const outSpace = toLinked ? hub.id : linked.id;
  const inSpace = toLinked ? linked.id : hub.id;
  const outAr = toLinked
    ? `تحويل إلى محفظة مرتبطة${note ? ` · ${note}` : ""}`
    : `تحويل إلى الحساب الشخصي${note ? ` · ${note}` : ""}`;
  const outEn = toLinked
    ? `Transfer to linked wallet${note ? ` · ${note}` : ""}`
    : `Transfer to personal account${note ? ` · ${note}` : ""}`;
  const inAr = toLinked
    ? `تحويل من المحفظة الشخصية${note ? ` · ${note}` : ""}`
    : `تحويل من محفظة مرتبطة${note ? ` · ${note}` : ""}`;
  const inEn = toLinked
    ? `Transfer from personal wallet${note ? ` · ${note}` : ""}`
    : `Transfer from linked wallet${note ? ` · ${note}` : ""}`;

  await db.batch([
    db.prepare("INSERT INTO transactions VALUES (?, ?, ?, NULL, ?, 'general', ?, ?, ?, 'approved', ?, ?)")
      .bind(outId, outSpace, user.id, "expense", amountMinor, outAr, outEn, createdAt, createdAt),
    db.prepare("INSERT INTO transactions VALUES (?, ?, ?, NULL, ?, 'general', ?, ?, ?, 'approved', ?, ?)")
      .bind(inId, inSpace, user.id, "income", amountMinor, inAr, inEn, createdAt, createdAt),
    db.prepare("UPDATE transactions SET account_id=? WHERE id=?")
      .bind(account.id, toLinked ? outId : inId),
    prepareAudit(db, {
      userId: user.id,
      action: "wallet.transfer",
      entityType: "transaction",
      entityId: outId,
      metadata: {
        hubSpaceId: hub.id,
        linkedSpaceId: linked.id,
        amountMinor,
        direction: input.direction,
        via: "api.v1",
      },
      createdAt,
    }),
  ]);

  const bank = await db.prepare(
    "SELECT id FROM space_bank_links WHERE hub_space_id=? AND linked_space_id=?",
  ).bind(hub.id, linked.id).first();
  if (!bank) {
    await db.prepare(
      "INSERT INTO space_bank_links (id,hub_space_id,linked_space_id,account_id,created_at) VALUES (?,?,?,?,?)",
    ).bind(crypto.randomUUID(), hub.id, linked.id, account.id, createdAt).run();
  }

  if (hub.type === "personal") await rebuildPersonalSpaceBalance(db, hub.id);
  else await writeApprovedCashBalance(db, hub.id);
  if (linked.type === "personal") await rebuildPersonalSpaceBalance(db, linked.id);
  else await writeApprovedCashBalance(db, linked.id);

  return {
    hubSpaceId: hub.id,
    linkedSpaceId: linked.id,
    accountId: account.id,
    direction: input.direction,
    amountMinor,
    outTransactionId: outId,
    inTransactionId: inId,
    transferredAt: createdAt,
  };
}
