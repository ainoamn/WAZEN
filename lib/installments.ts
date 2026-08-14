/** Monthly association dues (BHD-Pro style: oldest unpaid invoices first). */

export type InstallmentLike = {
  id: string;
  period_index: number;
  period_key: string;
  amount_minor: number;
  paid_minor: number;
  status: string;
};

export type InstallmentAllocation = {
  installmentId: string;
  periodIndex: number;
  periodKey: string;
  amountMinor: number;
};

export function remainingInstallmentMinor(row: Pick<InstallmentLike, "amount_minor" | "paid_minor">) {
  return Math.max(0, Number(row.amount_minor) - Number(row.paid_minor));
}

export function installmentStatus(amountMinor: number, paidMinor: number) {
  if (paidMinor <= 0) return "unpaid";
  if (paidMinor >= amountMinor) return "paid";
  return "partial";
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function addUtcMonths(isoDate: string, months: number) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) throw new Error("INVALID_START_DATE");
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = Math.min(date.getUTCDate(), 28);
  return new Date(Date.UTC(year, month, day, 12, 0, 0)).toISOString();
}

export function periodKeyFromDate(isoDate: string) {
  const date = new Date(isoDate);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

export function buildInstallmentSchedule(input: {
  memberId: string;
  spaceId: string;
  startAt: string;
  durationMonths: number;
  amountMinor: number;
  paidMinor?: number;
}) {
  const duration = Math.trunc(input.durationMonths);
  if (!Number.isSafeInteger(duration) || duration < 1 || duration > 120) throw new Error("INVALID_DURATION");
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error("INVALID_AMOUNT");
  const paidMinor = Math.max(0, Number(input.paidMinor ?? 0));
  let remainingPaid = paidMinor;
  const rows: Array<InstallmentLike & { due_at: string }> = [];
  for (let index = 0; index < duration; index += 1) {
    const dueAt = addUtcMonths(input.startAt, index);
    const take = Math.min(remainingPaid, input.amountMinor);
    remainingPaid -= take;
    rows.push({
      id: `${input.memberId}:m${index + 1}`,
      period_index: index + 1,
      period_key: periodKeyFromDate(dueAt),
      amount_minor: input.amountMinor,
      paid_minor: take,
      status: installmentStatus(input.amountMinor, take),
      due_at: dueAt,
    });
  }
  return {
    rows,
    totalMinor: input.amountMinor * duration,
    unpaidCount: rows.filter((row) => row.status !== "paid").length,
  };
}

/**
 * Apply cash to unpaid months in chronological order.
 * If selectedIds is provided, only those months are eligible — still oldest-first among them.
 */
export function allocateOldestFirst(
  installments: InstallmentLike[],
  paymentMinor: number,
  selectedIds?: string[],
) {
  if (!Number.isSafeInteger(paymentMinor) || paymentMinor <= 0) throw new Error("INVALID_AMOUNT");
  const sorted = [...installments].sort((a, b) => a.period_index - b.period_index);
  const pool = (selectedIds?.length ? sorted.filter((row) => selectedIds.includes(row.id)) : sorted)
    .filter((row) => remainingInstallmentMinor(row) > 0);
  let left = paymentMinor;
  const allocations: InstallmentAllocation[] = [];
  for (const row of pool) {
    if (left <= 0) break;
    const take = Math.min(left, remainingInstallmentMinor(row));
    if (take <= 0) continue;
    allocations.push({
      installmentId: row.id,
      periodIndex: row.period_index,
      periodKey: row.period_key,
      amountMinor: take,
    });
    left -= take;
  }
  return {
    allocations,
    appliedMinor: paymentMinor - left,
    leftoverMinor: left,
  };
}

/** Checking month N also covers every older unpaid month. */
export function selectThroughOldest(installments: InstallmentLike[], periodIndex: number) {
  return installments
    .filter((row) => row.period_index <= periodIndex && remainingInstallmentMinor(row) > 0)
    .sort((a, b) => a.period_index - b.period_index)
    .map((row) => row.id);
}

export function selectByAmount(installments: InstallmentLike[], paymentMinor: number) {
  const result = allocateOldestFirst(installments, paymentMinor);
  return result.allocations.map((item) => item.installmentId);
}

export function totalRemainingMinor(installments: InstallmentLike[], ids?: string[]) {
  return installments
    .filter((row) => !ids?.length || ids.includes(row.id))
    .reduce((sum, row) => sum + remainingInstallmentMinor(row), 0);
}
