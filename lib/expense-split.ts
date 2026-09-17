import { ApiError } from "./api-error";
import { composeExpenseShares, resolveExpenseSplitMembers, splitEvenly } from "./finance";
import { parseMoneyToMinor, parseNonNegativeMoneyToMinor } from "./money";

export type ExpenseSplitRow = { memberId: string; shareMinor: number };

export type ExpenseSplitPayload = {
  amount?: string | number;
  sharedAmount?: string | number;
  sharedMemberIds?: string[];
  extraShares?: Array<{ memberId: string; amount: string | number }>;
  splitMemberIds?: string[];
};

export function hasComposeParts(input: ExpenseSplitPayload) {
  return input.sharedAmount !== undefined || Boolean(input.extraShares?.length);
}

/** Turn the form/API payload into posted amount + per-member shares. */
export function planExpenseSplits(input: ExpenseSplitPayload & {
  currency: string;
  allowedIds: string[];
  existingIds?: string[];
  forceAllMembers?: boolean;
}): { amountMinor: number; splits: ExpenseSplitRow[] } {
  const allowedIds = [...input.allowedIds];
  if (!allowedIds.length) throw new Error("NO_ACTIVE_MEMBERS");

  if (input.forceAllMembers) {
    if (input.amount === undefined || input.amount === "") throw new Error("INVALID_AMOUNT");
    const amountMinor = parseMoneyToMinor(input.amount, input.currency);
    return { amountMinor, splits: splitEvenly(amountMinor, allowedIds) };
  }

  if (hasComposeParts(input)) {
    const sharedRaw = input.sharedAmount;
    const sharedMinor = sharedRaw === undefined || sharedRaw === ""
      ? 0
      : parseNonNegativeMoneyToMinor(sharedRaw, input.currency);
    const extras = (input.extraShares ?? [])
      .filter((row) => String(row.amount ?? "").trim() !== "")
      .map((row) => ({
        memberId: row.memberId,
        amountMinor: parseMoneyToMinor(row.amount, input.currency),
      }));
    const composed = composeExpenseShares({
      sharedMinor,
      sharedMemberIds: input.sharedMemberIds,
      extras,
      allowedIds,
    });
    if (input.amount !== undefined && input.amount !== "") {
      const posted = parseMoneyToMinor(input.amount, input.currency);
      if (posted !== composed.totalMinor) throw new Error("AMOUNT_SPLIT_MISMATCH");
    }
    return { amountMinor: composed.totalMinor, splits: composed.splits };
  }

  if (input.amount === undefined || input.amount === "") throw new Error("INVALID_AMOUNT");
  const amountMinor = parseMoneyToMinor(input.amount, input.currency);
  const splitMemberIds = resolveExpenseSplitMembers({
    requestedIds: input.splitMemberIds,
    existingIds: input.existingIds,
    fallbackIds: allowedIds,
  });
  return { amountMinor, splits: splitEvenly(amountMinor, splitMemberIds) };
}

export function planExpenseSplitsForApi(input: Parameters<typeof planExpenseSplits>[0]) {
  try {
    return planExpenseSplits(input);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_SPLIT";
    if (code === "NO_ACTIVE_MEMBERS") throw new ApiError(400, "NO_ACTIVE_MEMBERS");
    if (code === "INVALID_AMOUNT" || code === "TOO_MANY_DECIMALS") throw new ApiError(400, "INVALID_AMOUNT");
    if (code === "AMOUNT_SPLIT_MISMATCH") throw new ApiError(400, "AMOUNT_SPLIT_MISMATCH");
    throw new ApiError(400, "INVALID_SPLIT");
  }
}

/** One bill paid from the fund and a member pocket: both parts must be > 0 and sum to the total. */
export function planPayerSplit(input: {
  currency: string;
  totalMinor: number;
  fundAmount?: string | number;
  memberAmount?: string | number;
}): { fundMinor: number; memberMinor: number } {
  if (input.fundAmount === undefined || input.fundAmount === "" || input.memberAmount === undefined || input.memberAmount === "") {
    throw new Error("INVALID_SPLIT");
  }
  const fundMinor = parseMoneyToMinor(input.fundAmount, input.currency);
  const memberMinor = parseMoneyToMinor(input.memberAmount, input.currency);
  if (fundMinor <= 0 || memberMinor <= 0) throw new Error("INVALID_AMOUNT");
  if (fundMinor + memberMinor !== input.totalMinor) throw new Error("AMOUNT_SPLIT_MISMATCH");
  return { fundMinor, memberMinor };
}

export function planPayerSplitForApi(input: Parameters<typeof planPayerSplit>[0]) {
  try {
    return planPayerSplit(input);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_SPLIT";
    if (code === "INVALID_AMOUNT" || code === "TOO_MANY_DECIMALS") throw new ApiError(400, "INVALID_AMOUNT");
    if (code === "AMOUNT_SPLIT_MISMATCH") throw new ApiError(400, "AMOUNT_SPLIT_MISMATCH");
    throw new ApiError(400, "INVALID_SPLIT");
  }
}
