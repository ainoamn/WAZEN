/** Society/group member roster print & download with selectable columns. */

import { formatDebitMoneyMinor, formatMoneyMinor } from "./money";
import { wrapPrintDocument } from "./print-document";
import { escapeHtml } from "./html";

export type RosterLocale = "ar" | "en";

export type RosterColumnId =
  | "member"
  | "goal"
  | "paid"
  | "extra"
  | "owes"
  | "credit"
  | "status"
  | "details";

export type RosterSort = "alphaAsc" | "alphaDesc" | "asIs";

export type RosterMemberRow = {
  id: string;
  display_name: string;
  goal_minor: number;
  paid_minor: number;
  extra_minor: number;
  owes_minor: number;
  credit_minor: number;
  status: string;
  /** Payment notes / last contribution detail line (optional print column). */
  details?: string;
};

export const ROSTER_COLUMNS: Array<{
  id: RosterColumnId;
  ar: string;
  en: string;
  defaultOn: boolean;
}> = [
  { id: "member", ar: "العضو", en: "Member", defaultOn: true },
  { id: "goal", ar: "الهدف المالي", en: "Goal", defaultOn: false },
  { id: "paid", ar: "مدفوع", en: "Paid", defaultOn: true },
  { id: "extra", ar: "إضافي", en: "Extra", defaultOn: false },
  { id: "owes", ar: "متأخر حتى الشهر الحالي", en: "Arrears to current month", defaultOn: true },
  { id: "credit", ar: "له", en: "Credit", defaultOn: false },
  { id: "status", ar: "الحالة", en: "Status", defaultOn: false },
  { id: "details", ar: "التفاصيل / ملاحظات الدفع", en: "Details / payment notes", defaultOn: false },
];

export function defaultRosterColumns(): RosterColumnId[] {
  return ROSTER_COLUMNS.filter((column) => column.defaultOn).map((column) => column.id);
}

/** Compact dues sheet: name + paid + arrears accrued through current month. */
export function duesRosterColumns(): RosterColumnId[] {
  return ["member", "paid", "owes"];
}

export function sortRosterRows(rows: RosterMemberRow[], sort: RosterSort, locale: RosterLocale) {
  if (sort === "asIs") return rows.slice();
  const collator = new Intl.Collator(locale === "ar" ? "ar" : "en", { sensitivity: "base", numeric: true });
  const sorted = rows.slice().sort((a, b) => collator.compare(a.display_name, b.display_name));
  return sort === "alphaDesc" ? sorted.reverse() : sorted;
}

function cellValue(
  row: RosterMemberRow,
  column: RosterColumnId,
  currency: string,
  locale: RosterLocale,
) {
  switch (column) {
    case "member":
      return row.display_name;
    case "goal":
      return formatMoneyMinor(row.goal_minor, currency, locale);
    case "paid":
      return formatMoneyMinor(row.paid_minor, currency, locale);
    case "extra":
      return formatMoneyMinor(row.extra_minor, currency, locale);
    case "owes":
      return row.owes_minor > 0
        ? formatDebitMoneyMinor(row.owes_minor, currency, locale)
        : formatMoneyMinor(0, currency, locale);
    case "credit":
      return formatMoneyMinor(row.credit_minor, currency, locale);
    case "details":
      return String(row.details ?? "").trim() || "—";
    case "status": {
      const active = (row.status ?? "active") === "active";
      if (locale === "ar") return active ? "نشط" : "مؤرشف";
      return active ? "Active" : "Archived";
    }
    default:
      return "";
  }
}

function cellClass(column: RosterColumnId, row: RosterMemberRow) {
  if (column === "owes" && row.owes_minor > 0) return "num neg";
  if (column === "credit" && row.credit_minor < 0) return "num neg";
  if (column === "details") return "col-desc";
  if (["goal", "paid", "extra", "owes", "credit"].includes(column)) return "num";
  return "";
}

export function buildMemberRosterHtml(input: {
  locale: RosterLocale;
  logoUrl: string;
  spaceName: string;
  currency: string;
  issuerName?: string;
  columns: RosterColumnId[];
  sort: RosterSort;
  rows: RosterMemberRow[];
  titleOverride?: string;
  verifyUrl?: string;
  qrDataUrl?: string;
}) {
  const locale = input.locale;
  const columns = (input.columns.length ? input.columns : defaultRosterColumns())
    .filter((id, index, list) => list.indexOf(id) === index);
  const ordered = sortRosterRows(input.rows, input.sort, locale);
  const labels = columns.map((id) => {
    const meta = ROSTER_COLUMNS.find((column) => column.id === id);
    return locale === "ar" ? (meta?.ar ?? id) : (meta?.en ?? id);
  });
  const title = input.titleOverride
    ?? (locale === "ar" ? `كشف أعضاء — ${input.spaceName}` : `Members roster — ${input.spaceName}`);
  const sortNote = input.sort === "alphaAsc"
    ? (locale === "ar" ? "مرتّب أبجدياً (أ → ي)" : "Sorted A → Z")
    : input.sort === "alphaDesc"
      ? (locale === "ar" ? "مرتّب أبجدياً (ي → أ)" : "Sorted Z → A")
      : (locale === "ar" ? "ترتيب السجل" : "Ledger order");

  const head = labels.map((label) => `<th>${escapeHtml(label)}</th>`).join("");
  const body = ordered.map((row) => {
    const cells = columns.map((column) => {
      const cls = cellClass(column, row);
      return `<td${cls ? ` class="${cls}"` : ""}>${escapeHtml(cellValue(row, column, input.currency, locale))}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");

  const totals = {
    goal: ordered.reduce((sum, row) => sum + row.goal_minor, 0),
    paid: ordered.reduce((sum, row) => sum + row.paid_minor, 0),
    extra: ordered.reduce((sum, row) => sum + row.extra_minor, 0),
    owes: ordered.reduce((sum, row) => sum + row.owes_minor, 0),
    credit: ordered.reduce((sum, row) => sum + row.credit_minor, 0),
  };
  const footCells = columns.map((column) => {
    if (column === "member") return `<td><strong>${locale === "ar" ? "المجموع" : "Total"}</strong></td>`;
    if (column === "goal") return `<td class="num"><strong>${escapeHtml(formatMoneyMinor(totals.goal, input.currency, locale))}</strong></td>`;
    if (column === "paid") return `<td class="num"><strong>${escapeHtml(formatMoneyMinor(totals.paid, input.currency, locale))}</strong></td>`;
    if (column === "extra") return `<td class="num"><strong>${escapeHtml(formatMoneyMinor(totals.extra, input.currency, locale))}</strong></td>`;
    if (column === "owes") {
      return `<td class="num${totals.owes > 0 ? " neg" : ""}"><strong>${escapeHtml(formatDebitMoneyMinor(totals.owes, input.currency, locale))}</strong></td>`;
    }
    if (column === "credit") return `<td class="num"><strong>${escapeHtml(formatMoneyMinor(totals.credit, input.currency, locale))}</strong></td>`;
    return "<td></td>";
  }).join("");

  const bodyHtml = `
    <section class="report-block">
      <p class="report-meta">${escapeHtml(sortNote)} · ${ordered.length} ${locale === "ar" ? "عضواً" : "members"}</p>
      <table class="report-table roster-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr>${footCells}</tr></tfoot>
      </table>
    </section>
  `;

  return wrapPrintDocument({
    title,
    locale,
    logoUrl: input.logoUrl,
    entityName: input.spaceName,
    subtitle: input.issuerName
      ? (locale === "ar" ? `أعدّه ${input.issuerName}` : `Prepared by ${input.issuerName}`)
      : undefined,
    orientation: columns.length > 5 || columns.includes("details") ? "landscape" : "portrait",
    variant: "statement",
    verifyUrl: input.verifyUrl,
    qrDataUrl: input.qrDataUrl,
    bodyHtml,
  });
}
