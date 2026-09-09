/** Deterministic personal-wallet briefing: gaps, savings rate, and category tips. */

import { formatMoneyMinor } from "./money";
import { periodKeyFromDate } from "./installments";
import { normalizePersonalCategory, personalCategoryLabel } from "./personal-categories";

export type PersonalCoachTip = {
  id: string;
  severity: "info" | "warning" | "danger";
  ar: string;
  en: string;
};

export type PersonalCoachBriefing = {
  plannedInMinor: number;
  plannedOutMinor: number;
  plannedLeftMinor: number;
  postedInMinor: number;
  postedOutMinor: number;
  pendingInMinor: number;
  pendingOutMinor: number;
  savingsRate: number;
  topExpenseCategory: string | null;
  tips: PersonalCoachTip[];
};

type CoachRule = {
  kind?: string | null;
  status?: string | null;
  schedule?: string | null;
  amount_minor?: number | null;
  category?: string | null;
  name?: string | null;
};

type CoachOccurrence = {
  status?: string | null;
  rule_kind?: string | null;
  expected_minor?: number | null;
  actual_minor?: number | null;
  period_key?: string | null;
  due_at?: string | null;
  rule_category?: string | null;
  rule_name?: string | null;
};

function money(minor: number, locale: "ar" | "en") {
  return formatMoneyMinor(minor, "OMR", locale);
}

export function buildPersonalCoachBriefing(
  input: { rules: CoachRule[]; occurrences: CoachOccurrence[]; asOf?: Date },
): PersonalCoachBriefing {
  const asOf = input.asOf ?? new Date();
  const month = periodKeyFromDate(asOf.toISOString());
  const activeMonthly = input.rules.filter((rule) => (rule.status ?? "active") === "active" && (rule.schedule ?? "monthly") === "monthly");
  const plannedInMinor = activeMonthly.filter((rule) => rule.kind === "income").reduce((sum, rule) => sum + (Number(rule.amount_minor) || 0), 0);
  const plannedOutMinor = activeMonthly.filter((rule) => rule.kind !== "income").reduce((sum, rule) => sum + (Number(rule.amount_minor) || 0), 0);
  const monthRows = input.occurrences.filter((row) => String(row.period_key || row.due_at || "").slice(0, 7) === month);
  const postedInMinor = monthRows.filter((row) => row.rule_kind === "income" && row.status === "posted").reduce((sum, row) => sum + Number(row.actual_minor ?? row.expected_minor), 0);
  const postedOutMinor = monthRows.filter((row) => row.rule_kind !== "income" && row.status === "posted").reduce((sum, row) => sum + Number(row.actual_minor ?? row.expected_minor), 0);
  const pendingInMinor = monthRows.filter((row) => row.rule_kind === "income" && (row.status ?? "pending") === "pending").reduce((sum, row) => sum + Number(row.expected_minor), 0);
  const pendingOutMinor = monthRows.filter((row) => row.rule_kind !== "income" && (row.status ?? "pending") === "pending").reduce((sum, row) => sum + Number(row.expected_minor), 0);
  const plannedLeftMinor = plannedInMinor - plannedOutMinor;
  const savingsRate = plannedInMinor > 0 ? Math.round((plannedLeftMinor / plannedInMinor) * 100) : 0;

  const byCategory = new Map<string, number>();
  for (const rule of activeMonthly.filter((item) => item.kind !== "income")) {
    const id = normalizePersonalCategory("expense", rule.category, rule.name ?? "");
    byCategory.set(id, (byCategory.get(id) ?? 0) + (Number(rule.amount_minor) || 0));
  }
  const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  const topExpenseCategory = top?.[0] ?? null;
  const tips: PersonalCoachTip[] = [];

  if (plannedInMinor <= 0) {
    tips.push({
      id: "no-income",
      severity: "warning",
      ar: "لا يوجد دخل شهري ثابت بعد. أضف راتباً أو دخلاً تجارياً ليولّد النظام الاستحقاق تلقائياً، وأنت تعتمد أو تؤجّل أو تتجاهل فقط.",
      en: "No fixed monthly income yet. Add a salary or business income so Wazen generates the month; you only approve, defer, or skip.",
    });
  }
  if (plannedOutMinor > plannedInMinor && plannedInMinor > 0) {
    const gap = plannedOutMinor - plannedInMinor;
    tips.push({
      id: "gap",
      severity: "danger",
      ar: `الثغرة الشهرية ${money(gap, "ar")}: المصروف المبرمج أكبر من الدخل. قلّص أكبر بند أو زد الدخل قبل الاعتماد.`,
      en: `Monthly gap ${money(gap, "en")}: planned spend exceeds income. Cut the largest item or raise income before posting.`,
    });
  } else if (plannedLeftMinor > 0 && plannedInMinor > 0 && savingsRate < 10) {
    tips.push({
      id: "thin-save",
      severity: "warning",
      ar: `هامش التوفير ${savingsRate}% فقط. اهدف إلى 10–20% بتحويل الفائض إلى احتياطي بعد اعتماد الدخل.`,
      en: `Savings margin is only ${savingsRate}%. Aim for 10–20% by moving the surplus to a reserve after you approve income.`,
    });
  } else if (savingsRate >= 20) {
    tips.push({
      id: "healthy-save",
      severity: "info",
      ar: `هامش التوفير ${savingsRate}%. يمكن سداد قسط أسرع أو بناء احتياطي طوارئ بجزء من الفائض ${money(plannedLeftMinor, "ar")}.`,
      en: `Savings margin ${savingsRate}%. You can prepay an installment or build an emergency reserve from the ${money(plannedLeftMinor, "en")} surplus.`,
    });
  }
  if (top && plannedOutMinor > 0 && top[1] / plannedOutMinor >= 0.4) {
    const label = personalCategoryLabel("expense", top[0], "ar");
    tips.push({
      id: "concentrated",
      severity: "warning",
      ar: `تصنيف «${label}» يشكّل ${Math.round((top[1] / plannedOutMinor) * 100)}% من المصروف المبرمج (${money(top[1], "ar")}). راجع هل يمكن تخفيضه أو تقسيطه.`,
      en: `“${personalCategoryLabel("expense", top[0], "en")}” is ${Math.round((top[1] / plannedOutMinor) * 100)}% of planned spend (${money(top[1], "en")}). See if it can be cut or spread.`,
    });
  }
  if (pendingInMinor > 0) {
    tips.push({
      id: "pending-in",
      severity: "info",
      ar: `دخل معلّق هذا الشهر ${money(pendingInMinor, "ar")}. عندما يصل المبلغ اضغط اعتماد الدخل — النظام لا يضيفه للرصيد قبل ذلك.`,
      en: `${money(pendingInMinor, "en")} income is waiting this month. Approve it when the money arrives — it does not hit the balance before that.`,
    });
  }
  if (pendingOutMinor > 0) {
    tips.push({
      id: "pending-out",
      severity: "warning",
      ar: `خصوم معلّقة هذا الشهر ${money(pendingOutMinor, "ar")}. اعتمد ما دُفع، أو أجّل، أو تجاهل إن سقط الالتزام.`,
      en: `${money(pendingOutMinor, "en")} bills are waiting this month. Approve what you paid, defer, or skip if the charge dropped.`,
    });
  }
  if (!tips.length) {
    tips.push({
      id: "steady",
      severity: "info",
      ar: "الخطة متوازنة هذا الشهر. أبقِ الاعتماد شهرياً ليتطابق السجل مع الواقع.",
      en: "This month’s plan is balanced. Keep approving each month so the ledger matches reality.",
    });
  }

  return {
    plannedInMinor,
    plannedOutMinor,
    plannedLeftMinor,
    postedInMinor,
    postedOutMinor,
    pendingInMinor,
    pendingOutMinor,
    savingsRate,
    topExpenseCategory,
    tips: tips.slice(0, 5),
  };
}
