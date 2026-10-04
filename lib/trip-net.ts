/**
 * Trip member position = fund contribution + bills he paid − his shares (fund + member bills) ± posted transfers.
 * Σ member nets = fund cash, so the fund itself pays whatever creditors are still owed after debtors pay them.
 */

import { isFundPaidExpense } from "./finance.ts";

export type TripNetExpense = {
  id: string;
  space_id?: string | null;
  paid_by_member_id?: string | null;
  paid_by_name?: string | null;
  amount_minor?: unknown;
  paid_from?: string | null;
  status?: string | null;
};

export type TripNetSplit = { expense_id: string; member_id: string; share_minor?: unknown };

export type TripNetSettlement = {
  space_id?: string | null;
  from_member_id: string;
  to_member_id: string;
  amount_minor?: unknown;
  status?: string | null;
};

export type TripMemberPosition = {
  memberId: string;
  /** Cash he put into the trip fund. */
  paidMinor: number;
  /** Bills he paid from his own pocket. */
  pocketPaidMinor: number;
  /** His shares of bills the fund paid. */
  fundShareMinor: number;
  /** His shares of bills members paid (including his own bills). */
  pocketShareMinor: number;
  /** Posted transfers he paid (to members or into the fund). */
  sentMinor: number;
  /** Posted transfers he received (from members or paid out by the fund). */
  receivedMinor: number;
  /** Positive = له, negative = عليه. */
  netMinor: number;
};

export type PlannedTransfer = { fromMemberId: string; toMemberId: string; amountMinor: number };

function minor(value: unknown) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function inSpace(row: { space_id?: string | null }, spaceId: string) {
  return !row.space_id || String(row.space_id) === String(spaceId);
}

export function isFundId(id: string | null | undefined) {
  return String(id ?? "").startsWith("space:");
}

export function tripMemberPosition(input: {
  spaceId: string;
  memberId: string;
  paidMinor: unknown;
  expenses: TripNetExpense[];
  splits: TripNetSplit[];
  settlements: TripNetSettlement[];
}): TripMemberPosition {
  const live = input.expenses.filter((expense) => inSpace(expense, input.spaceId) && (expense.status ?? "posted") !== "voided");
  const fundIds = new Set<string>();
  const pocketIds = new Set<string>();
  let pocketPaidMinor = 0;
  for (const expense of live) {
    if (isFundPaidExpense(expense)) {
      fundIds.add(expense.id);
      continue;
    }
    pocketIds.add(expense.id);
    if (expense.paid_by_member_id === input.memberId) pocketPaidMinor += minor(expense.amount_minor);
  }
  let fundShareMinor = 0;
  let pocketShareMinor = 0;
  for (const split of input.splits) {
    if (split.member_id !== input.memberId) continue;
    if (fundIds.has(split.expense_id)) fundShareMinor += minor(split.share_minor);
    else if (pocketIds.has(split.expense_id)) pocketShareMinor += minor(split.share_minor);
  }
  let sentMinor = 0;
  let receivedMinor = 0;
  for (const row of input.settlements) {
    if (!inSpace(row, input.spaceId) || row.status !== "settled") continue;
    if (row.from_member_id === input.memberId) sentMinor += minor(row.amount_minor);
    if (row.to_member_id === input.memberId) receivedMinor += minor(row.amount_minor);
  }
  const paidMinor = minor(input.paidMinor);
  return {
    memberId: input.memberId,
    paidMinor,
    pocketPaidMinor,
    fundShareMinor,
    pocketShareMinor,
    sentMinor,
    receivedMinor,
    netMinor: paidMinor + pocketPaidMinor - fundShareMinor - pocketShareMinor + sentMinor - receivedMinor,
  };
}

function largestFirst(left: { id: string; minor: number }, right: { id: string; minor: number }) {
  return right.minor - left.minor || left.id.localeCompare(right.id);
}

/**
 * Debtors pay member creditors directly (largest first). Whatever creditors are still owed comes from the fund
 * (their money is already in it); whatever debtors still owe after that goes into the fund.
 */
export function planTripSettlements(nets: Array<{ memberId: string; netMinor: number }>, fundId: string): PlannedTransfer[] {
  const creditors = nets.filter((row) => row.netMinor > 0).map((row) => ({ id: row.memberId, minor: row.netMinor })).sort(largestFirst);
  const debtors = nets.filter((row) => row.netMinor < 0).map((row) => ({ id: row.memberId, minor: -row.netMinor })).sort(largestFirst);
  const out: PlannedTransfer[] = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const amountMinor = Math.min(debtors[d].minor, creditors[c].minor);
    if (amountMinor > 0) out.push({ fromMemberId: debtors[d].id, toMemberId: creditors[c].id, amountMinor });
    debtors[d].minor -= amountMinor;
    creditors[c].minor -= amountMinor;
    if (debtors[d].minor === 0) d += 1;
    if (creditors[c].minor === 0) c += 1;
  }
  for (; c < creditors.length; c += 1) {
    if (creditors[c].minor > 0) out.push({ fromMemberId: fundId, toMemberId: creditors[c].id, amountMinor: creditors[c].minor });
  }
  for (; d < debtors.length; d += 1) {
    if (debtors[d].minor > 0) out.push({ fromMemberId: debtors[d].id, toMemberId: fundId, amountMinor: debtors[d].minor });
  }
  return out;
}

/** Same transfers regardless of order — lets the rebuild skip rewriting identical pending rows. */
export function sameTransferSet(
  left: PlannedTransfer[],
  right: Array<{ from_member_id: string; to_member_id: string; amount_minor: unknown }>,
) {
  if (left.length !== right.length) return false;
  const key = (from: string, to: string, amount: number) => `${from}>${to}:${amount}`;
  const a = left.map((row) => key(row.fromMemberId, row.toMemberId, row.amountMinor)).sort();
  const b = right.map((row) => key(row.from_member_id, row.to_member_id, minor(row.amount_minor))).sort();
  return a.every((value, index) => value === b[index]);
}
