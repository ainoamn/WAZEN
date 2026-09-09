/** Detect and merge duplicate members inside the same association only. */

import { prepareAudit } from "./audit";
import { ApiError } from "./api-error";
import { digitsOnly, toWhatsAppNumber } from "./phone";
import { normalizeMemberName } from "./member-contact-unique";

export type DuplicateMember = {
  id: string;
  space_id: string;
  display_name: string;
  email?: string | null;
  phone?: string | null;
  role: string;
  status?: string | null;
  user_id?: string | null;
  paid_minor: number;
  due_minor: number;
  extra_minor: number;
  addon_minor?: number;
  joined_at?: string | null;
};

export type DuplicateCluster = {
  spaceId: string;
  key: string;
  field: "phone";
  members: DuplicateMember[];
  keeperId: string;
  extraCount: number;
  blockedReason?: "linked_accounts_conflict";
};

const ROLE_RANK: Record<string, number> = {
  owner: 6,
  manager: 5,
  supervisor: 4,
  treasurer: 3,
  member: 2,
  auditor: 1,
  viewer: 0,
};

export function canonicalMemberPhone(phone: string | null | undefined) {
  const raw = String(phone ?? "").trim();
  if (!raw) return "";
  return toWhatsAppNumber(raw) || digitsOnly(raw);
}

export function canonicalMemberEmail(email: string | null | undefined) {
  return String(email ?? "").trim().toLowerCase();
}

export function phonesEquivalent(a: string | null | undefined, b: string | null | undefined) {
  const left = canonicalMemberPhone(a);
  const right = canonicalMemberPhone(b);
  if (!left || !right || left.length < 7 || right.length < 7) return false;
  if (left === right) return true;
  const tail = (value: string) => value.slice(-8);
  return tail(left) === tail(right) && tail(left).length >= 7;
}

export function chooseKeeper(members: DuplicateMember[]) {
  const ranked = [...members].sort((left, right) => {
    const roleDelta = (ROLE_RANK[right.role] ?? 0) - (ROLE_RANK[left.role] ?? 0);
    if (roleDelta) return roleDelta;
    const linkedDelta = Number(Boolean(right.user_id)) - Number(Boolean(left.user_id));
    if (linkedDelta) return linkedDelta;
    const paidDelta = Number(right.paid_minor ?? 0) - Number(left.paid_minor ?? 0);
    if (paidDelta) return paidDelta;
    return String(left.joined_at ?? "").localeCompare(String(right.joined_at ?? ""));
  });
  return ranked[0];
}

function linkedAccountConflict(members: DuplicateMember[]) {
  const ids = new Set(members.map((item) => String(item.user_id ?? "").trim()).filter(Boolean));
  return ids.size > 1;
}

export function findDuplicateClusters(members: DuplicateMember[]): DuplicateCluster[] {
  const bySpace = new Map<string, DuplicateMember[]>();
  for (const member of members) {
    const list = bySpace.get(member.space_id) ?? [];
    list.push(member);
    bySpace.set(member.space_id, list);
  }

  const clusters: DuplicateCluster[] = [];
  for (const [spaceId, rows] of bySpace) {
    const parent = new Map<string, string>();
    const find = (id: string): string => {
      const next = parent.get(id) ?? id;
      if (next === id) return id;
      const root = find(next);
      parent.set(id, root);
      return root;
    };
    const union = (a: string, b: string) => {
      const left = find(a);
      const right = find(b);
      if (left !== right) parent.set(left, right);
    };
    for (const row of rows) parent.set(row.id, row.id);
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        const left = rows[i];
        const right = rows[j];
        if (phonesEquivalent(left.phone, right.phone)) union(left.id, right.id);
      }
    }
    const groups = new Map<string, DuplicateMember[]>();
    for (const row of rows) {
      const root = find(row.id);
      const list = groups.get(root) ?? [];
      list.push(row);
      groups.set(root, list);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const keeper = chooseKeeper(group);
      const phoneKeys = new Set(group.map((item) => canonicalMemberPhone(item.phone)).filter((item) => item.length >= 7));
      if (!phoneKeys.size) continue;
      clusters.push({
        spaceId,
        key: `${spaceId}:${[...phoneKeys].sort().join("|")}`,
        field: "phone",
        members: group,
        keeperId: keeper.id,
        extraCount: group.length - 1,
        blockedReason: linkedAccountConflict(group) ? "linked_accounts_conflict" : undefined,
      });
    }
  }
  return clusters.sort((a, b) => b.extraCount - a.extraCount);
}

export function linkedMembershipsByPhone<T extends { id: string; phone?: string | null }>(
  seed: { id: string; phone?: string | null },
  rows: T[],
) {
  return rows.filter((row) => row.id === seed.id || phonesEquivalent(row.phone, seed.phone));
}

export function findMultiAssociationPeople(members: DuplicateMember[]) {
  const byPhone = new Map<string, DuplicateMember[]>();
  for (const member of members) {
    const phone = canonicalMemberPhone(member.phone);
    if (phone.length < 7) continue;
    const list = byPhone.get(phone) ?? [];
    list.push(member);
    byPhone.set(phone, list);
  }
  return [...byPhone.values()]
    .map((list) => {
      const spaces = new Set(list.map((item) => item.space_id));
      return { phone: canonicalMemberPhone(list[0].phone), members: list, associationCount: spaces.size };
    })
    .filter((item) => item.associationCount > 1)
    .sort((a, b) => b.associationCount - a.associationCount);
}

export function findSameSpaceNameClusters(members: DuplicateMember[]): DuplicateCluster[] {
  const bySpace = new Map<string, DuplicateMember[]>();
  for (const member of members) {
    if ((member.status ?? "active") !== "active") continue;
    const list = bySpace.get(member.space_id) ?? [];
    list.push(member);
    bySpace.set(member.space_id, list);
  }
  const clusters: DuplicateCluster[] = [];
  for (const [spaceId, rows] of bySpace) {
    const byName = new Map<string, DuplicateMember[]>();
    for (const row of rows) {
      const key = normalizeMemberName(row.display_name);
      if (key.length < 2) continue;
      const list = byName.get(key) ?? [];
      list.push(row);
      byName.set(key, list);
    }
    for (const group of byName.values()) {
      if (group.length < 2) continue;
      if (group.every((item, index) => index === 0 || phonesEquivalent(item.phone, group[0].phone))) continue;
      const keeper = chooseKeeper(group);
      clusters.push({
        spaceId,
        key: `${spaceId}:name:${normalizeMemberName(keeper.display_name)}`,
        field: "phone",
        members: group,
        keeperId: keeper.id,
        extraCount: group.length - 1,
        blockedReason: linkedAccountConflict(group) ? "linked_accounts_conflict" : undefined,
      });
    }
  }
  return clusters;
}

export function duplicateSummary(clusters: DuplicateCluster[]) {
  const mergeable = clusters.filter((item) => !item.blockedReason);
  const blocked = clusters.filter((item) => item.blockedReason);
  return {
    clusterCount: clusters.length,
    extraAccounts: clusters.reduce((sum, item) => sum + item.extraCount, 0),
    mergeableClusters: mergeable.length,
    mergeableExtras: mergeable.reduce((sum, item) => sum + item.extraCount, 0),
    blockedClusters: blocked.length,
  };
}

export function mergedLedgerTotals(keeper: DuplicateMember, extras: DuplicateMember[]) {
  const paid = Number(keeper.paid_minor ?? 0) + extras.reduce((sum, item) => sum + Number(item.paid_minor ?? 0), 0);
  const extra = Number(keeper.extra_minor ?? 0) + extras.reduce((sum, item) => sum + Number(item.extra_minor ?? 0), 0);
  const addon = Number(keeper.addon_minor ?? 0) + extras.reduce((sum, item) => sum + Number(item.addon_minor ?? 0), 0);
  const due = Math.max(Number(keeper.due_minor ?? 0), ...extras.map((item) => Number(item.due_minor ?? 0)));
  return { paid_minor: paid, extra_minor: extra, addon_minor: addon, due_minor: due };
}

export function mergeInstallmentPair(
  keeper: { period_index: number; amount_minor: number; paid_minor: number; status?: string },
  extra: { amount_minor: number; paid_minor: number },
) {
  const amount = Math.max(Number(keeper.amount_minor ?? 0), Number(extra.amount_minor ?? 0));
  const paid = Math.min(amount, Number(keeper.paid_minor ?? 0) + Number(extra.paid_minor ?? 0));
  const status = paid >= amount && amount > 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
  return { period_index: keeper.period_index, amount_minor: amount, paid_minor: paid, status };
}

function bestContact(members: DuplicateMember[]) {
  const phone = members.map((item) => item.phone).find((item) => canonicalMemberPhone(item).length >= 7) ?? null;
  const email = members.map((item) => item.email).find((item) => canonicalMemberEmail(item)) ?? null;
  return {
    phone: phone ? (toWhatsAppNumber(phone) || phone) : null,
    email: email ? canonicalMemberEmail(email) : null,
  };
}

async function reassignOrMergeSplits(db: D1Database, keeperId: string, duplicateId: string) {
  const dupSplits = await db.prepare("SELECT id, expense_id, share_minor FROM expense_splits WHERE member_id=?")
    .bind(duplicateId).all<{ id: string; expense_id: string; share_minor: number }>();
  for (const split of dupSplits.results ?? []) {
    const existing = await db.prepare("SELECT id, share_minor FROM expense_splits WHERE expense_id=? AND member_id=?")
      .bind(split.expense_id, keeperId).first<{ id: string; share_minor: number }>();
    if (existing) {
      await db.prepare("UPDATE expense_splits SET share_minor=? WHERE id=?")
        .bind(Number(existing.share_minor) + Number(split.share_minor), existing.id).run();
      await db.prepare("DELETE FROM expense_splits WHERE id=?").bind(split.id).run();
    } else {
      await db.prepare("UPDATE expense_splits SET member_id=? WHERE id=?").bind(keeperId, split.id).run();
    }
  }
}

async function reassignOrMergeInstallments(db: D1Database, keeperId: string, duplicateId: string) {
  const dupRows = await db.prepare("SELECT * FROM member_installments WHERE member_id=?")
    .bind(duplicateId).all<{
      id: string;
      period_index: number;
      amount_minor: number;
      paid_minor: number;
      status: string;
    }>();
  for (const row of dupRows.results ?? []) {
    const existing = await db.prepare("SELECT id, period_index, amount_minor, paid_minor FROM member_installments WHERE member_id=? AND period_index=?")
      .bind(keeperId, row.period_index).first<{ id: string; period_index: number; amount_minor: number; paid_minor: number }>();
    if (existing) {
      const merged = mergeInstallmentPair(existing, row);
      await db.prepare("UPDATE member_installments SET amount_minor=?, paid_minor=?, status=? WHERE id=?")
        .bind(merged.amount_minor, merged.paid_minor, merged.status, existing.id).run();
      await db.prepare("DELETE FROM member_installments WHERE id=?").bind(row.id).run();
    } else {
      await db.prepare("UPDATE member_installments SET member_id=? WHERE id=?").bind(keeperId, row.id).run();
    }
  }
}

export async function mergeDuplicateCluster(input: {
  db: D1Database;
  actorUserId: string;
  spaceId: string;
  keeperId: string;
  duplicateIds: string[];
  requirePhoneMatch?: boolean;
}) {
  const uniqueDups = [...new Set(input.duplicateIds)].filter((id) => id && id !== input.keeperId);
  if (!uniqueDups.length) throw new ApiError(400, "NOTHING_TO_MERGE");

  const rows = await input.db.prepare(
    `SELECT id,space_id,user_id,display_name,email,phone,role,status,due_minor,paid_minor,extra_minor,COALESCE(addon_minor,0) AS addon_minor,joined_at
     FROM members WHERE space_id=? AND id IN (${[input.keeperId, ...uniqueDups].map(() => "?").join(",")})`,
  ).bind(input.spaceId, input.keeperId, ...uniqueDups).all<DuplicateMember>();
  const members = rows.results ?? [];
  const keeper = members.find((item) => item.id === input.keeperId);
  const extras = members.filter((item) => item.id !== input.keeperId);
  if (!keeper || extras.length !== uniqueDups.length) throw new ApiError(404, "MEMBER_NOT_FOUND");
  if ((keeper.status ?? "active") !== "active") throw new ApiError(409, "MEMBER_NOT_ACTIVE");
  if (extras.some((item) => item.space_id !== input.spaceId || keeper.space_id !== input.spaceId)) {
    throw new ApiError(409, "MERGE_CROSS_SPACE");
  }

  const owner = members.find((item) => item.role === "owner");
  if (owner && owner.id !== keeper.id) throw new ApiError(403, "OWNER_MEMBER_LOCKED");
  if (linkedAccountConflict(members)) throw new ApiError(409, "MERGE_CONFLICT_ACCOUNTS");

  if (input.requirePhoneMatch !== false) {
    const cluster = findDuplicateClusters(members)[0];
    if (!cluster) throw new ApiError(409, "NOT_DUPLICATES");
    if (extras.some((item) => !cluster.members.some((row) => row.id === item.id))) throw new ApiError(409, "NOT_DUPLICATES");
  }

  const createdAt = new Date().toISOString();
  const totals = mergedLedgerTotals(keeper, extras);
  const contact = bestContact([keeper, ...extras]);

  for (const extra of extras) {
    await input.db.prepare("UPDATE transactions SET member_id=? WHERE member_id=? AND space_id=?")
      .bind(keeper.id, extra.id, input.spaceId).run();
    await input.db.prepare("UPDATE journal_lines SET member_id=? WHERE member_id=?").bind(keeper.id, extra.id).run().catch(() => {});
    await input.db.prepare("UPDATE trip_expenses SET paid_by_member_id=? WHERE paid_by_member_id=? AND space_id=?")
      .bind(keeper.id, extra.id, input.spaceId).run().catch(() => {});
    await reassignOrMergeSplits(input.db, keeper.id, extra.id);
    await reassignOrMergeInstallments(input.db, keeper.id, extra.id);
    await input.db.prepare("UPDATE circle_turns SET member_id=? WHERE member_id=? AND space_id=?")
      .bind(keeper.id, extra.id, input.spaceId).run().catch(() => {});
    await input.db.prepare("UPDATE space_payout_accounts SET linked_member_id=? WHERE linked_member_id=? AND space_id=?")
      .bind(keeper.id, extra.id, input.spaceId).run().catch(() => {});
    await input.db.prepare(
      "UPDATE settlements SET from_member_id=? WHERE from_member_id=? AND space_id=?",
    ).bind(keeper.id, extra.id, input.spaceId).run();
    await input.db.prepare(
      "UPDATE settlements SET to_member_id=? WHERE to_member_id=? AND space_id=?",
    ).bind(keeper.id, extra.id, input.spaceId).run();
  }

  await input.db.prepare(
    "DELETE FROM settlements WHERE space_id=? AND from_member_id=to_member_id",
  ).bind(input.spaceId).run();

  await input.db.prepare(
    "UPDATE members SET paid_minor=?, extra_minor=?, addon_minor=?, due_minor=?, email=COALESCE(?, email), phone=COALESCE(?, phone) WHERE id=? AND space_id=?",
  ).bind(
    totals.paid_minor,
    totals.extra_minor,
    totals.addon_minor,
    totals.due_minor,
    contact.email,
    contact.phone,
    keeper.id,
    input.spaceId,
  ).run();

  for (const extra of extras) {
    await input.db.prepare("DELETE FROM member_installments WHERE member_id=?").bind(extra.id).run().catch(() => {});
    try {
      await input.db.prepare("DELETE FROM members WHERE id=? AND space_id=?").bind(extra.id, input.spaceId).run();
    } catch {
      await input.db.prepare("UPDATE members SET status='inactive' WHERE id=? AND space_id=?")
        .bind(extra.id, input.spaceId).run();
    }
  }

  await input.db.prepare(
    `UPDATE spaces SET goal_minor = COALESCE((SELECT SUM(due_minor) FROM members WHERE space_id=? AND status='active'), 0) WHERE id=?`,
  ).bind(input.spaceId, input.spaceId).run();

  await prepareAudit(input.db, {
    userId: input.actorUserId,
    action: "member.duplicates_merged",
    entityType: "member",
    entityId: keeper.id,
    metadata: {
      spaceId: input.spaceId,
      keeperId: keeper.id,
      mergedIds: extras.map((item) => item.id),
      displayNames: extras.map((item) => item.display_name),
    },
    createdAt,
  }).run();

  return {
    keeperId: keeper.id,
    mergedIds: extras.map((item) => item.id),
    extraCount: extras.length,
  };
}
