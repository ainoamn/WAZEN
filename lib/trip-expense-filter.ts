/** Search, filter and sort for a trip's expense list (date, amount, description, payer, member names). */

import { currencyScale } from "./money.ts";

export type TripExpenseSort = "newest" | "oldest" | "amount_desc" | "amount_asc" | "name";

export type FilterableTripExpense = {
  id: string;
  description: string;
  amount_minor: number;
  occurred_at: string;
  paid_by_member_id?: string | null;
  paid_by_name?: string | null;
  paid_from?: string | null;
};

export type TripExpenseFilter = {
  query?: string;
  /** "all", "fund", or a member id. */
  payer?: string;
  /** Inclusive yyyy-mm-dd bounds. */
  from?: string;
  to?: string;
  sort?: TripExpenseSort;
  currency?: string;
};

const DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

/** Latin digits, «٫» as «.», no thousands separators or bidi marks, unified alef/yaa, lower case. */
export function normalizeSearchText(value: string) {
  return String(value ?? "")
    .replace(/[٠-٩۰-۹]/g, (digit) => DIGITS[digit] ?? digit)
    .replace(/٫/g, ".")
    .replace(/[٬,]/g, "")
    .replace(/[\u200e\u200f\u061c\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .trim();
}

export function isFundExpense(expense: Pick<FilterableTripExpense, "paid_from">) {
  return String(expense.paid_from ?? "") === "common_fund";
}

function amountTerms(minor: number, currency: string) {
  const scale = currencyScale(currency);
  const fixed = (minor / 10 ** scale).toFixed(scale);
  const trimmed = fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
  return [fixed, trimmed];
}

/** The calendar day the user sees (local time), as yyyy-mm-dd — matches `<input type="date">`. */
function localDay(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso ?? "").slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateTerms(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return [String(iso ?? "").slice(0, 10)];
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    localDay(iso),
    `${day}/${month}/${year}`,
    `${pad(day)}/${pad(month)}/${year}`,
    `${day}-${month}-${year}`,
    `${pad(day)}-${pad(month)}-${year}`,
    date.toLocaleDateString("ar-OM", { month: "long" }),
    date.toLocaleDateString("en-GB", { month: "long" }),
  ];
}

export function tripExpenseSearchText(
  expense: FilterableTripExpense,
  memberNames: string[],
  currency = "OMR",
) {
  return normalizeSearchText([
    expense.description,
    isFundExpense(expense) ? "صندوق الجمعية الصندوق fund" : expense.paid_by_name ?? "",
    ...memberNames,
    ...amountTerms(Number(expense.amount_minor) || 0, currency),
    ...dateTerms(expense.occurred_at),
  ].join(" "));
}

export function filterTripExpenses<T extends FilterableTripExpense>(
  expenses: T[],
  namesByExpense: Map<string, string[]>,
  filter: TripExpenseFilter,
): T[] {
  const currency = filter.currency || "OMR";
  const tokens = normalizeSearchText(filter.query ?? "").split(/\s+/).filter(Boolean);
  const payer = filter.payer && filter.payer !== "all" ? filter.payer : "";
  const rows = expenses.filter((expense) => {
    if (payer === "fund" && !isFundExpense(expense)) return false;
    if (payer && payer !== "fund" && (isFundExpense(expense) || expense.paid_by_member_id !== payer)) return false;
    const day = localDay(expense.occurred_at);
    if (filter.from && day < filter.from) return false;
    if (filter.to && day > filter.to) return false;
    if (!tokens.length) return true;
    const haystack = tripExpenseSearchText(expense, namesByExpense.get(expense.id) ?? [], currency);
    return tokens.every((token) => haystack.includes(token));
  });
  const byDate = (a: T, b: T) => String(a.occurred_at).localeCompare(String(b.occurred_at)) || a.id.localeCompare(b.id);
  switch (filter.sort ?? "newest") {
    case "oldest": return rows.sort(byDate);
    case "amount_desc": return rows.sort((a, b) => b.amount_minor - a.amount_minor || byDate(b, a));
    case "amount_asc": return rows.sort((a, b) => a.amount_minor - b.amount_minor || byDate(b, a));
    case "name": return rows.sort((a, b) => a.description.localeCompare(b.description, "ar") || byDate(b, a));
    default: return rows.sort((a, b) => byDate(b, a));
  }
}
