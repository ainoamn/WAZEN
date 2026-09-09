/** Named buckets for personal income and spend. Presets plus a free-text custom label. */

export type PersonalCategoryKind = "income" | "expense";

export type PersonalCategoryPreset = {
  id: string;
  ar: string;
  en: string;
  aliases: string[];
};

export const EXPENSE_CATEGORY_PRESETS: PersonalCategoryPreset[] = [
  { id: "home", ar: "مصاريف البيت", en: "Household", aliases: ["بيت", "منزل", "إيجار", "rent", "house", "home"] },
  { id: "cars", ar: "مصاريف السيارات", en: "Cars", aliases: ["سيارة", "سيارات", "بنزين", "car", "fuel", "petrol"] },
  { id: "electricity", ar: "مصاريف الكهرباء", en: "Electricity", aliases: ["كهرباء", "electric"] },
  { id: "water", ar: "مصاريف الماء", en: "Water", aliases: ["ماء", "مياه", "water"] },
  { id: "phone", ar: "هاتف واتصالات", en: "Phone", aliases: ["هاتف", "جوال", "اتصالات", "phone", "mobile"] },
  { id: "school", ar: "تعليم ومدرسة", en: "School", aliases: ["مدرسة", "تعليم", "school", "tuition"] },
  { id: "food", ar: "طعام ومعيشة", en: "Food", aliases: ["طعام", "أكل", "بقالة", "food", "grocery"] },
  { id: "health", ar: "صحة", en: "Health", aliases: ["صحة", "طبيب", "health", "clinic"] },
  { id: "installments", ar: "أقساط وتمويل", en: "Installments", aliases: ["قسط", "تمويل", "loan", "installment"] },
  { id: "other_expense", ar: "مصروف آخر", en: "Other expense", aliases: ["أخرى", "other"] },
];

export const INCOME_CATEGORY_PRESETS: PersonalCategoryPreset[] = [
  { id: "salary", ar: "راتب شهري", en: "Monthly salary", aliases: ["راتب", "salary", "wage"] },
  { id: "business", ar: "دخل تجاري", en: "Business income", aliases: ["تجار", "عمل", "نشاط", "business", "trade"] },
  { id: "other_income", ar: "دخل آخر", en: "Other income", aliases: ["مكافأة", "هدية", "أخرى", "bonus", "other"] },
];

export function presetsForKind(kind: PersonalCategoryKind) {
  return kind === "income" ? INCOME_CATEGORY_PRESETS : EXPENSE_CATEGORY_PRESETS;
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function inferPersonalCategory(kind: PersonalCategoryKind, name: string) {
  const hay = normalizeToken(name);
  if (!hay) return kind === "income" ? "salary" : "other_expense";
  for (const preset of presetsForKind(kind)) {
    if (preset.aliases.some((alias) => hay.includes(normalizeToken(alias)))) return preset.id;
  }
  return kind === "income" ? "other_income" : "other_expense";
}

export function normalizePersonalCategory(kind: PersonalCategoryKind, raw: string | null | undefined, name = "") {
  const value = String(raw ?? "").trim().slice(0, 40);
  if (!value) return inferPersonalCategory(kind, name);
  const token = normalizeToken(value);
  const match = presetsForKind(kind).find((preset) => preset.id === token || normalizeToken(preset.ar) === token || normalizeToken(preset.en) === token);
  return match?.id ?? value;
}

export function personalCategoryLabel(kind: PersonalCategoryKind, category: string | null | undefined, locale: "ar" | "en", name = "") {
  const id = normalizePersonalCategory(kind, category, name);
  const preset = presetsForKind(kind).find((item) => item.id === id);
  if (preset) return locale === "ar" ? preset.ar : preset.en;
  return id;
}
