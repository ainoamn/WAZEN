import { escapeHtml } from "./html.ts";
import {
  accruedDueMinor,
  allocateOldestFirst,
  buildInstallmentSchedule,
  remainingInstallmentMinor,
  type InstallmentLike,
} from "./installments.ts";
import { memberDisplayCreditMinor, netMemberClaim } from "./finance.ts";
import { formatMoneyMinor } from "./money.ts";
import { wrapPrintDocument } from "./print-document.ts";

export type MemberLedgerFocus = "all" | "paid" | "spent" | "owes" | "credit";
export type MemberLedgerLocale = "ar" | "en";

export type MemberLedgerLine = {
  at: string;
  focus: Exclude<MemberLedgerFocus, "all">;
  direction: "in" | "out" | "info";
  titleAr: string;
  titleEn: string;
  detailAr: string;
  detailEn: string;
  amountMinor: number;
  status?: string;
};

type Txn = {
  id: string;
  space_id: string;
  member_id?: string | null;
  kind: string;
  allocation?: string;
  amount_minor: number;
  description_ar: string;
  description_en: string;
  status?: string;
  occurred_at: string;
};

type Inst = InstallmentLike & { member_id?: string; space_id?: string; due_at?: string };

function isLive(status?: string) {
  return status !== "voided" && status !== "superseded";
}

function text(locale: MemberLedgerLocale, ar: string, en: string) {
  return locale === "ar" ? ar : en;
}

function resolveMonths(
  member: { id: string; space_id: string; paid_minor: number; due_minor: number; joined_at?: string },
  installments: Inst[],
  plan?: { amount_minor?: number; duration_months?: number; starts_at?: string } | null,
) {
  const rows = installments.filter((row) => row.member_id === member.id);
  if (rows.length) return [...rows].sort((a, b) => a.period_index - b.period_index);
  const monthly = Number(plan?.amount_minor ?? 0);
  const duration = Number(plan?.duration_months ?? 0);
  if (monthly <= 0 || duration <= 0) return [];
  return buildInstallmentSchedule({
    memberId: member.id,
    spaceId: member.space_id,
    startAt: plan?.starts_at || member.joined_at || new Date().toISOString(),
    durationMonths: duration,
    amountMinor: monthly,
    paidMinor: member.paid_minor,
  }).rows;
}

export function buildMemberLedger(input: {
  member: {
    id: string;
    space_id: string;
    display_name: string;
    email?: string | null;
    phone?: string | null;
    role?: string;
    due_minor: number;
    paid_minor: number;
    extra_minor: number;
    addon_minor?: number;
    joined_at?: string;
  };
  spaceNameAr: string;
  spaceNameEn: string;
  currency: string;
  plan?: { amount_minor?: number; duration_months?: number; starts_at?: string } | null;
  installments: Inst[];
  transactions: Txn[];
  settlements: Array<{
    id: string;
    space_id: string;
    from_member_id: string;
    to_member_id: string;
    from_member_name?: string | null;
    to_member_name?: string | null;
    amount_minor: number;
    status: string;
  }>;
  tripExpenses: Array<{
    id: string;
    space_id: string;
    paid_by_member_id: string;
    paid_by_name: string;
    amount_minor: number;
    description: string;
    occurred_at: string;
  }>;
  expenseSplits: Array<{ expense_id: string; member_id: string; share_minor: number }>;
}) {
  const member = input.member;
  const months = resolveMonths(member, input.installments, input.plan);
  const accrued = months.length ? accruedDueMinor(months) : Number(member.due_minor) || 0;
  const remainingDue = Math.max(0, accrued - member.paid_minor);
  const cashCredit = memberDisplayCreditMinor(member, { accruedDueMinor: accrued, transactions: input.transactions });
  let expenseDebit = 0;
  let expenseCredit = 0;
  const lines: MemberLedgerLine[] = [];

  const payments = input.transactions
    .filter((txn) => txn.member_id === member.id && txn.space_id === member.space_id && isLive(txn.status) && ["contribution", "income"].includes(txn.kind))
    .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());

  const working = months.map((row) => ({ ...row, paid_minor: 0, status: "unpaid" }));
  for (const txn of payments) {
    const amount = Number(txn.amount_minor) || 0;
    const descAr = txn.description_ar || "دفعة";
    const descEn = txn.description_en || "Payment";
    if (working.length && amount > 0) {
      try {
        const split = allocateOldestFirst(working, amount);
        const partsAr = split.allocations.map((item) => `شهر ${item.periodIndex} (${item.periodKey}) ${item.amountMinor}`);
        const partsEn = split.allocations.map((item) => `month ${item.periodIndex} (${item.periodKey}) ${item.amountMinor}`);
        for (const item of split.allocations) {
          const row = working.find((month) => month.id === item.installmentId);
          if (!row) continue;
          row.paid_minor += item.amountMinor;
        }
        const leftover = split.leftoverMinor;
        lines.push({
          at: txn.occurred_at,
          focus: leftover === amount && split.appliedMinor === 0 ? "credit" : "paid",
          direction: "in",
          titleAr: descAr,
          titleEn: descEn,
          detailAr: [
            split.appliedMinor > 0 ? `وُزّعت على: ${partsAr.join("، ")}` : "لا أشهر مستحقة وقتها",
            leftover > 0 ? `الفائض ${leftover} صار له / احتياطي` : "",
            txn.allocation === "personal_reserve" ? "صُنّفت كاحتياطي شخصي" : "",
          ].filter(Boolean).join(" · "),
          detailEn: [
            split.appliedMinor > 0 ? `Applied to: ${partsEn.join(", ")}` : "No dues due at the time",
            leftover > 0 ? `Surplus ${leftover} became credit / reserve` : "",
            txn.allocation === "personal_reserve" ? "Booked as personal reserve" : "",
          ].filter(Boolean).join(" · "),
          amountMinor: amount,
          status: txn.status,
        });
        if (leftover > 0) {
          lines.push({
            at: txn.occurred_at,
            focus: "credit",
            direction: "in",
            titleAr: "فائض الدفعة",
            titleEn: "Payment surplus",
            detailAr: `من ${descAr} — صار رصيداً له`,
            detailEn: `From ${descEn} — became credit`,
            amountMinor: leftover,
          });
        }
      } catch {
        lines.push({
          at: txn.occurred_at,
          focus: "paid",
          direction: "in",
          titleAr: descAr,
          titleEn: descEn,
          detailAr: "دفعة اشتراك",
          detailEn: "Subscription payment",
          amountMinor: amount,
        });
      }
    } else {
      lines.push({
        at: txn.occurred_at,
        focus: txn.allocation === "personal_reserve" ? "credit" : "paid",
        direction: "in",
        titleAr: descAr,
        titleEn: descEn,
        detailAr: txn.allocation === "personal_reserve" ? "احتياطي شخصي" : "دفعة",
        detailEn: txn.allocation === "personal_reserve" ? "Personal reserve" : "Payment",
        amountMinor: amount,
      });
    }
  }

  for (const month of months) {
    const remaining = remainingInstallmentMinor(month);
    const due = month.due_at || month.period_key;
    if (remaining > 0) {
      const dueMs = month.due_at ? new Date(month.due_at).getTime() : NaN;
      const elapsed = Number.isNaN(dueMs) ? month.period_key <= new Date().toISOString().slice(0, 7) : dueMs <= Date.now();
      if (elapsed) {
        lines.push({
          at: due,
          focus: "owes",
          direction: "out",
          titleAr: `مستحق شهر ${month.period_index} (${month.period_key})`,
          titleEn: `Due month ${month.period_index} (${month.period_key})`,
          detailAr: "اشتراك لم يُسدَّد بعد — هكذا صار عليه هذا الجزء",
          detailEn: "Unpaid subscription — this is how this owed amount arose",
          amountMinor: remaining,
          status: month.status,
        });
      }
    }
  }

  for (const txn of input.transactions.filter((row) => row.member_id === member.id && row.space_id === member.space_id && isLive(row.status) && ["expense", "reimbursement"].includes(row.kind))) {
    const spent = txn.kind === "expense";
    lines.push({
      at: txn.occurred_at,
      focus: spent ? "spent" : "credit",
      direction: spent ? "out" : "in",
      titleAr: txn.description_ar || (spent ? "صرف" : "تعويض"),
      titleEn: txn.description_en || (spent ? "Expense" : "Reimbursement"),
      detailAr: spent ? "صُرف من الصندوق أو الاحتياطي" : "تعويض لصالح العضو",
      detailEn: spent ? "Withdrawn from fund or reserve" : "Reimbursement to the member",
      amountMinor: Number(txn.amount_minor) || 0,
    });
  }

  const expenses = input.tripExpenses.filter((row) => row.space_id === member.space_id);
  for (const expense of expenses) {
    const splits = input.expenseSplits.filter((row) => row.expense_id === expense.id);
    const share = splits.find((row) => row.member_id === member.id);
    if (expense.paid_by_member_id === member.id) {
      lines.push({
        at: expense.occurred_at,
        focus: "spent",
        direction: "out",
        titleAr: expense.description || "مصروف مشترك",
        titleEn: expense.description || "Shared expense",
        detailAr: `دفع العضو الفاتورة كاملة (${expense.amount_minor}) ثم تُقسَّم الحصص`,
        detailEn: `Member paid the full bill (${expense.amount_minor}); shares are split`,
        amountMinor: Number(expense.amount_minor) || 0,
      });
      expenseCredit += Math.max(0, (Number(expense.amount_minor) || 0) - (share ? Number(share.share_minor) : 0));
    }
    if (share && Number(share.share_minor) > 0) {
      const payer = expense.paid_by_name || "—";
      lines.push({
        at: expense.occurred_at,
        focus: expense.paid_by_member_id === member.id ? "spent" : "owes",
        direction: "out",
        titleAr: `حصة من: ${expense.description || "مصروف"}`,
        titleEn: `Share of: ${expense.description || "expense"}`,
        detailAr: expense.paid_by_member_id === member.id
          ? "حصته من فاتورة دفعها بنفسه"
          : `حصته لأن ${payer} دفع عنه — هكذا صار عليه هذا المبلغ`,
        detailEn: expense.paid_by_member_id === member.id
          ? "His share of a bill he paid"
          : `Share because ${payer} paid — this is how the owed amount arose`,
        amountMinor: Number(share.share_minor) || 0,
      });
    }
  }

  for (const settlement of input.settlements.filter((row) => row.space_id === member.space_id)) {
    const amount = Number(settlement.amount_minor) || 0;
    if (amount <= 0) continue;
    const pending = settlement.status === "pending";
    if (settlement.from_member_id === member.id) {
      if (pending) expenseDebit += amount;
      lines.push({
        at: new Date().toISOString(),
        focus: pending ? "owes" : "spent",
        direction: "out",
        titleAr: pending ? "تسوية معلقة عليه" : "تسوية سُددت",
        titleEn: pending ? "Pending settlement he owes" : "Settled share",
        detailAr: `يدفع لـ ${settlement.to_member_name || "عضو آخر"} — ناتج تقسيم مصروف مشترك`,
        detailEn: `Pays ${settlement.to_member_name || "another member"} — from a shared expense split`,
        amountMinor: amount,
        status: settlement.status,
      });
    }
    if (settlement.to_member_id === member.id) {
      if (pending) expenseCredit += amount;
      lines.push({
        at: new Date().toISOString(),
        focus: "credit",
        direction: "in",
        titleAr: pending ? "مستحق له من تسوية" : "استلم تسوية",
        titleEn: pending ? "Settlement due to him" : "Settlement received",
        detailAr: `من ${settlement.from_member_name || "عضو آخر"} لأنه دفع حصة غيره`,
        detailEn: `From ${settlement.from_member_name || "another member"} because he covered their share`,
        amountMinor: amount,
        status: settlement.status,
      });
    }
  }

  if (Number(member.extra_minor) > 0) {
    lines.push({
      at: member.joined_at || new Date().toISOString(),
      focus: "credit",
      direction: "in",
      titleAr: "احتياطي شخصي",
      titleEn: "Personal reserve",
      detailAr: "فائض محفوظ باسمه ولا يدخل الصندوق العام إلا عند الصرف",
      detailEn: "Surplus held in his name, not in the common fund until withdrawn",
      amountMinor: Number(member.extra_minor) || 0,
    });
  }
  if (Number(member.addon_minor ?? 0) > 0) {
    lines.push({
      at: member.joined_at || new Date().toISOString(),
      focus: "spent",
      direction: "out",
      titleAr: "إضافي / حصص مصروف",
      titleEn: "Extra / expense shares",
      detailAr: "مجموع حصصه من المصروفات المشتركة",
      detailEn: "Total of his shared-expense shares",
      amountMinor: Number(member.addon_minor ?? 0),
    });
  }

  const debit = remainingDue + Math.max(0, expenseDebit);
  const credit = cashCredit + Math.max(0, expenseCredit);
  const net = netMemberClaim(debit, credit);
  lines.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return {
    months,
    lines,
    joinedAt: member.joined_at || "",
    goalMinor: Number(member.due_minor) || 0,
    paidMinor: Number(member.paid_minor) || 0,
    extraMinor: Number(member.extra_minor) || 0,
    addonMinor: Number(member.addon_minor ?? 0),
    spentMinor: Number(member.addon_minor ?? 0) + lines.filter((line) => line.focus === "spent" && line.direction === "out").reduce((sum, line) => sum + (line.titleAr.startsWith("حصة") || line.titleEn.startsWith("Share") ? line.amountMinor : 0), 0),
    accruedDueMinor: accrued,
    remainingDueMinor: remainingDue,
    cashCreditMinor: cashCredit,
    owesMinor: net.debitMinor,
    creditMinor: net.creditMinor,
    reservedMinor: net.reservedMinor,
    grossOwesMinor: net.grossDebitMinor,
    grossCreditMinor: net.grossCreditMinor,
  };
}

export function filterMemberLedgerLines(lines: MemberLedgerLine[], focus: MemberLedgerFocus) {
  if (focus === "all") return lines;
  return lines.filter((line) => line.focus === focus);
}

export function buildMemberLedgerHtml(input: {
  locale: MemberLedgerLocale;
  logoUrl: string;
  issuerName: string;
  memberName: string;
  spaceName: string;
  currency: string;
  joinedAt?: string;
  phone?: string | null;
  email?: string | null;
  focus: MemberLedgerFocus;
  ledger: ReturnType<typeof buildMemberLedger>;
}) {
  const locale = input.locale;
  const money = (minor: number) => formatMoneyMinor(minor, input.currency, locale);
  const focusTitle: Record<MemberLedgerFocus, [string, string]> = {
    all: ["كشف العضو التفصيلي", "Member detailed statement"],
    paid: ["تفاصيل المدفوع", "Paid breakdown"],
    spent: ["تفاصيل الصرف والإضافي", "Spending / extra breakdown"],
    owes: ["تفاصيل ما عليه", "What he owes"],
    credit: ["تفاصيل ما له", "What is owed to him"],
  };
  const title = text(locale, focusTitle[input.focus][0], focusTitle[input.focus][1]);
  const rows = filterMemberLedgerLines(input.ledger.lines, input.focus);
  const head = [
    text(locale, "التاريخ", "Date"),
    text(locale, "البيان", "Description"),
    text(locale, "التفصيل", "Detail"),
    text(locale, "النوع", "Type"),
    text(locale, "المبلغ", "Amount"),
  ];
  const typeLabel = (focus: MemberLedgerLine["focus"]) => {
    const map = {
      paid: text(locale, "مدفوع", "Paid"),
      spent: text(locale, "صرف", "Spent"),
      owes: text(locale, "عليه", "Owes"),
      credit: text(locale, "له", "Credit"),
    };
    return map[focus];
  };
  const body = rows.map((line) => {
    const when = new Date(line.at).toLocaleString(locale === "ar" ? "ar-OM" : "en-GB");
    const titleText = locale === "ar" ? line.titleAr : line.titleEn;
    const detail = locale === "ar" ? line.detailAr : line.detailEn;
    const cls = line.direction === "in" ? "in" : line.direction === "out" ? "out" : "";
    return `<tr><td>${escapeHtml(when)}</td><td>${escapeHtml(titleText)}</td><td>${escapeHtml(detail)}</td><td>${escapeHtml(typeLabel(line.focus))}</td><td class="num ${cls}">${escapeHtml(money(line.amountMinor))}</td></tr>`;
  }).join("");

  const table = `<section><h2>${escapeHtml(text(locale, "الحركات والتفاصيل", "Movements and detail"))}</h2>
    <table>
      <thead><tr>${head.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead>
      <tbody>${body || `<tr><td colspan="5">${escapeHtml(text(locale, "لا توجد بنود في هذا القسم.", "No rows in this section."))}</td></tr>`}</tbody>
    </table>
  </section>`;

  return wrapPrintDocument({
    locale,
    title,
    entityName: `${input.memberName} · ${input.spaceName}`,
    logoUrl: input.logoUrl,
    subtitle: text(locale, "كشف قابل للطباعة يوضح المدفوع والصرف وما عليه وما له مع السبب والتاريخ.", "Printable statement of paid, spent, owed and credit with dates and reasons."),
    orientation: "landscape",
    meta: [
      { label: text(locale, "العضو", "Member"), value: input.memberName },
      { label: text(locale, "الجمعية", "Association"), value: input.spaceName },
      { label: text(locale, "تاريخ الانضمام", "Joined"), value: input.joinedAt ? new Date(input.joinedAt).toLocaleString(locale === "ar" ? "ar-OM" : "en-GB") : "—" },
      { label: text(locale, "الهاتف / البريد", "Phone / email"), value: [input.phone, input.email].filter(Boolean).join(" · ") || "—" },
      { label: text(locale, "أُصدر بواسطة", "Issued by"), value: input.issuerName },
      { label: text(locale, "تاريخ الإصدار", "Issued at"), value: new Date().toLocaleString(locale === "ar" ? "ar-OM" : "en-GB") },
    ],
    kpis: [
      { label: text(locale, "المدفوع", "Paid"), value: money(input.ledger.paidMinor) },
      { label: text(locale, "إضافي / صرف", "Extra / spent"), value: money(input.ledger.addonMinor) },
      { label: text(locale, "عليه", "Owes"), value: money(input.ledger.owesMinor) },
      { label: text(locale, "له", "Credit"), value: money(input.ledger.creditMinor) },
    ],
    bodyHtml: table,
  });
}
