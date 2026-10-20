/** Society/group holdings: deposits and investments funded from cash (not expenses). */

export type SpaceHoldingKind = "deposit" | "investment" | "other";

export type SpaceHolding = {
  id: string;
  space_id: string;
  name: string;
  kind: SpaceHoldingKind;
  amount_minor: number;
  notes: string | null;
  acquired_at: string;
  matures_at?: string | null;
  expected_return_minor?: number;
  status: string;
  created_at: string;
};

export function normalizeHoldingKind(value: string | undefined): SpaceHoldingKind {
  if (value === "investment" || value === "stock" || value === "أسهم") return "investment";
  if (value === "other" || value === "أخرى") return "other";
  return "deposit";
}

export function holdingKindLabel(kind: string, locale: "ar" | "en") {
  if (kind === "investment") return locale === "ar" ? "استثمار / أسهم" : "Investment / stocks";
  if (kind === "other") return locale === "ar" ? "أصل آخر" : "Other asset";
  return locale === "ar" ? "وديعة بنكية" : "Bank deposit";
}

export function isHoldingTransfer(txn: { kind?: string; allocation?: string }) {
  return txn.kind === "transfer" && (txn.allocation === "holding" || txn.allocation === "from_holding");
}

export function looksLikeDepositExpense(description: string, type?: string) {
  const blob = `${description} ${type ?? ""}`;
  return /وديع|وديعة|استثمار|أسهم|سهم/i.test(blob);
}

export function holdingsTotalMinor(holdings: Array<{ amount_minor: number; status?: string }>) {
  return holdings
    .filter((row) => (row.status ?? "active") === "active")
    .reduce((sum, row) => sum + Number(row.amount_minor || 0), 0);
}

export function holdingsExpectedReturnMinor(holdings: Array<{ expected_return_minor?: number; status?: string }>) {
  return holdings
    .filter((row) => (row.status ?? "active") === "active")
    .reduce((sum, row) => sum + Number(row.expected_return_minor || 0), 0);
}

/** Infer months from names like «وديعة ٦ اشهر» / «لسنه». */
export function inferHoldingDurationMonths(label: string): number | null {
  const text = String(label ?? "")
    .replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit).toString())
    .replace(/[۰-۹]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit).toString());
  if (/سن[ةه]|عام|year/i.test(text)) return 12;
  const months = text.match(/(\d+)\s*(شهر|أشهر|اشهر|month)/i);
  if (months) {
    const value = Number(months[1]);
    if (Number.isFinite(value) && value > 0 && value <= 120) return value;
  }
  if (/نصف\s*سن/i.test(text)) return 6;
  return null;
}

export function addMonthsIso(startIso: string, months: number) {
  const date = new Date(startIso);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = Math.min(date.getUTCDate(), 28);
  return new Date(Date.UTC(year, month, day, 12, 0, 0)).toISOString();
}

export function holdingMaturityTone(maturesAt: string | null | undefined, now = new Date()) {
  if (!maturesAt) return "none" as const;
  const due = new Date(maturesAt);
  if (Number.isNaN(due.getTime())) return "none" as const;
  const ms = due.getTime() - now.getTime();
  const days = ms / (24 * 60 * 60 * 1000);
  if (days < 0) return "overdue" as const;
  if (days <= 30) return "soon" as const;
  return "scheduled" as const;
}

export function holdingMaturityLabel(
  maturesAt: string | null | undefined,
  locale: "ar" | "en",
  now = new Date(),
) {
  if (!maturesAt) return locale === "ar" ? "بدون استحقاق" : "No maturity";
  const due = new Date(maturesAt);
  if (Number.isNaN(due.getTime())) return locale === "ar" ? "بدون استحقاق" : "No maturity";
  const dateText = due.toLocaleDateString(locale === "ar" ? "ar-OM" : "en-GB");
  const tone = holdingMaturityTone(maturesAt, now);
  if (tone === "overdue") return locale === "ar" ? `استحق ${dateText}` : `Matured ${dateText}`;
  if (tone === "soon") return locale === "ar" ? `يستحق قريباً ${dateText}` : `Due soon ${dateText}`;
  return locale === "ar" ? `الاستحقاق ${dateText}` : `Matures ${dateText}`;
}
