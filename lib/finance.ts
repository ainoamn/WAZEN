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
