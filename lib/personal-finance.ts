import { periodKeyFromDate } from "./installments";

export function monthKeysThroughNow(startAt: string, endsAt: string | null | undefined, asOf = new Date(), cap = 24) {
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return [];
  const endLimit = endsAt ? new Date(endsAt) : asOf;
  const last = endLimit.getTime() < asOf.getTime() ? endLimit : asOf;
  const keys: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1, 12, 0, 0));
  const lastKey = periodKeyFromDate(last.toISOString());
  for (let i = 0; i < cap; i += 1) {
    const key = periodKeyFromDate(cursor.toISOString());
    if (key > lastKey) break;
    keys.push(key);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

export function monthKeysForRule(input: { startsAt: string; endsAt?: string | null; schedule?: string | null }) {
  const schedule = input.schedule || "monthly";
  if (schedule === "unscheduled") return [];
  if (schedule === "once") return [periodKeyFromDate(new Date(input.startsAt).toISOString())];
  return monthKeysThroughNow(input.startsAt, input.endsAt);
}

export function nextPeriodKey(periodKey: string) {
  const [year, month] = periodKey.split("-").map(Number);
  const date = new Date(Date.UTC(year || 1970, (month || 1), 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function dueAtForPeriod(periodKey: string, dueDay: number) {
  const [year, month] = periodKey.split("-").map(Number);
  const day = Math.min(Math.max(1, dueDay || 1), 28);
  return new Date(Date.UTC(year, (month || 1) - 1, day, 12, 0, 0)).toISOString();
}

export function omrMajor(minor: number) {
  return (Number(minor || 0) / 1000).toFixed(3);
}

export function occurrenceVarianceCopy(expectedMinor: number, actualMinor: number, locale: "ar" | "en") {
  const expected = Number(expectedMinor || 0);
  const actual = Number(actualMinor || 0);
  const delta = actual - expected;
  if (locale === "ar") {
    if (delta === 0) return `دفعت ${omrMajor(actual)} من ${omrMajor(expected)} · مطابق للالتزام`;
    if (delta > 0) return `دفعت ${omrMajor(actual)} من ${omrMajor(expected)} · زيادة ${omrMajor(delta)}`;
    return `دفعت ${omrMajor(actual)} من ${omrMajor(expected)} · نقص ${omrMajor(Math.abs(delta))}`;
  }
  if (delta === 0) return `Paid ${omrMajor(actual)} of ${omrMajor(expected)} · matches commitment`;
  if (delta > 0) return `Paid ${omrMajor(actual)} of ${omrMajor(expected)} · over ${omrMajor(delta)}`;
  return `Paid ${omrMajor(actual)} of ${omrMajor(expected)} · short ${omrMajor(Math.abs(delta))}`;
}

export function accountLiveBalance(
  openingMinor: number,
  transactions: Array<{ account_id?: string | null; kind: string; amount_minor: number; status?: string }>,
  accountId: string,
) {
  return transactions.reduce((sum, row) => {
    if (row.account_id !== accountId) return sum;
    if (row.status && row.status !== "approved") return sum;
    if (row.kind === "income" || row.kind === "contribution") return sum + Number(row.amount_minor);
    if (row.kind === "expense") return sum - Number(row.amount_minor);
    return sum;
  }, Number(openingMinor) || 0);
}
