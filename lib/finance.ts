export type CircleMode = "manual" | "round_robin" | "draw" | "alphabetical" | "hierarchical";
export type CircleMember = { id: string; name: string };

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function digest(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

export async function buildCircleOrder(members: CircleMember[], mode: CircleMode, options: { seed?: string; previousRecipientId?: string } = {}) {
  if (!members.length) return { members: [], seedHash: null };
  const copy = [...members];
  if (mode === "alphabetical") copy.sort((a, b) => a.name.localeCompare(b.name, "ar", { sensitivity: "base" }));
  if (mode === "hierarchical" && options.previousRecipientId) {
    const index = copy.findIndex((member) => member.id === options.previousRecipientId);
    if (index >= 0) copy.push(...copy.splice(index, 1));
  }
  if (mode === "round_robin" && options.previousRecipientId) {
    const index = copy.findIndex((member) => member.id === options.previousRecipientId);
    if (index >= 0) copy.push(...copy.splice(0, index + 1));
  }
  if (mode !== "draw") return { members: copy, seedHash: null };
  const seed = options.seed || crypto.randomUUID();
  const ranked = await Promise.all(copy.map(async (member) => ({ member, rank: await digest(`${seed}:${member.id}`) })));
  ranked.sort((a, b) => a.rank.localeCompare(b.rank));
  return { members: ranked.map((item) => item.member), seedHash: await digest(seed) };
}

export function splitEvenly(amountMinor: number, memberIds: string[]) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || memberIds.length === 0) throw new Error("INVALID_SPLIT");
  const base = Math.floor(amountMinor / memberIds.length);
  let remainder = amountMinor % memberIds.length;
  return memberIds.map((memberId) => ({ memberId, shareMinor: base + (remainder-- > 0 ? 1 : 0) }));
}

export type Balance = { memberId: string; balanceMinor: number };
export function minimizeSettlements(balances: Balance[]) {
  const creditors = balances.filter((item) => item.balanceMinor > 0).map((item) => ({ ...item }));
  const debtors = balances.filter((item) => item.balanceMinor < 0).map((item) => ({ memberId: item.memberId, balanceMinor: -item.balanceMinor }));
  const settlements: { fromMemberId: string; toMemberId: string; amountMinor: number }[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amountMinor = Math.min(debtor.balanceMinor, creditor.balanceMinor);
    if (amountMinor > 0) settlements.push({ fromMemberId: debtor.memberId, toMemberId: creditor.memberId, amountMinor });
    debtor.balanceMinor -= amountMinor;
    creditor.balanceMinor -= amountMinor;
    if (debtor.balanceMinor === 0) debtorIndex += 1;
    if (creditor.balanceMinor === 0) creditorIndex += 1;
  }
  return settlements;
}

export function validateJournal(lines: { debitMinor: number; creditMinor: number }[]) {
  if (lines.length < 2) return false;
  const debit = lines.reduce((sum, line) => sum + line.debitMinor, 0);
  const credit = lines.reduce((sum, line) => sum + line.creditMinor, 0);
  return debit > 0 && debit === credit && lines.every((line) =>
    Number.isSafeInteger(line.debitMinor) && Number.isSafeInteger(line.creditMinor) &&
    ((line.debitMinor > 0 && line.creditMinor === 0) || (line.creditMinor > 0 && line.debitMinor === 0)));
}

/** How surplus above the mandatory contribution is booked. */
export type ExtraPolicy = "personal_reserve" | "voluntary_to_fund" | "advance_credit";

/**
 * Foundation rule for member payments:
 * 1) Apply cash against outstanding dues first (full remaining claim, not only one month).
 * 2) Any remainder is treated as advance (مقدم) by default.
 *
 * Example: remaining due 240, receive 100 → mandatory 100, surplus 0.
 * Example: remaining due 0, receive 50 → mandatory 0, surplus 50 as advance.
 * Example: remaining due 40, receive 100 → mandatory 40, surplus 60 as advance.
 */
export function splitContributionPayment(
  receivedMinor: number,
  monthlyPlanMinor: number,
  options: { remainingDueMinor?: number; extraPolicy?: ExtraPolicy } = {},
) {
  if (!Number.isSafeInteger(receivedMinor) || receivedMinor <= 0) throw new Error("INVALID_AMOUNT");
  if (!Number.isSafeInteger(monthlyPlanMinor) || monthlyPlanMinor < 0) throw new Error("INVALID_PLAN");
  const remainingDue = options.remainingDueMinor;
  if (remainingDue !== undefined && (!Number.isSafeInteger(remainingDue) || remainingDue < 0)) {
    throw new Error("INVALID_REMAINING_DUE");
  }
  // When remaining due is provided, apply against the full outstanding claim.
  // Monthly plan is only a fallback when remaining due is unknown.
  const mandatoryCap = remainingDue === undefined ? monthlyPlanMinor : remainingDue;
  const mandatoryMinor = Math.min(receivedMinor, mandatoryCap);
  const surplusMinor = receivedMinor - mandatoryMinor;
  const extraPolicy = options.extraPolicy
    ?? (remainingDue !== undefined ? "advance_credit" : "personal_reserve");
  return {
    receivedMinor,
    mandatoryMinor,
    surplusMinor,
    extraPolicy,
    commonFundDeltaMinor: mandatoryMinor + (extraPolicy === "voluntary_to_fund" || extraPolicy === "advance_credit" ? surplusMinor : 0),
    personalReserveDeltaMinor: extraPolicy === "personal_reserve" ? surplusMinor : 0,
    advanceCreditMinor: extraPolicy === "advance_credit" ? surplusMinor : 0,
  };
}

function asMinor(value: unknown) {
  const n = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

export function extraAddonMinorFromTransactions(
  memberId: string,
  spaceId: string,
  transactions: Array<{
    member_id?: string | null;
    space_id?: string;
    status?: string;
    allocation?: string;
    kind: string;
    amount_minor: number;
    description_ar?: string;
  }>,
) {
  let total = 0;
  for (const txn of transactions) {
    if (txn.member_id !== memberId || txn.space_id !== spaceId) continue;
    if ((txn.status ?? "approved") !== "approved") continue;
    if (txn.allocation !== "extra") continue;
    if (txn.kind === "expense") total += asMinor(txn.amount_minor);
    else if (txn.kind === "income" && txn.description_ar === "تسوية حصة مصروف للصندوق") total += asMinor(txn.amount_minor);
  }
  return total;
}

/** Offset credit (له) against debit (عليه) so the member is not asked to pay cash already held for them. */
export function netMemberClaim(debitMinor: number, creditMinor: number) {
  const debit = asMinor(debitMinor);
  const credit = asMinor(creditMinor);
  const reservedMinor = Math.min(debit, credit);
  return {
    grossDebitMinor: debit,
    grossCreditMinor: credit,
    reservedMinor,
    debitMinor: debit - reservedMinor,
    creditMinor: credit - reservedMinor,
  };
}

/** Cash the group already holds for the member (reserve + advance), before expense shares. */
export function memberCashCreditMinor(member: { paid_minor?: unknown; extra_minor?: unknown; due_minor?: unknown }, accruedDueMinor?: unknown) {
  const paid = asMinor(member.paid_minor);
  const extra = asMinor(member.extra_minor);
  const accrued = asMinor(accruedDueMinor ?? member.due_minor);
  return extra + Math.max(0, paid - accrued);
}

/** Personal-reserve cash inferred from ledger when extra_minor was never stored. */
export function personalReserveFromTransactions(
  memberId: string,
  spaceId: string,
  extraMinor: unknown,
  transactions: Array<{
    member_id?: string | null;
    space_id?: string;
    status?: string;
    allocation?: string;
    kind: string;
    amount_minor: number;
  }>,
) {
  if (asMinor(extraMinor) > 0) return 0;
  let total = 0;
  for (const txn of transactions) {
    if (txn.member_id !== memberId || txn.space_id !== spaceId) continue;
    if ((txn.status ?? "approved") === "voided") continue;
    if (txn.allocation === "personal_reserve" && ["contribution", "income"].includes(txn.kind)) {
      total += asMinor(txn.amount_minor);
    }
  }
  return total;
}

/** Credit used to reduce pending settlements and the Owes column. Always pass accrued (elapsed) dues, not the full goal. */
export function memberDisplayCreditMinor(
  member: { id: string; space_id: string; paid_minor?: unknown; extra_minor?: unknown; due_minor?: unknown },
  options: {
    accruedDueMinor?: unknown;
    transactions?: Array<{
      member_id?: string | null;
      space_id?: string;
      status?: string;
      allocation?: string;
      kind: string;
      amount_minor: number;
    }>;
  } = {},
) {
  const accrued = options.accruedDueMinor ?? member.due_minor;
  const fromTx = options.transactions
    ? personalReserveFromTransactions(member.id, member.space_id, member.extra_minor, options.transactions)
    : 0;
  return memberCashCreditMinor(member, accrued) + fromTx;
}

/** True when a trip/group expense was paid from the association common fund. */
export function isFundPaidExpense(expense: { paid_from?: string | null; paid_by_name?: string | null }) {
  return String(expense.paid_from ?? "") === "common_fund"
    || expense.paid_by_name === "صندوق الجمعية"
    || expense.paid_by_name === "Association fund";
}

/**
 * Net member contributions against fund-paid expense shares.
 * Example: paid 200, share 165.5 → leftover 34.5 (له), shortfall 0.
 * Example: paid 100, share 165.5 → leftover 0, shortfall 65.5 (عليه).
 */
export function memberFundPoolNet(paidMinor: unknown, fundShareMinor: unknown) {
  const paid = asMinor(paidMinor);
  const shares = asMinor(fundShareMinor);
  return {
    paidMinor: paid,
    fundShareMinor: shares,
    leftoverMinor: Math.max(0, paid - shares),
    shortfallMinor: Math.max(0, shares - paid),
  };
}

/** Extra + inferred personal reserve only (excludes paid−accrued advance). Used when fund shares already net against paid. */
export function memberExtraCreditMinor(
  member: { id: string; space_id: string; extra_minor?: unknown },
  transactions?: Array<{
    member_id?: string | null;
    space_id?: string;
    status?: string;
    allocation?: string;
    kind: string;
    amount_minor: number;
  }>,
) {
  const fromTx = transactions
    ? personalReserveFromTransactions(member.id, member.space_id, member.extra_minor, transactions)
    : 0;
  return asMinor(member.extra_minor) + fromTx;
}

/** Pending settlements with each payer's credit reserved oldest-first. */
export function pendingSettlementsWithCredit<T extends { from_member_id: string; amount_minor: unknown }>(
  settlements: T[],
  creditByMemberId: Map<string, number> | Record<string, number>,
) {
  const creditOf = (memberId: string) => {
    const value = creditByMemberId instanceof Map ? creditByMemberId.get(memberId) : creditByMemberId[memberId];
    return asMinor(value);
  };
  const used = new Map<string, number>();
  return settlements.map((item) => {
    const amountMinor = asMinor(item.amount_minor);
    const fromFund = String(item.from_member_id).startsWith("space:");
    let reservedMinor = 0;
    let payableMinor = amountMinor;
    if (!fromFund) {
      const already = used.get(item.from_member_id) ?? 0;
      const available = Math.max(0, creditOf(item.from_member_id) - already);
      reservedMinor = Math.min(payableMinor, available);
      payableMinor -= reservedMinor;
      used.set(item.from_member_id, already + reservedMinor);
    }
    return { ...item, amountMinor, reservedMinor, payableMinor };
  });
}
export function applyCreditToDebits<T extends { amountMinor: number }>(items: T[], creditMinor: number) {
  let left = asMinor(creditMinor);
  return items.map((item) => {
    const amount = asMinor(item.amountMinor);
    const reservedMinor = Math.min(amount, left);
    left -= reservedMinor;
    return { ...item, reservedMinor, payableMinor: amount - reservedMinor };
  });
}
