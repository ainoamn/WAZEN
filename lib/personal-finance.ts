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

export function occurrenceLedgerStatus(
  item: {
    status?: unknown;
    transaction_id?: unknown;
    rule_name?: unknown;
    space_id?: unknown;
    period_key?: unknown;
    expected_minor?: unknown;
    actual_minor?: unknown;
    rule_kind?: unknown;
  },
  transactions: Array<{
    id?: unknown;
    space_id?: unknown;
    status?: unknown;
    kind?: unknown;
    amount_minor?: unknown;
    occurred_at?: unknown;
    description_ar?: unknown;
    description_en?: unknown;
  }>,
) {
  const status = String(item.status ?? "pending");
  const transactionId = item.transaction_id == null ? null : String(item.transaction_id);
  const spaceId = String(item.space_id ?? "");
  const periodKey = String(item.period_key ?? "");
  const expectedMinor = Number(item.expected_minor ?? 0);
  const actualMinor = item.actual_minor == null ? null : Number(item.actual_minor);
  const ruleKind = item.rule_kind == null ? undefined : String(item.rule_kind);
  const name = String(item.rule_name ?? "").trim();
  const linked = transactionId ? transactions.find((row) => String(row.id) === transactionId) : undefined;
  if (linked && (String(linked.status) === "voided" || String(linked.status) === "superseded")) {
    return String(linked.status) === "superseded" ? "superseded" : "voided";
  }
  const amount = Number(actualMinor ?? expectedMinor);
  const matched = transactions.find((row) => {
    if (String(row.space_id) !== spaceId) return false;
    if (String(row.status) !== "voided" && String(row.status) !== "superseded") return false;
    const month = String(row.occurred_at || "").slice(0, 7);
    if (month !== periodKey) return false;
    if (Number(row.amount_minor) !== amount) return false;
    const incomeLike = ruleKind === "income";
    const txnIncome = String(row.kind) === "income" || String(row.kind) === "contribution";
    if (incomeLike !== txnIncome) return false;
    if (!name) return true;
    return `${String(row.description_ar ?? "")} ${String(row.description_en ?? "")}`.includes(name);
  });
  if (matched) return String(matched.status) === "superseded" ? "superseded" : "voided";
  return status;
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
