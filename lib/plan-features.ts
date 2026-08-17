export const PLAN_FEATURE_CATALOG = [
  { id: "personal", ar: "محفظة شخصية", en: "Personal wallet", group: "wallets" },
  { id: "household", ar: "المنزل والعائلة", en: "Household", group: "wallets" },
  { id: "trips", ar: "محافظ السفر", en: "Travel wallets", group: "wallets" },
  { id: "circles", ar: "الجمعيات والمجموعات", en: "Circles & groups", group: "wallets" },
  { id: "statements", ar: "كشوف الحساب والطباعة", en: "Statements & print", group: "records" },
  { id: "advanced_reports", ar: "التقارير التفصيلية", en: "Advanced reports", group: "records" },
  { id: "documents", ar: "المستندات والإيصالات", en: "Documents & receipts", group: "records" },
  { id: "exports", ar: "تصدير البيانات", en: "Data export", group: "records" },
  { id: "smart_accountant", ar: "المحاسب الذكي", en: "Smart accountant", group: "tools" },
  { id: "draws", ar: "القرعة وترتيب الأدوار", en: "Draws & turn order", group: "tools" },
  { id: "voting", ar: "التصويت", en: "Voting", group: "tools" },
  { id: "api", ar: "واجهة برمجية", en: "API access", group: "tools" },
  { id: "priority_support", ar: "دعم أولوية", en: "Priority support", group: "tools" },
] as const;

export const PLAN_FEATURE_GROUPS = [
  { id: "wallets", ar: "المحافظ", en: "Wallets" },
  { id: "records", ar: "التقارير والمستندات", en: "Reports & documents" },
  { id: "tools", ar: "الأدوات والدعم", en: "Tools & support" },
] as const;

/** 0 or ≥ 9999 means unlimited for transaction / record / user quotas. */
export const UNLIMITED_QUOTA = 0;

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

/** Empty `features: []` must not hide wallets the user already has. */
export function sidebarAllowsWalletView(features: string[], existingTypes: Iterable<string>, spaceType: string) {
  if (planAllowsSpaceType(features, spaceType)) return true;
  const types = new Set(existingTypes);
  if (spaceType === "society" || spaceType === "group") return types.has("society") || types.has("group");
  return types.has(spaceType);
}

/** Lowest paid plan that includes a locked nav item or feature. */
export const NAV_UPGRADE_TARGETS: Record<string, { planAr: string; planEn: string }> = {
  household: { planAr: "العائلة", planEn: "Family" },
  trip: { planAr: "العائلة", planEn: "Family" },
  society: { planAr: "العائلة", planEn: "Family" },
  groups: { planAr: "العائلة", planEn: "Family" },
  reports: { planAr: "العائلة", planEn: "Family" },
  documents: { planAr: "الاحتراف", planEn: "Professional" },
  draws: { planAr: "الاحتراف", planEn: "Professional" },
  smart_accountant: { planAr: "الاحتراف", planEn: "Professional" },
  exports: { planAr: "العائلة", planEn: "Family" },
  statements: { planAr: "العائلة", planEn: "Family" },
};

export function upgradeNoticeFor(locale: "ar" | "en", featureLabel: string, targetKey: string) {
  const target = NAV_UPGRADE_TARGETS[targetKey] ?? { planAr: "باقة أعلى", planEn: "a higher plan" };
  if (locale === "ar") {
    return {
      title: "ترقية مطلوبة",
      text: `لاستخدام «${featureLabel}» رقِّ الباقة إلى ${target.planAr} أو أعلى. باقتك الحالية لا تشمل هذا الخيار.`,
    };
  }
  return {
    title: "Upgrade required",
    text: `To use ${featureLabel}, upgrade to the ${target.planEn} plan or higher. Your current plan does not include this option.`,
  };
}
export function dashboardNavLocked(features: string[], existingTypes: Iterable<string>, viewId: string) {
  if (viewId === "reports") return !(planHasFeature(features, "advanced_reports") || planHasFeature(features, "exports"));
  if (viewId === "household") return !sidebarAllowsWalletView(features, existingTypes, "household");
  if (viewId === "trip") return !sidebarAllowsWalletView(features, existingTypes, "trip");
  if (viewId === "society" || viewId === "groups") return !sidebarAllowsWalletView(features, existingTypes, "society");
  return false;
}

export function featuresInGroup(groupId: string) {
  return PLAN_FEATURE_CATALOG.filter((item) => item.group === groupId);
}

export function quotaIsUnlimited(limit: number) {
  const value = Number(limit);
  return !Number.isFinite(value) || value <= 0 || value >= 9999;
}

export function quotaWouldExceed(used: number, extra: number, limit: number) {
  if (quotaIsUnlimited(limit)) return false;
  return Number(used) + Number(extra) > Number(limit);
}

export function formatQuota(limit: number, locale: "ar" | "en") {
  if (quotaIsUnlimited(limit)) return locale === "ar" ? "غير محدود" : "Unlimited";
  return String(Number(limit) || 0);
}

function resolveCappedLimit(planValue: number, override: number | null | undefined, fallback: number) {
  if (Number(override ?? 0) > 0) return Number(override);
  return Number(planValue) || fallback;
}

function resolveOpenLimit(planValue: number, override: number | null | undefined, fallback: number) {
  if (override != null && Number(override) > 0) return Number(override);
  const value = Number(planValue);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return value;
}

export function resolveEntitlements(input: {
  planFeatures: string[];
  grant?: string[];
  deny?: string[];
  walletLimit: number;
  memberLimit: number;
  transactionLimit?: number;
  recordLimit?: number;
  userLimit?: number;
  walletLimitOverride?: number | null;
  memberLimitOverride?: number | null;
  transactionLimitOverride?: number | null;
  recordLimitOverride?: number | null;
  userLimitOverride?: number | null;
  status?: string;
}) {
  const granted = new Set([...input.planFeatures, ...(input.grant ?? [])]);
  for (const key of input.deny ?? []) granted.delete(key);
  const features = [...granted];
  return {
    features,
    walletLimit: resolveCappedLimit(input.walletLimit, input.walletLimitOverride, 1),
    memberLimit: resolveCappedLimit(input.memberLimit, input.memberLimitOverride, 2),
    transactionLimit: resolveOpenLimit(input.transactionLimit ?? 0, input.transactionLimitOverride, 0),
    recordLimit: resolveOpenLimit(input.recordLimit ?? 0, input.recordLimitOverride, 0),
    userLimit: resolveOpenLimit(input.userLimit ?? 1, input.userLimitOverride, 1),
    status: input.status ?? "none",
  };
}
