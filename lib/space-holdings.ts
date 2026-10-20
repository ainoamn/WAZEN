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
