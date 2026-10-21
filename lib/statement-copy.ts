/** Customizable society statement intros / WhatsApp attach lines (per space). */

export type AssociationSheetCopyKind = "movements" | "dues" | "dues_paid" | "dues_owing";

export type StatementCopyLocale = {
  introDues: string;
  introDuesPaid: string;
  introDuesOwing: string;
  introMovements: string;
  whatsappDues: string;
  whatsappDuesPaid: string;
  whatsappDuesOwing: string;
  whatsappMovements: string;
};

export type SpaceStatementCopy = {
  ar?: Partial<StatementCopyLocale>;
  en?: Partial<StatementCopyLocale>;
};

const KEYS: Array<keyof StatementCopyLocale> = [
  "introDues",
  "introDuesPaid",
  "introDuesOwing",
  "introMovements",
  "whatsappDues",
  "whatsappDuesPaid",
  "whatsappDuesOwing",
  "whatsappMovements",
];

export const STATEMENT_COPY_MAX_LEN = 500;

export function defaultStatementCopy(locale: "ar" | "en"): StatementCopyLocale {
  if (locale === "ar") {
    return {
      introDues: "بيان ودّي لمتابعة مستحقات «{{spaceName}}» حتى نهاية الشهر الحالي: الاسم، ما دُفع، وما تبقّى.",
      introDuesPaid: "إليكم أسماء الأعضاء الذين سدّدوا مساهماتهم في «{{spaceName}}» — شكراً لالتزامهم.",
      introDuesOwing: "إليكم من لا تزال عليهم مبالغ مستحقة في «{{spaceName}}» حتى نهاية الشهر الحالي — للمتابعة بلطف ووضوح.",
      introMovements: "إليكم بيان حركات حساب «{{spaceName}}» — للشفافية والمتابعة بكل وضوح.",
      whatsappDues: "نرفق لكم كشف المبالغ المتأخرة على الأعضاء حتى نهاية الشهر الحالي، للاطلاع على التفاصيل.",
      whatsappDuesPaid: "نرفق لكم كشف المسدّدين (من دفعوا مبالغاً) للاطلاع على التفاصيل.",
      whatsappDuesOwing: "نرفق لكم كشف الأعضاء المترتبة عليهم مبالغ فقط، للاطلاع على التفاصيل.",
      whatsappMovements: "نرفق لكم كشف حساب كامل وعام للجمعية، للاطلاع على التفاصيل.",
    };
  }
  return {
    introDues: "A clear dues overview for “{{spaceName}}” through the current month: name, paid, and remaining.",
    introDuesPaid: "Members of “{{spaceName}}” who have paid their contributions — thank you for staying current.",
    introDuesOwing: "Members of “{{spaceName}}” with amounts still due through the current month — for clear, courteous follow-up.",
    introMovements: "Here is the account activity for “{{spaceName}}” — clear and ready for review.",
    whatsappDues: "Please find the member arrears statement through the end of the current month.",
    whatsappDuesPaid: "Please find the payers-only statement (members who have paid).",
    whatsappDuesOwing: "Please find the statement of members who still owe amounts.",
    whatsappMovements: "Please find the full general association account statement.",
  };
}

export function applyStatementCopyVars(template: string, vars: { spaceName: string }) {
  return String(template ?? "")
    .replaceAll("{{spaceName}}", vars.spaceName)
    .replaceAll("{{اسم_الجمعية}}", vars.spaceName)
    .trim();
}

function cleanField(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.slice(0, STATEMENT_COPY_MAX_LEN);
}

export function parseSpaceStatementCopy(raw: unknown): SpaceStatementCopy {
  let source: unknown = raw;
  if (typeof raw === "string") {
    try { source = JSON.parse(raw); } catch { return {}; }
  }
  if (!source || typeof source !== "object") return {};
  const obj = source as Record<string, unknown>;
  const out: SpaceStatementCopy = {};
  for (const locale of ["ar", "en"] as const) {
    const block = obj[locale];
    if (!block || typeof block !== "object") continue;
    const partial: Partial<StatementCopyLocale> = {};
    for (const key of KEYS) {
      const cleaned = cleanField((block as Record<string, unknown>)[key]);
      if (cleaned) partial[key] = cleaned;
    }
    if (Object.keys(partial).length) out[locale] = partial;
  }
  return out;
}

export function serializeSpaceStatementCopy(copy: SpaceStatementCopy) {
  const normalized = parseSpaceStatementCopy(copy);
  return JSON.stringify(normalized);
}

/** Merge saved overrides onto defaults for the editor. */
export function effectiveStatementCopy(
  saved: SpaceStatementCopy | null | undefined,
  locale: "ar" | "en",
): StatementCopyLocale {
  const defaults = defaultStatementCopy(locale);
  const override = saved?.[locale] ?? {};
  return {
    introDues: override.introDues?.trim() || defaults.introDues,
    introDuesPaid: override.introDuesPaid?.trim() || defaults.introDuesPaid,
    introDuesOwing: override.introDuesOwing?.trim() || defaults.introDuesOwing,
    introMovements: override.introMovements?.trim() || defaults.introMovements,
    whatsappDues: override.whatsappDues?.trim() || defaults.whatsappDues,
    whatsappDuesPaid: override.whatsappDuesPaid?.trim() || defaults.whatsappDuesPaid,
    whatsappDuesOwing: override.whatsappDuesOwing?.trim() || defaults.whatsappDuesOwing,
    whatsappMovements: override.whatsappMovements?.trim() || defaults.whatsappMovements,
  };
}

function introKey(kind: AssociationSheetCopyKind): keyof StatementCopyLocale {
  switch (kind) {
    case "dues": return "introDues";
    case "dues_paid": return "introDuesPaid";
    case "dues_owing": return "introDuesOwing";
    default: return "introMovements";
  }
}

function whatsappKey(kind: AssociationSheetCopyKind): keyof StatementCopyLocale {
  switch (kind) {
    case "dues": return "whatsappDues";
    case "dues_paid": return "whatsappDuesPaid";
    case "dues_owing": return "whatsappDuesOwing";
    default: return "whatsappMovements";
  }
}

export function resolveStatementIntro(
  saved: SpaceStatementCopy | null | undefined,
  locale: "ar" | "en",
  kind: AssociationSheetCopyKind,
  spaceName: string,
) {
  const text = effectiveStatementCopy(saved, locale)[introKey(kind)];
  return applyStatementCopyVars(text, { spaceName });
}

export function resolveWhatsAppAttach(
  saved: SpaceStatementCopy | null | undefined,
  locale: "ar" | "en",
  kind: AssociationSheetCopyKind,
  spaceName: string,
) {
  const text = effectiveStatementCopy(saved, locale)[whatsappKey(kind)];
  return applyStatementCopyVars(text, { spaceName });
}

export const STATEMENT_COPY_FIELD_META: Array<{
  key: keyof StatementCopyLocale;
  ar: string;
  en: string;
}> = [
  { key: "introDues", ar: "مقدمة كشف المتأخرات (طباعة / رابط)", en: "Arrears sheet intro (print / link)" },
  { key: "introDuesPaid", ar: "مقدمة كشف المسدّدين", en: "Payers sheet intro" },
  { key: "introDuesOwing", ar: "مقدمة كشف المترتبة عليهم مبالغ", en: "Owing sheet intro" },
  { key: "introMovements", ar: "مقدمة كشف الحركات", en: "Movements sheet intro" },
  { key: "whatsappDues", ar: "فقرة واتساب — متأخرات", en: "WhatsApp line — arrears" },
  { key: "whatsappDuesPaid", ar: "فقرة واتساب — مسدّدون", en: "WhatsApp line — payers" },
  { key: "whatsappDuesOwing", ar: "فقرة واتساب — مترتبة عليهم", en: "WhatsApp line — owing" },
  { key: "whatsappMovements", ar: "فقرة واتساب — كشف كامل", en: "WhatsApp line — full statement" },
];
