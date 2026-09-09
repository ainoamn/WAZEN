import { periodKeyFromDate } from "./installments";
import { formatMoneyMinor } from "./money";

export function monthKeysThroughNow(startAt: string, endsAt: string | null | undefined, asOf = new Date(), cap = 36) {
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

export function monthKeysForRule(input: { startsAt: string; endsAt?: string | null; schedule?: string | null; asOf?: Date }) {
  const schedule = input.schedule || "monthly";
  if (schedule === "unscheduled") return [];
  if (schedule === "once") return [periodKeyFromDate(new Date(input.startsAt).toISOString())];
  const horizon = input.asOf ?? new Date(Date.now() + 40 * 86_400_000);
  return monthKeysThroughNow(input.startsAt, input.endsAt, horizon);
}

export function clampDueDay(dueDay: number) {
  const day = Math.round(Number(dueDay) || 1);
  return Math.min(31, Math.max(1, day));
}

export function resolveInstallmentAmounts(input: { amountMinor: number; totalMinor: number; durationMonths: number }) {
  let amountMinor = Math.max(0, Math.round(Number(input.amountMinor) || 0));
  let totalMinor = Math.max(0, Math.round(Number(input.totalMinor) || 0));
  let durationMonths = Math.max(0, Math.round(Number(input.durationMonths) || 0));
  if (totalMinor > 0 && durationMonths > 0 && amountMinor <= 0) amountMinor = Math.round(totalMinor / durationMonths);
  if (totalMinor > 0 && amountMinor > 0 && durationMonths <= 0) durationMonths = Math.ceil(totalMinor / amountMinor);
  if (amountMinor > 0 && durationMonths > 0 && totalMinor <= 0) totalMinor = amountMinor * durationMonths;
  return { amountMinor, totalMinor, durationMonths: Math.min(360, durationMonths) };
}

export function endsAtFromDuration(startsAt: string, durationMonths: number) {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime()) || durationMonths <= 0) return null;
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + durationMonths, 0, 12, 0, 0)).toISOString();
}

export function reminderKindForDue(dueAtIso: string, asOf = new Date()): "due" | "eve" | null {
  const dueDay = String(dueAtIso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDay)) return null;
  const today = asOf.toISOString().slice(0, 10);
  const tomorrow = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate() + 1)).toISOString().slice(0, 10);
  if (dueDay === today) return "due";
  if (dueDay === tomorrow) return "eve";
  return null;
}

export type PersonalDueOccurrence = {
  id: string;
  space_id: string;
  due_at: string;
  status?: string | null;
  expected_minor?: number | null;
  rule_name?: string | null;
  rule_kind?: string | null;
  total_minor?: number | null;
  rule_paid_minor?: number | null;
};

export function personalDueAlerts(
  occurrences: PersonalDueOccurrence[],
  spaces: Array<{ id: string; type?: string; name_ar?: string; name_en?: string }>,
  asOf = new Date(),
) {
  const personalIds = new Set(spaces.filter((space) => space.type === "personal").map((space) => space.id));
  const alerts: Array<{ id: string; severity: "info" | "warning" | "danger"; href?: string; ar: string; en: string }> = [];
  for (const row of occurrences) {
    if ((row.status ?? "pending") !== "pending") continue;
    if (!personalIds.has(row.space_id)) continue;
    const kind = reminderKindForDue(row.due_at, asOf);
    if (!kind) continue;
    const space = spaces.find((item) => item.id === row.space_id);
    const name = row.rule_name || (kind === "due" ? "دفعة" : "قسط");
    const amount = formatMoneyMinor(Number(row.expected_minor) || 0, "OMR", "ar");
    const remaining = Math.max(0, Number(row.total_minor || 0) - Number(row.rule_paid_minor || 0));
    const remainingLabel = remaining > 0 ? ` · متبقي ${formatMoneyMinor(remaining, "OMR", "ar")}` : "";
    const whenAr = kind === "eve" ? "غداً" : "اليوم";
    const whenEn = kind === "eve" ? "tomorrow" : "today";
    alerts.push({
      id: `personal-bill:${kind}:${row.id}`,
      severity: kind === "due" ? "warning" : "info",
      href: `/dashboard?view=personal&space=${encodeURIComponent(row.space_id)}`,
      ar: `${whenAr} استحقاق «${name}» بمبلغ ${amount}${remainingLabel}${space?.name_ar ? ` — ${space.name_ar}` : ""}. دفع متكرر.`,
      en: `${whenEn}: “${name}” is due (${formatMoneyMinor(Number(row.expected_minor) || 0, "OMR", "en")})${remaining > 0 ? ` · remaining ${formatMoneyMinor(remaining, "OMR", "en")}` : ""}. Recurring payment.`,
    });
  }
  return alerts.slice(0, 8);
}

export function nextPeriodKey(periodKey: string) {
  const [year, month] = periodKey.split("-").map(Number);
  const date = new Date(Date.UTC(year || 1970, (month || 1), 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function dueAtForPeriod(periodKey: string, dueDay: number) {
  const [year, month] = periodKey.split("-").map(Number);
  const y = year || 1970;
  const m = (month || 1) - 1;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(clampDueDay(dueDay), lastDay);
  return new Date(Date.UTC(y, m, day, 12, 0, 0)).toISOString();
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
    space_id?: unknown;
    period_key?: unknown;
    expected_minor?: unknown;
    actual_minor?: unknown;
    rule_kind?: unknown;
    rule_name?: unknown;
  },
  transactions: Array<{
    id?: unknown;
    status?: unknown;
  }>,
) {
  const status = String(item.status ?? "pending");
  const transactionId = item.transaction_id == null ? null : String(item.transaction_id);
  const linked = transactionId ? transactions.find((row) => String(row.id) === transactionId) : undefined;
  if (status === "voided" || status === "superseded") return "pending";
  if (linked && (String(linked.status) === "voided" || String(linked.status) === "superseded")) return "pending";
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
