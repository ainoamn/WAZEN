export const currencyScales: Readonly<Record<string, number>> = Object.freeze({
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  JPY: 0, KRW: 0,
});

export function currencyScale(currency: string) { return currencyScales[currency.toUpperCase()] ?? 2; }

function parse(value: string | number, currency: string, allowZero: boolean) {
  const raw = typeof value === "number" ? String(value) : value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(raw)) throw new Error("INVALID_AMOUNT");
  const scale = currencyScale(currency); const [whole, fraction = ""] = raw.split(".");
  if (fraction.length > scale) throw new Error("TOO_MANY_DECIMALS");
  const multiplier = 10n ** BigInt(scale);
  const result = BigInt(whole) * multiplier + BigInt((fraction + "0".repeat(scale)).slice(0, scale) || "0");
  if ((!allowZero && result <= 0n) || result < 0n || result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("INVALID_AMOUNT");
  return Number(result);
}

export function parseMoneyToMinor(value: string | number, currency = "OMR") { return parse(value, currency, false); }
export function parseNonNegativeMoneyToMinor(value: string | number, currency = "OMR") { return parse(value, currency, true); }

function majorLabel(minor: number, currency: string) {
  return (minor / 10 ** currencyScale(currency)).toFixed(currencyScale(currency));
}

/** Keep the typed string while entering 7.500; only rewrite when over cash/total. */
export function applyTypedFundShare(input: {
  typed: string;
  totalMinor: number;
  fundCashMinor: number;
  currency?: string;
}): { fundAmount: string; memberAmount?: string; fundMinor?: number } | null {
  const currency = input.currency ?? "OMR";
  const typed = input.typed.trim() === "" ? input.typed : input.typed.replace(/[^\d.]/g, "");
  if (typed !== "" && !/^\d*(?:\.\d{0,3})?$/.test(typed)) return null;
  if (!typed.trim() || /\.$/.test(typed)) return { fundAmount: typed };
  try {
    let fundMinor = parseNonNegativeMoneyToMinor(typed, currency);
    let fundAmount = typed;
    const cash = Math.max(0, Number.isFinite(Number(input.fundCashMinor)) ? Math.trunc(Number(input.fundCashMinor)) : 0);
    const total = Math.max(0, Number.isFinite(Number(input.totalMinor)) ? Math.trunc(Number(input.totalMinor)) : 0);
    if (fundMinor > cash) {
      fundMinor = cash;
      fundAmount = majorLabel(fundMinor, currency);
    }
    if (total > 0 && fundMinor >= total) {
      fundMinor = Math.max(0, total - 1);
      fundAmount = majorLabel(fundMinor, currency);
    }
    if (total > 0 && fundMinor > 0 && fundMinor < total) {
      return { fundAmount, fundMinor, memberAmount: majorLabel(total - fundMinor, currency) };
    }
    return { fundAmount, fundMinor };
  } catch {
    return { fundAmount: typed };
  }
}

export function finalizeTypedFundShare(input: {
  typed: string;
  totalMinor: number;
  fundCashMinor: number;
  currency?: string;
}) {
  const applied = applyTypedFundShare({ ...input, typed: input.typed.replace(/\.$/, "") });
  if (!applied || applied.fundMinor == null) return applied ?? { fundAmount: input.typed };
  const currency = input.currency ?? "OMR";
  return {
    fundAmount: majorLabel(applied.fundMinor, currency),
    memberAmount: applied.memberAmount,
    fundMinor: applied.fundMinor,
  };
}

export function formatMoneyMinor(
  minor: number,
  currency = "OMR",
  locale: "ar" | "en" = "ar",
  options?: { compact?: boolean },
) {
  const scale = currencyScale(currency);
  const divisor = 10 ** scale;
  const amount = Number(minor) || 0;
  const formatted = new Intl.NumberFormat(locale === "ar" ? "ar-OM" : "en-OM", {
    style: "currency",
    currency,
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
    notation: options?.compact ? "compact" : "standard",
  }).format(Math.abs(amount) / divisor);
  return amount < 0 ? `(${formatted})` : formatted;
}

/** Signed balances: parentheses when negative, never a leading minus. */
export function formatSignedMoneyMinor(
  minor: number,
  currency = "OMR",
  locale: "ar" | "en" = "ar",
) {
  return formatMoneyMinor(minor, currency, locale);
}

/** Debit-side magnitude (spend / owes): parentheses even when stored as a positive. */
export function formatDebitMoneyMinor(
  minor: number,
  currency = "OMR",
  locale: "ar" | "en" = "ar",
) {
  const amount = Number(minor) || 0;
  return amount === 0 ? formatMoneyMinor(0, currency, locale) : formatMoneyMinor(-Math.abs(amount), currency, locale);
}

export const DEFAULT_CURRENCY = "OMR";
export const DEFAULT_COUNTRY = "OM";
export const DEFAULT_TIMEZONE = "Asia/Muscat";


export function calculatePercentMinor(amountMinor: number, basisPoints: number) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || !Number.isSafeInteger(basisPoints) || basisPoints < 0) throw new Error("INVALID_MONEY_INPUT");
  return Number((BigInt(amountMinor) * BigInt(basisPoints) + 5_000n) / 10_000n);
}

export function multiplyMinor(amountMinor: number, quantity: number) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || !Number.isSafeInteger(quantity) || quantity < 0) throw new Error("INVALID_MONEY_INPUT");
  const result = BigInt(amountMinor) * BigInt(quantity);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("MONEY_OVERFLOW");
  return Number(result);
}
