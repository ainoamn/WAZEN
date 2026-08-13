/** Branded printable financial reports for Wazen wallets / associations. */

export type ReportLocale = "ar" | "en";

export type ReportTypeId =
  | "association"
  | "member"
  | "expenses"
  | "income"
  | "general"
  | "statistics"
  | "discipline"
  | "commitment"
  | "delay"
  | "evaluation"
  | "subscriptions"
  | "renewals"
  | "arrears"
  | "discounts"
  | "benefits"
  | "obligations";

export type ReportSpace = {
  id: string;
  name_ar: string;
  name_en: string;
  type: string;
  currency: string;
  balance_minor: number;
  goal_minor: number;
};

export type ReportMember = {
  id: string;
  space_id: string;
  display_name: string;
  email: string | null;
  role: string;
  due_minor: number;
  paid_minor: number;
  extra_minor: number;
};

export type ReportTransaction = {
  id: string;
  space_id: string;
  member_id: string | null;
  kind: string;
  allocation: string;
  amount_minor: number;
  description_ar: string;
  description_en: string;
  occurred_at: string;
};

export type ReportPlan = {
  space_id?: string;
  amount_minor?: number;
  duration_months?: number;
  extra_policy?: string;
};

export type ReportInput = {
  locale: ReportLocale;
  reportType: ReportTypeId;
  logoUrl: string;
  issuedAt?: string;
  issuerName?: string;
  space?: ReportSpace | null;
  member?: ReportMember | null;
  spaces: ReportSpace[];
  members: ReportMember[];
  transactions: ReportTransaction[];
  plans?: ReportPlan[];
};

export type ReportCatalogItem = {
  id: ReportTypeId;
  titleAr: string;
  titleEn: string;
  blurbAr: string;
  blurbEn: string;
  needsMember?: boolean;
  groupOnly?: boolean;
};

export const REPORT_CATALOG: ReportCatalogItem[] = [
  { id: "association", titleAr: "تقرير الجمعية / المحفظة", titleEn: "Association / wallet report", blurbAr: "ملخص الصندوق والأعضاء والمستحقات.", blurbEn: "Fund summary, members and dues.", groupOnly: true },
  { id: "member", titleAr: "تقرير العميل / العضو", titleEn: "Client / member report", blurbAr: "كشف حساب فردي: مدفوع، عليه، له.", blurbEn: "Individual ledger: paid, owes, credit.", needsMember: true },
  { id: "expenses", titleAr: "تقرير المصاريف", titleEn: "Expenses report", blurbAr: "كل المصروفات والتعويضات.", blurbEn: "All expenses and reimbursements." },
  { id: "income", titleAr: "تقرير الدخل", titleEn: "Income report", blurbAr: "المساهمات والدخل المسجّل.", blurbEn: "Contributions and recorded income." },
  { id: "general", titleAr: "تقرير عام", titleEn: "General report", blurbAr: "نظرة شاملة على الرصيد والحركة.", blurbEn: "Overall balance and activity." },
  { id: "statistics", titleAr: "تقرير إحصائيات", titleEn: "Statistics report", blurbAr: "معدلات التحصيل والصرف والأعضاء.", blurbEn: "Collection, spend and member rates." },
  { id: "discipline", titleAr: "تقرير الانضباط", titleEn: "Discipline report", blurbAr: "التزام السداد مقابل المستحق.", blurbEn: "Payment discipline vs dues." },
  { id: "commitment", titleAr: "تقرير الالتزام", titleEn: "Commitment report", blurbAr: "نسب إنجاز خطط المساهمة.", blurbEn: "Contribution plan completion." },
  { id: "delay", titleAr: "تقرير التأخير", titleEn: "Delay / arrears timing", blurbAr: "الأعضاء المتأخرون عن السداد.", blurbEn: "Members behind on payments." },
  { id: "evaluation", titleAr: "تقييم عام للعميل", titleEn: "Client evaluation", blurbAr: "درجة تقييم من السداد والفائض.", blurbEn: "Score from payments and reserves.", needsMember: true },
  { id: "subscriptions", titleAr: "تقرير الاشتراكات", titleEn: "Subscriptions report", blurbAr: "خطط المساهمة ومددها.", blurbEn: "Contribution plans and durations.", groupOnly: true },
  { id: "renewals", titleAr: "تقرير التجديد", titleEn: "Renewals report", blurbAr: "حالة التجديد حسب مدة الخطة.", blurbEn: "Renewal status by plan length.", groupOnly: true },
  { id: "arrears", titleAr: "تقرير المتأخرات", titleEn: "Arrears report", blurbAr: "المبالغ المتبقية على الأعضاء.", blurbEn: "Outstanding amounts by member." },
  { id: "discounts", titleAr: "تقرير التخفيضات", titleEn: "Discounts report", blurbAr: "التخفيضات المسجّلة (إن وُجدت).", blurbEn: "Recorded discounts if any." },
  { id: "benefits", titleAr: "تقرير الفوائد", titleEn: "Benefits / interest", blurbAr: "الفوائض والمقدّمات لصالح الأعضاء.", blurbEn: "Surplus and advances owed to members." },
  { id: "obligations", titleAr: "تقرير الالتزامات", titleEn: "Obligations report", blurbAr: "ما عليه وما له لكل عضو.", blurbEn: "What each member owes or is owed." },
];

function t(locale: ReportLocale, ar: string, en: string) {
  return locale === "ar" ? ar : en;
}

function spaceName(space: ReportSpace, locale: ReportLocale) {
  return locale === "ar" ? space.name_ar : space.name_en;
}

function txnName(txn: ReportTransaction, locale: ReportLocale) {
  return locale === "ar" ? txn.description_ar : txn.description_en;
}

function money(minor: number, currency: string, locale: ReportLocale) {
  const scale = ["OMR", "BHD", "IQD", "JOD", "KWD", "LYD", "TND"].includes(currency.toUpperCase()) ? 3 : 2;
  return new Intl.NumberFormat(locale === "ar" ? "ar-OM" : "en-OM", {
    style: "currency",
    currency: currency || "OMR",
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  }).format((minor || 0) / 10 ** scale);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pct(part: number, whole: number) {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function catalogItem(id: ReportTypeId) {
  return REPORT_CATALOG.find((item) => item.id === id) ?? REPORT_CATALOG[0];
}

function filterScope(input: ReportInput) {
  const spaceId = input.space?.id;
  const memberId = input.member?.id;
  const spaces = spaceId ? input.spaces.filter((space) => space.id === spaceId) : input.spaces;
  const members = input.members.filter((member) => {
    if (spaceId && member.space_id !== spaceId) return false;
    if (memberId && member.id !== memberId) return false;
    return true;
  });
  const transactions = input.transactions.filter((txn) => {
    if (spaceId && txn.space_id !== spaceId) return false;
    if (memberId && txn.member_id !== memberId) return false;
    return true;
  });
  const plans = (input.plans ?? []).filter((plan) => !spaceId || String(plan.space_id ?? "") === spaceId);
  return { spaces, members, transactions, plans };
}

function memberMetrics(member: ReportMember) {
  const remaining = Math.max(0, member.due_minor - member.paid_minor);
  const advance = Math.max(0, member.paid_minor - member.due_minor);
  const credit = advance + Math.max(0, member.extra_minor);
  const rate = pct(Math.min(member.paid_minor, member.due_minor), Math.max(member.due_minor, 1));
  let grade = "C";
  if (rate >= 95 && remaining === 0) grade = "A";
  else if (rate >= 75) grade = "B";
  else if (rate >= 50) grade = "C";
  else grade = "D";
  return { remaining, advance, credit, rate, grade };
}

type Section = { title: string; rows: string[][]; footer?: string };

function buildSections(input: ReportInput): { subtitle: string; kpis: { label: string; value: string }[]; sections: Section[] } {
  const locale = input.locale;
  const { spaces, members, transactions, plans } = filterScope(input);
  const currency = input.space?.currency ?? spaces[0]?.currency ?? "OMR";
  const incomeTx = transactions.filter((row) => ["income", "contribution"].includes(row.kind));
  const expenseTx = transactions.filter((row) => ["expense", "reimbursement"].includes(row.kind));
  const incomeTotal = incomeTx.reduce((sum, row) => sum + row.amount_minor, 0);
  const expenseTotal = expenseTx.reduce((sum, row) => sum + row.amount_minor, 0);
  const balanceTotal = spaces.reduce((sum, space) => sum + space.balance_minor, 0);
  const dueTotal = members.reduce((sum, member) => sum + member.due_minor, 0);
  const paidTotal = members.reduce((sum, member) => sum + Math.min(member.paid_minor, member.due_minor), 0);
  const arrearsTotal = members.reduce((sum, member) => sum + Math.max(0, member.due_minor - member.paid_minor), 0);
  const reserveTotal = members.reduce((sum, member) => sum + member.extra_minor, 0);
  const advanceTotal = members.reduce((sum, member) => sum + Math.max(0, member.paid_minor - member.due_minor), 0);
  const collectionRate = pct(paidTotal, dueTotal);

  const txnRows = (rows: ReportTransaction[]) =>
    rows.map((row) => [
      new Date(row.occurred_at).toLocaleDateString(locale === "ar" ? "ar-OM" : "en-GB"),
      txnName(row, locale),
      row.kind,
      money(row.amount_minor, currency, locale),
    ]);

  const memberRows = members.map((member) => {
    const m = memberMetrics(member);
    return [
      member.display_name,
      money(member.paid_minor, currency, locale),
      money(m.remaining, currency, locale),
      money(m.credit, currency, locale),
      `${m.rate}%`,
      m.grade,
    ];
  });

  switch (input.reportType) {
    case "association":
      return {
        subtitle: t(locale, "تقرير خاص بالجمعية / المحفظة الجماعية", "Association / group wallet report"),
        kpis: [
          { label: t(locale, "رصيد الصندوق", "Fund balance"), value: money(balanceTotal, currency, locale) },
          { label: t(locale, "الأعضاء", "Members"), value: String(members.length) },
          { label: t(locale, "نسبة التحصيل", "Collection rate"), value: `${collectionRate}%` },
          { label: t(locale, "المتأخرات", "Arrears"), value: money(arrearsTotal, currency, locale) },
        ],
        sections: [
          {
            title: t(locale, "أعضاء الجمعية", "Association members"),
            rows: [[t(locale, "العضو", "Member"), t(locale, "مدفوع", "Paid"), t(locale, "عليه", "Owes"), t(locale, "له", "Credit"), t(locale, "الالتزام", "Commitment"), t(locale, "التقييم", "Grade")], ...memberRows],
          },
          {
            title: t(locale, "آخر الحركات", "Recent activity"),
            rows: [[t(locale, "التاريخ", "Date"), t(locale, "البيان", "Description"), t(locale, "النوع", "Type"), t(locale, "المبلغ", "Amount")], ...txnRows(transactions.slice(0, 40))],
          },
        ],
      };
    case "member": {
      const member = input.member ?? members[0];
      const m = member ? memberMetrics(member) : { remaining: 0, advance: 0, credit: 0, rate: 0, grade: "—" };
      return {
        subtitle: t(locale, `تقرير خاص بالعميل: ${member?.display_name ?? "—"}`, `Client report: ${member?.display_name ?? "—"}`),
        kpis: [
          { label: t(locale, "مدفوع", "Paid"), value: money(member?.paid_minor ?? 0, currency, locale) },
          { label: t(locale, "عليه", "Owes"), value: money(m.remaining, currency, locale) },
          { label: t(locale, "له", "Credit"), value: money(m.credit, currency, locale) },
          { label: t(locale, "التقييم", "Grade"), value: m.grade },
        ],
        sections: [
          {
            title: t(locale, "حركات العضو", "Member transactions"),
            rows: [[t(locale, "التاريخ", "Date"), t(locale, "البيان", "Description"), t(locale, "النوع", "Type"), t(locale, "المبلغ", "Amount")], ...txnRows(transactions)],
          },
        ],
      };
    }
    case "expenses":
      return {
        subtitle: t(locale, "تقرير المصاريف", "Expenses report"),
        kpis: [
          { label: t(locale, "إجمالي المصروف", "Total expenses"), value: money(expenseTotal, currency, locale) },
          { label: t(locale, "عدد العمليات", "Entries"), value: String(expenseTx.length) },
        ],
        sections: [{
          title: t(locale, "تفاصيل المصاريف", "Expense details"),
          rows: [[t(locale, "التاريخ", "Date"), t(locale, "البيان", "Description"), t(locale, "النوع", "Type"), t(locale, "المبلغ", "Amount")], ...txnRows(expenseTx)],
          footer: t(locale, `الإجمالي: ${money(expenseTotal, currency, locale)}`, `Total: ${money(expenseTotal, currency, locale)}`),
        }],
      };
    case "income":
      return {
        subtitle: t(locale, "تقرير الدخل", "Income report"),
        kpis: [
          { label: t(locale, "إجمالي الدخل", "Total income"), value: money(incomeTotal, currency, locale) },
          { label: t(locale, "عدد العمليات", "Entries"), value: String(incomeTx.length) },
        ],
        sections: [{
          title: t(locale, "تفاصيل الدخل والمساهمات", "Income & contributions"),
          rows: [[t(locale, "التاريخ", "Date"), t(locale, "البيان", "Description"), t(locale, "النوع", "Type"), t(locale, "المبلغ", "Amount")], ...txnRows(incomeTx)],
          footer: t(locale, `الإجمالي: ${money(incomeTotal, currency, locale)}`, `Total: ${money(incomeTotal, currency, locale)}`),
        }],
      };
    case "statistics":
      return {
        subtitle: t(locale, "تقرير إحصائيات", "Statistics report"),
        kpis: [
          { label: t(locale, "الدخل", "Income"), value: money(incomeTotal, currency, locale) },
          { label: t(locale, "المصروف", "Expense"), value: money(expenseTotal, currency, locale) },
          { label: t(locale, "صافي الحركة", "Net flow"), value: money(incomeTotal - expenseTotal, currency, locale) },
          { label: t(locale, "تحصيل", "Collection"), value: `${collectionRate}%` },
        ],
        sections: [
          {
            title: t(locale, "مؤشرات الأعضاء", "Member indicators"),
            rows: [
              [t(locale, "المؤشر", "Metric"), t(locale, "القيمة", "Value")],
              [t(locale, "عدد الأعضاء", "Members"), String(members.length)],
              [t(locale, "المستحق الكلي", "Total due"), money(dueTotal, currency, locale)],
              [t(locale, "المدفوع نحو المستحق", "Paid toward due"), money(paidTotal, currency, locale)],
              [t(locale, "المتأخرات", "Arrears"), money(arrearsTotal, currency, locale)],
              [t(locale, "الفوائض الشخصية", "Personal reserves"), money(reserveTotal, currency, locale)],
              [t(locale, "المقدمات", "Advances"), money(advanceTotal, currency, locale)],
            ],
          },
        ],
      };
    case "discipline":
    case "commitment":
    case "evaluation":
      return {
        subtitle: catalogItem(input.reportType)[locale === "ar" ? "titleAr" : "titleEn"],
        kpis: [
          { label: t(locale, "متوسط الالتزام", "Avg commitment"), value: `${collectionRate}%` },
          { label: t(locale, "منتظمون (≥95%)", "On track (≥95%)"), value: String(members.filter((m) => memberMetrics(m).rate >= 95).length) },
          { label: t(locale, "متأخرون", "Behind"), value: String(members.filter((m) => memberMetrics(m).remaining > 0).length) },
        ],
        sections: [{
          title: t(locale, "تقييم الأعضاء", "Member evaluation"),
          rows: [[t(locale, "العضو", "Member"), t(locale, "مدفوع", "Paid"), t(locale, "عليه", "Owes"), t(locale, "له", "Credit"), t(locale, "الالتزام %", "Commitment %"), t(locale, "الدرجة", "Grade")], ...memberRows],
        }],
      };
    case "delay":
    case "arrears": {
      const delayed = members
        .map((member) => ({ member, ...memberMetrics(member) }))
        .filter((row) => row.remaining > 0)
        .sort((a, b) => b.remaining - a.remaining);
      return {
        subtitle: t(locale, "تقرير التأخير / المتأخرات", "Delay / arrears report"),
        kpis: [
          { label: t(locale, "عدد المتأخرين", "Late members"), value: String(delayed.length) },
          { label: t(locale, "إجمالي المتأخرات", "Total arrears"), value: money(arrearsTotal, currency, locale) },
        ],
        sections: [{
          title: t(locale, "قائمة المتأخرات", "Arrears list"),
          rows: [
            [t(locale, "العضو", "Member"), t(locale, "المستحق", "Due"), t(locale, "المدفوع", "Paid"), t(locale, "المتبقي عليه", "Outstanding"), t(locale, "نسبة السداد", "Paid %")],
            ...delayed.map((row) => [
              row.member.display_name,
              money(row.member.due_minor, currency, locale),
              money(row.member.paid_minor, currency, locale),
              money(row.remaining, currency, locale),
              `${row.rate}%`,
            ]),
          ],
        }],
      };
    }
    case "subscriptions":
    case "renewals":
      return {
        subtitle: catalogItem(input.reportType)[locale === "ar" ? "titleAr" : "titleEn"],
        kpis: [
          { label: t(locale, "عدد الخطط", "Plans"), value: String(plans.length || spaces.length) },
          { label: t(locale, "الأعضاء المشمولون", "Covered members"), value: String(members.length) },
        ],
        sections: [{
          title: t(locale, "خطط الاشتراك / التجديد", "Subscription / renewal plans"),
          rows: [
            [t(locale, "المحفظة", "Wallet"), t(locale, "القسط", "Installment"), t(locale, "المدة (شهر)", "Duration (mo)"), t(locale, "سياسة الزيادة", "Surplus policy")],
            ...(plans.length
              ? plans.map((plan) => {
                  const space = spaces.find((item) => item.id === plan.space_id) ?? input.space;
                  return [
                    space ? spaceName(space, locale) : "—",
                    money(Number(plan.amount_minor ?? 0), currency, locale),
                    String(plan.duration_months ?? "—"),
                    String(plan.extra_policy ?? "—"),
                  ];
                })
              : spaces.map((space) => [spaceName(space, locale), "—", "—", "—"])),
          ],
        }],
      };
    case "discounts":
      return {
        subtitle: t(locale, "تقرير التخفيضات", "Discounts report"),
        kpis: [{ label: t(locale, "تخفيضات مسجّلة", "Recorded discounts"), value: money(0, currency, locale) }],
        sections: [{
          title: t(locale, "التخفيضات", "Discounts"),
          rows: [
            [t(locale, "ملاحظة", "Note")],
            [t(locale, "لا توجد تخفيضات مسجّلة حالياً في النظام. ستظهر هنا عند تفعيلها.", "No discounts are recorded yet. They will appear here when enabled.")],
          ],
        }],
      };
    case "benefits":
      return {
        subtitle: t(locale, "تقرير الفوائد / المقدّمات", "Benefits / advances report"),
        kpis: [
          { label: t(locale, "فوائض شخصية", "Personal reserves"), value: money(reserveTotal, currency, locale) },
          { label: t(locale, "مقدمات", "Advances"), value: money(advanceTotal, currency, locale) },
        ],
        sections: [{
          title: t(locale, "ما له الأعضاء", "Member credits"),
          rows: [
            [t(locale, "العضو", "Member"), t(locale, "فائض شخصي", "Reserve"), t(locale, "مقدّم", "Advance"), t(locale, "له (الإجمالي)", "Total credit")],
            ...members.map((member) => {
              const m = memberMetrics(member);
              return [member.display_name, money(member.extra_minor, currency, locale), money(m.advance, currency, locale), money(m.credit, currency, locale)];
            }),
          ],
        }],
      };
    case "obligations":
      return {
        subtitle: t(locale, "تقرير الالتزامات (له / عليه)", "Obligations (owed / owes)"),
        kpis: [
          { label: t(locale, "إجمالي عليه", "Total owes"), value: money(arrearsTotal, currency, locale) },
          { label: t(locale, "إجمالي له", "Total credit"), value: money(reserveTotal + advanceTotal, currency, locale) },
        ],
        sections: [{
          title: t(locale, "التزامات الأعضاء", "Member obligations"),
          rows: [[t(locale, "العضو", "Member"), t(locale, "مدفوع", "Paid"), t(locale, "عليه", "Owes"), t(locale, "له", "Credit"), t(locale, "الالتزام %", "Commitment %"), t(locale, "التقييم", "Grade")], ...memberRows],
        }],
      };
    case "general":
    default:
      return {
        subtitle: t(locale, "تقرير عام", "General report"),
        kpis: [
          { label: t(locale, "الرصيد", "Balance"), value: money(balanceTotal, currency, locale) },
          { label: t(locale, "الدخل", "Income"), value: money(incomeTotal, currency, locale) },
          { label: t(locale, "المصروف", "Expense"), value: money(expenseTotal, currency, locale) },
          { label: t(locale, "الأعضاء", "Members"), value: String(members.length) },
        ],
        sections: [
          {
            title: t(locale, "المحافظ المشمولة", "Included wallets"),
            rows: [
              [t(locale, "المحفظة", "Wallet"), t(locale, "النوع", "Type"), t(locale, "الرصيد", "Balance")],
              ...spaces.map((space) => [spaceName(space, locale), space.type, money(space.balance_minor, space.currency, locale)]),
            ],
          },
          {
            title: t(locale, "ملخص الأعضاء", "Members summary"),
            rows: [[t(locale, "العضو", "Member"), t(locale, "مدفوع", "Paid"), t(locale, "عليه", "Owes"), t(locale, "له", "Credit"), t(locale, "الالتزام %", "Commitment %"), t(locale, "التقييم", "Grade")], ...memberRows],
          },
          {
            title: t(locale, "الحركات", "Transactions"),
            rows: [[t(locale, "التاريخ", "Date"), t(locale, "البيان", "Description"), t(locale, "النوع", "Type"), t(locale, "المبلغ", "Amount")], ...txnRows(transactions.slice(0, 50))],
          },
        ],
      };
  }
}

/** Build a printable HTML report with Wazen logo + wallet/association header. */
export function buildReportHtml(input: ReportInput) {
  const locale = input.locale;
  const dir = locale === "ar" ? "rtl" : "ltr";
  const meta = catalogItem(input.reportType);
  const title = locale === "ar" ? meta.titleAr : meta.titleEn;
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const entityName = input.space
    ? spaceName(input.space, locale)
    : t(locale, "كل المحافظ", "All wallets");
  const memberLine = input.member
    ? t(locale, `مرتبط بالعضو: ${input.member.display_name}`, `Linked member: ${input.member.display_name}`)
    : "";
  const built = buildSections(input);

  const kpiHtml = built.kpis
    .map((kpi) => `<div class="kpi"><span>${escapeHtml(kpi.label)}</span><strong>${escapeHtml(kpi.value)}</strong></div>`)
    .join("");

  const sectionsHtml = built.sections
    .map((section) => {
      if (!section.rows.length) {
        return `<section><h2>${escapeHtml(section.title)}</h2><p class="empty">${escapeHtml(t(locale, "لا توجد بيانات لهذا القسم.", "No data for this section."))}</p></section>`;
      }
      const [head, ...body] = section.rows;
      const thead = `<tr>${head.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr>`;
      const tbody = body.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
      return `<section><h2>${escapeHtml(section.title)}</h2><table><thead>${thead}</thead><tbody>${tbody || `<tr><td colspan="${head.length}">${escapeHtml(t(locale, "لا توجد صفوف.", "No rows."))}</td></tr>`}</tbody></table>${section.footer ? `<p class="footer-note">${escapeHtml(section.footer)}</p>` : ""}</section>`;
    })
    .join("");

  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} · ${escapeHtml(entityName)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", Tahoma, Arial, sans-serif; color: #14221f; background: #f4f7f5; }
    .sheet { max-width: 920px; margin: 24px auto; background: white; border: 1px solid #d7e0db; border-radius: 18px; overflow: hidden; box-shadow: 0 12px 30px rgba(20,40,34,.08); }
    .brand-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 28px; background: linear-gradient(120deg,#143a36,#0b7562); color: white; }
    .brand-bar img { height: 42px; width: auto; background: rgba(255,255,255,.92); border-radius: 8px; padding: 4px 8px; }
    .brand-bar small { display: block; opacity: .8; font-size: 11px; letter-spacing: .04em; }
    .brand-bar strong { font-size: 15px; }
    .head { padding: 28px 28px 8px; }
    .head h1 { margin: 0 0 6px; font-size: 26px; color: #0d7a65; }
    .head p { margin: 0; color: #66766f; font-size: 14px; }
    .meta { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px 18px; margin: 18px 28px; padding: 14px 16px; border: 1px solid #e5ebe7; border-radius: 14px; background: #fbfcfb; }
    .meta div { display: flex; flex-direction: column; gap: 4px; }
    .meta span { color: #809089; font-size: 12px; }
    .meta b { font-size: 14px; }
    .kpis { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 12px; padding: 0 28px 18px; }
    .kpi { border: 1px solid #e5ebe7; border-radius: 14px; padding: 12px 14px; background: #f8faf9; }
    .kpi span { display: block; color: #809089; font-size: 12px; margin-bottom: 6px; }
    .kpi strong { font-size: 16px; }
    section { padding: 8px 28px 22px; }
    section h2 { margin: 0 0 10px; font-size: 16px; color: #244c56; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 10px 8px; border-bottom: 1px solid #e8eeea; text-align: start; vertical-align: top; }
    th { color: #66766f; font-size: 12px; font-weight: 700; background: #f3f7f5; }
    .footer-note { margin: 10px 0 0; font-weight: 700; color: #0d7a65; }
    .empty { color: #809089; }
    footer { padding: 18px 28px 28px; color: #809089; font-size: 12px; border-top: 1px solid #eef2f0; }
    @media print {
      body { background: white; }
      .sheet { margin: 0; border: 0; border-radius: 0; box-shadow: none; max-width: none; }
      .brand-bar { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
    @media (max-width: 760px) {
      .kpis, .meta { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
  <article class="sheet">
    <div class="brand-bar">
      <img src="${escapeHtml(input.logoUrl)}" alt="WAZEN" />
      <div>
        <small>WAZEN · وازن</small>
        <strong>${escapeHtml(entityName)}</strong>
      </div>
    </div>
    <div class="head">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(built.subtitle)}</p>
    </div>
    <div class="meta">
      <div><span>${escapeHtml(t(locale, "الجهة / المحفظة", "Entity / wallet"))}</span><b>${escapeHtml(entityName)}</b></div>
      <div><span>${escapeHtml(t(locale, "تاريخ الإصدار", "Issued at"))}</span><b>${escapeHtml(new Date(issuedAt).toLocaleString(locale === "ar" ? "ar-OM" : "en-GB"))}</b></div>
      <div><span>${escapeHtml(t(locale, "أُصدر بواسطة", "Issued by"))}</span><b>${escapeHtml(input.issuerName ?? "WAZEN")}</b></div>
      <div><span>${escapeHtml(t(locale, "الارتباط", "Scope"))}</span><b>${escapeHtml(memberLine || t(locale, "مستوى الجمعية / المحفظة", "Association / wallet level"))}</b></div>
    </div>
    <div class="kpis">${kpiHtml}</div>
    ${sectionsHtml}
    <footer>${escapeHtml(t(locale, "مستند مُولَّد من منصة وازن — للاستخدام الإداري داخل الجمعية أو المحفظة.", "Generated by Wazen — for internal association/wallet administration."))}</footer>
  </article>
  <script>window.addEventListener("load",()=>{ try { window.focus(); } catch (_) {} });</script>
</body>
</html>`;
}

export function openReportPreview(html: string, autoPrint = false) {
  const popup = window.open("", "_blank", "noopener,noreferrer,width=960,height=900");
  if (!popup) return false;
  popup.document.write(html);
  popup.document.close();
  if (autoPrint) {
    popup.addEventListener("load", () => {
      try { popup.focus(); popup.print(); } catch { /* ignore */ }
    });
    // Fallback if load already fired
    setTimeout(() => {
      try { popup.focus(); popup.print(); } catch { /* ignore */ }
    }, 400);
  }
  return true;
}

export function downloadReportHtml(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".html") ? filename : `${filename}.html`;
  link.click();
  URL.revokeObjectURL(url);
}
