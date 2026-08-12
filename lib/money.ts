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

export function parseMoneyToMinor(value: string | number, currency = "SAR") { return parse(value, currency, false); }
export function parseNonNegativeMoneyToMinor(value: string | number, currency = "SAR") { return parse(value, currency, true); }

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
