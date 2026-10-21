/** Customizable society statement intros / WhatsApp messages (per space). */

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

/** Long enough for full Gulf-style WhatsApp letters + print intros. */
export const STATEMENT_COPY_MAX_LEN = 2000;

export function defaultStatementCopy(locale: "ar" | "en"): StatementCopyLocale {
  if (locale === "ar") {
    return {
      introDues: [
        "كشف المستحقات المتأخرة عن السداد | {{spaceName}}",
        "",
        "حرصًا على انتظام الالتزامات المالية وتعزيزًا للتعاون بين أعضاء الجمعية، نضع بين أيديكم هذا الكشف المتضمن المبالغ المستحقة التي لم يتم سدادها حتى تاريخ إعداد الكشف، وفقًا للسجلات المالية للجمعية.",
        "",
        "نأمل من الأعضاء المعنيين التكرم بمراجعة البيانات واستكمال سداد المستحقات، مع خالص الشكر والتقدير للجميع على تعاونهم وحرصهم على مصلحة الجمعية.",
      ].join("\n"),
      introDuesPaid: [
        "كشف الأعضاء المسدّدين | {{spaceName}}",
        "",
        "تقديرًا لالتزام أعضاء الجمعية وحرصهم على الوفاء بمستحقاتهم، نعرض لكم كشف الأعضاء الذين تم تسجيل سداد التزاماتهم المالية، وفقًا للسجلات المعتمدة لدى الجمعية.",
        "",
        "نسأل الله أن يبارك في الجميع، وأن يديم بيننا أواصر المحبة والتعاون، وأن يوفقنا لما فيه خير الجمعية وأعضائها.",
      ].join("\n"),
      introDuesOwing: [
        "بيان الالتزامات المالية | {{spaceName}}",
        "",
        "انطلاقًا من حرصنا على وضوح التعاملات المالية ودقة السجلات، يتضمن هذا الكشف تفاصيل المبالغ المترتبة على الأعضاء وفقًا للبيانات المسجلة لدى الجمعية.",
        "",
        "نرجو من الجميع التكرم بمراجعة البيانات الواردة، ويسعدنا استقبال أي استفسار أو ملاحظة والعمل على التحقق منها، سعيًا إلى حفظ الحقوق وتعزيز الثقة والتعاون بين أعضاء الجمعية.",
      ].join("\n"),
      introMovements: [
        "سجل الحركات المالية | {{spaceName}}",
        "",
        "إيمانًا بأهمية الشفافية ودقة التوثيق المالي، يستعرض هذا الكشف الحركات المالية المسجلة لدى الجمعية خلال الفترة المحددة، بما يتيح للأعضاء الاطلاع على تفاصيل العمليات ومراجعتها بكل وضوح.",
        "",
        "نحرص دائمًا على أن تكون السجلات المالية واضحة ومحدّثة، بما يحفظ الحقوق ويعزز الثقة والتعاون بين أعضاء الجمعية. ولأي استفسار أو ملاحظة، يرجى التواصل مع إدارة الجمعية.",
      ].join("\n"),
      whatsappDues: [
        "السلام عليكم ورحمة الله وبركاته،",
        "",
        "الأهل والأعضاء الكرام في {{spaceName}}، أسعد الله أوقاتكم بكل خير.",
        "",
        "نرفق لكم كشف المستحقات المالية المتأخرة عن السداد، ونأمل من الإخوة المعنيين التكرم بالاطلاع عليه واستكمال ما عليهم من مستحقات، بما يسهم في انتظام أعمال الجمعية وتحقيق أهدافها.",
        "",
        "وإن كان لدى أي عضو استفسار أو ملاحظة، فإدارة الجمعية ترحب بتواصله.",
        "",
        "شاكرين لكم تعاونكم وحرصكم، ونسأل الله أن يديم بيننا المحبة والألفة، وأن يبارك في جهود الجميع.",
        "",
        "أخوّتكم وتقديرنا،",
        "إدارة {{spaceName}}",
      ].join("\n"),
      whatsappDuesPaid: [
        "السلام عليكم ورحمة الله وبركاته،",
        "",
        "الأهل والأعضاء الكرام في {{spaceName}}، أسعد الله أوقاتكم بكل خير.",
        "",
        "نشارككم كشف الأعضاء الذين تم تسجيل سداد التزاماتهم المالية لدى الجمعية، تقديرًا لالتزامهم وحرصهم على أداء ما عليهم.",
        "",
        "شكرًا لكم جميعًا على تعاونكم واهتمامكم، فبتكاتف الأهل وتعاونهم تستمر مسيرة الجمعية وتتحقق أهدافها.",
        "",
        "نسأل الله أن يبارك فيكم وفي أهليكم وأموالكم، وأن يديم علينا نعمة الألفة والتعاون.",
        "",
        "مع خالص المحبة والتقدير،",
        "إدارة {{spaceName}}",
      ].join("\n"),
      whatsappDuesOwing: [
        "السلام عليكم ورحمة الله وبركاته،",
        "",
        "الأهل والأعضاء الكرام في {{spaceName}}، حفظكم الله ورعاكم.",
        "",
        "نرفق لكم بيان الالتزامات المالية المسجلة لدى الجمعية، راجين من الجميع التكرم بالاطلاع على التفاصيل ومراجعة المبالغ الواردة فيه.",
        "",
        "وفي حال وجود أي استفسار أو اختلاف في البيانات، نرحب بتواصلكم مع إدارة الجمعية للتحقق والمراجعة، حرصًا على دقة السجلات وحفظ حقوق الجميع.",
        "",
        "شاكرين لكم حسن تعاونكم وتفهمكم، ونسأل الله أن يديم بيننا المحبة والثقة والتكاتف.",
        "",
        "مع خالص التقدير،",
        "إدارة {{spaceName}}",
      ].join("\n"),
      whatsappMovements: [
        "السلام عليكم ورحمة الله وبركاته،",
        "",
        "الأهل والأعضاء الكرام في {{spaceName}}، أسعد الله أوقاتكم بكل خير.",
        "",
        "نضع بين أيديكم الكشف المالي الشامل للجمعية، متضمنًا تفاصيل الحركات المالية والمدفوعات والالتزامات المسجلة، بما يتيح للجميع الاطلاع على البيانات ومراجعتها بكل وضوح وشفافية.",
        "",
        "نؤمن بأن وضوح الأمور المالية ودقة متابعتها أساسٌ لتعزيز الثقة وترسيخ التعاون بين أعضاء الجمعية، ونرحب بأي استفسار أو ملاحظة منكم.",
        "",
        "بارك الله في الجميع، وأدام بيننا صلة الرحم والمودة، ووفقنا جميعًا لما فيه خير الجمعية وأعضائها.",
        "",
        "مع خالص المحبة والتقدير،",
        "إدارة {{spaceName}}",
      ].join("\n"),
    };
  }
  return {
    introDues: [
      "Overdue dues statement | {{spaceName}}",
      "",
      "To support orderly financial commitments and cooperation among members, please find this statement of amounts still unpaid as of the statement date, according to the association’s financial records.",
      "",
      "We kindly ask concerned members to review the figures and complete any outstanding dues, with sincere thanks to everyone for their cooperation and care for the association.",
    ].join("\n"),
    introDuesPaid: [
      "Members who have paid | {{spaceName}}",
      "",
      "In appreciation of members who have fulfilled their dues, this statement lists those whose payments are recorded in the association’s approved records.",
      "",
      "May God bless everyone and preserve among us the bonds of goodwill and cooperation for the good of the association and its members.",
    ].join("\n"),
    introDuesOwing: [
      "Financial obligations statement | {{spaceName}}",
      "",
      "For clear financial dealings and accurate records, this statement details amounts owed by members according to the association’s registered data.",
      "",
      "Please review the figures; we welcome any enquiry or note and will verify it, seeking to protect rights and strengthen trust among members.",
    ].join("\n"),
    introMovements: [
      "Financial movements register | {{spaceName}}",
      "",
      "In the interest of transparency and accurate financial documentation, this statement presents recorded movements for the period, so members can review the activity clearly.",
      "",
      "We keep financial records clear and up to date to protect rights and strengthen trust. For any enquiry, please contact the association administration.",
    ].join("\n"),
    whatsappDues: [
      "Assalamu alaikum wa rahmatullahi wa barakatuh,",
      "",
      "Dear members of {{spaceName}}, may your time be filled with goodness.",
      "",
      "Please find the overdue dues statement. We kindly ask concerned brothers to review it and complete any outstanding amounts, supporting the association’s work and goals.",
      "",
      "If any member has a question or note, the administration welcomes their contact.",
      "",
      "Thank you for your cooperation. May God preserve love and harmony among us and bless everyone’s efforts.",
      "",
      "With brotherhood and appreciation,",
      "Administration of {{spaceName}}",
    ].join("\n"),
    whatsappDuesPaid: [
      "Assalamu alaikum wa rahmatullahi wa barakatuh,",
      "",
      "Dear members of {{spaceName}}, may your time be filled with goodness.",
      "",
      "We share the list of members whose dues payments are recorded, in appreciation of their commitment.",
      "",
      "Thank you all for your cooperation — through family solidarity the association’s journey continues.",
      "",
      "May God bless you, your families, and your wealth, and preserve harmony and cooperation among us.",
      "",
      "With sincere regards,",
      "Administration of {{spaceName}}",
    ].join("\n"),
    whatsappDuesOwing: [
      "Assalamu alaikum wa rahmatullahi wa barakatuh,",
      "",
      "Dear members of {{spaceName}}, may God protect and care for you.",
      "",
      "Please find the statement of financial obligations recorded with the association. Kindly review the details and amounts shown.",
      "",
      "If you have any enquiry or discrepancy, please contact the administration for verification, to keep records accurate and rights protected.",
      "",
      "Thank you for your understanding. May God preserve love, trust, and solidarity among us.",
      "",
      "With sincere appreciation,",
      "Administration of {{spaceName}}",
    ].join("\n"),
    whatsappMovements: [
      "Assalamu alaikum wa rahmatullahi wa barakatuh,",
      "",
      "Dear members of {{spaceName}}, may your time be filled with goodness.",
      "",
      "Please find the full financial statement of the association, including movements, payments, and recorded obligations, for clear and transparent review.",
      "",
      "We believe clear financial follow-up strengthens trust and cooperation, and we welcome any enquiry or note.",
      "",
      "May God bless everyone, preserve our bonds of kinship and affection, and guide us to what benefits the association and its members.",
      "",
      "With sincere regards,",
      "Administration of {{spaceName}}",
    ].join("\n"),
  };
}

export function applyStatementCopyVars(template: string, vars: { spaceName: string; statementUrl?: string }) {
  let text = String(template ?? "")
    .replaceAll("{{spaceName}}", vars.spaceName)
    .replaceAll("{{اسم_الجمعية}}", vars.spaceName);
  if (vars.statementUrl) {
    text = text
      .replaceAll("{{statementUrl}}", vars.statementUrl)
      .replaceAll("{{رابط_الكشف}}", vars.statementUrl);
  }
  return text.trim();
}

function cleanField(value: unknown) {
  const text = String(value ?? "").replace(/\r\n/g, "\n").trim();
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
  statementUrl?: string,
) {
  const text = effectiveStatementCopy(saved, locale)[whatsappKey(kind)];
  return applyStatementCopyVars(text, { spaceName, statementUrl });
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
  { key: "whatsappDues", ar: "رسالة واتساب كاملة — متأخرات", en: "Full WhatsApp message — arrears" },
  { key: "whatsappDuesPaid", ar: "رسالة واتساب كاملة — مسدّدون", en: "Full WhatsApp message — payers" },
  { key: "whatsappDuesOwing", ar: "رسالة واتساب كاملة — مترتبة عليهم", en: "Full WhatsApp message — owing" },
  { key: "whatsappMovements", ar: "رسالة واتساب كاملة — كشف شامل", en: "Full WhatsApp message — full statement" },
];
