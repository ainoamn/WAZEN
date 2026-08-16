export const PLAN_FEATURE_CATALOG = [
  { id: "personal", ar: "محفظة شخصية", en: "Personal wallet" },
  { id: "household", ar: "المنزل والعائلة", en: "Household" },
  { id: "trips", ar: "محافظ السفر", en: "Travel wallets" },
  { id: "circles", ar: "الجمعيات والمجموعات", en: "Circles & groups" },
  { id: "statements", ar: "كشوف الحساب والطباعة", en: "Statements & print" },
  { id: "advanced_reports", ar: "التقارير التفصيلية", en: "Advanced reports" },
  { id: "documents", ar: "المستندات والإيصالات", en: "Documents & receipts" },
  { id: "exports", ar: "تصدير البيانات", en: "Data export" },
  { id: "smart_accountant", ar: "المحاسب الذكي", en: "Smart accountant" },
  { id: "draws", ar: "القرعة وترتيب الأدوار", en: "Draws & turn order" },
  { id: "voting", ar: "التصويت", en: "Voting" },
  { id: "api", ar: "واجهة برمجية", en: "API access" },
  { id: "priority_support", ar: "دعم أولوية", en: "Priority support" },
] as const;

export type PlanFeatureId = (typeof PLAN_FEATURE_CATALOG)[number]["id"];
export const PLAN_FEATURE_KEYS = PLAN_FEATURE_CATALOG.map((item) => item.id);

const SPACE_TYPE_ALIASES: Record<string, string[]> = {
  personal: ["personal", "basic_reports"],
  household: ["household", "all_wallets", "unlimited"],
  trip: ["trips", "travel", "all_wallets", "unlimited"],
  society: ["circles", "circle", "all_wallets", "unlimited"],
  group: ["circles", "circle", "all_wallets", "unlimited"],
};

export function parsePlanFeatures(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function planHasFeature(features: string[], feature: string) {
  if (!features.length) return false;
  if (features.includes("*") || features.includes("unlimited") || features.includes("all_wallets")) return true;
  return features.includes(feature);
}

export function planAllowsSpaceType(features: string[], spaceType: string) {
  const aliases = SPACE_TYPE_ALIASES[spaceType];
  if (!aliases) return true;
  if (!features.length) return spaceType === "personal";
  if (features.includes("*") || features.includes("unlimited") || features.includes("all_wallets")) return true;
  return aliases.some((key) => features.includes(key));
}

export function resolveEntitlements(input: {
  planFeatures: string[];
  grant?: string[];
  deny?: string[];
  walletLimit: number;
  memberLimit: number;
  walletLimitOverride?: number | null;
  memberLimitOverride?: number | null;
  status?: string;
}) {
  const granted = new Set([...input.planFeatures, ...(input.grant ?? [])]);
  for (const key of input.deny ?? []) granted.delete(key);
  const features = [...granted];
  const walletLimit = Number(input.walletLimitOverride ?? 0) > 0 ? Number(input.walletLimitOverride) : Number(input.walletLimit) || 1;
  const memberLimit = Number(input.memberLimitOverride ?? 0) > 0 ? Number(input.memberLimitOverride) : Number(input.memberLimit) || 2;
  return {
    features,
    walletLimit,
    memberLimit,
    status: input.status ?? "none",
  };
}
