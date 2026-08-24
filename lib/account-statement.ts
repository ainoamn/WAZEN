import { escapeHtml } from "./html.ts";
import { formatMoneyMinor } from "./money.ts";
import { wrapPrintDocument } from "./print-document.ts";

export type StatementLocale = "ar" | "en";

export type StatementSpace = {
  id: string;
  name_ar: string;
  name_en: string;
  type: string;
  currency: string;
  balance_minor: number;
};

export type StatementAccount = {
  id: string;
  space_id: string;
  name: string;
  opening_minor: number;
  balance_minor?: number;
};

export type StatementMember = {
  id: string;
  space_id: string;
  display_name: string;
};

export type StatementTransaction = {
  id: string;
  space_id: string;
  member_id?: string | null;
  user_id?: string | null;
  account_id?: string | null;
  kind: string;
  allocation?: string;
  amount_minor: number;
  description_ar: string;
  description_en: string;
  status?: string;
  occurred_at: string;
};

export type StatementOccurrence = {
  transaction_id?: string | null;
  rule_name?: string;
  account_id?: string | null;
};

function t(locale: StatementLocale, ar: string, en: string) {
  return locale === "ar" ? ar : en;
}

function spaceName(space: StatementSpace, locale: StatementLocale) {
  return locale === "ar" ? space.name_ar : space.name_en;
}

function kindLabel(kind: string, locale: StatementLocale) {
  const map: Record<string, [string, string]> = {
    income: ["إيداع / دخل", "Deposit / income"],
    contribution: ["مساهمة / إيداع", "Contribution / deposit"],
    expense: ["سحب / مصروف", "Withdrawal / expense"],
    reimbursement: ["تعويض", "Reimbursement"],
  };
  const pair = map[kind];
  return pair ? t(locale, pair[0], pair[1]) : kind;
}

function signedMinor(txn: StatementTransaction) {
  if (["income", "contribution"].includes(txn.kind)) return Number(txn.amount_minor) || 0;
  if (["expense", "reimbursement"].includes(txn.kind)) return -(Number(txn.amount_minor) || 0);
  return 0;
}

function isLive(txn: StatementTransaction) {
  const status = txn.status ?? "approved";
  return status !== "voided" && status !== "superseded";
}

/** What to include when printing an association/wallet statement. */
export type StatementTxnFilter = "full" | "valid" | "voided" | "all";

export function filterStatementTransactions(
  rows: StatementTransaction[],
  filter: StatementTxnFilter = "full",
) {
  return rows.filter((txn) => {
    const status = txn.status ?? "approved";
    if (filter === "valid") return isLive(txn);
    if (filter === "voided") return status === "voided";
    if (filter === "all") return true;
    // Full statement: posted + voided, hide edit-replacement ghosts
    return status !== "superseded";
  });
}

function statusLabel(txn: StatementTransaction, locale: StatementLocale) {
  const status = txn.status ?? "approved";
  if (status === "voided") return t(locale, "ملغاة", "Voided");
  if (status === "superseded") return t(locale, "مستبدلة", "Replaced");
  return t(locale, "مرحّلة", "Posted");
}

function filterTitle(filter: StatementTxnFilter, locale: StatementLocale) {
  const map: Record<StatementTxnFilter, [string, string]> = {
    full: ["كشف حساب تفصيلي", "Detailed account statement"],
    valid: ["كشف المعاملات الصحيحة", "Valid transactions statement"],
    voided: ["كشف المعاملات المحذوفة", "Deleted transactions statement"],
    all: ["كشف كل المعاملات", "All transactions statement"],
  };
  return t(locale, map[filter][0], map[filter][1]);
}

function filterSubtitle(filter: StatementTxnFilter, locale: StatementLocale) {
  const map: Record<StatementTxnFilter, [string, string]> = {
    full: ["الكشف الكامل: الحركات المرحّلة مع الملغاة الظاهرة.", "Full statement: posted movements with voided rows visible."],
    valid: ["المعاملات الصحيحة (المرحّلة) فقط.", "Valid (posted) transactions only."],
    voided: ["المعاملات المحذوفة / الملغاة فقط.", "Deleted / voided transactions only."],
    all: ["كل المعاملات بما فيها الملغاة والمستبدلة.", "Every transaction including voided and replaced."],
  };
  return t(locale, map[filter][0], map[filter][1]);
}

function formatStatementWhen(iso: string, locale: StatementLocale) {
  return new Date(iso).toLocaleString(locale === "ar" ? "ar-OM" : "en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type AccountStatementLine = {
  at: string;
  ref: string;
  description: string;
  item: string;
  flow: string;
  userName: string;
  depositMinor: number;
  withdrawMinor: number;
  balanceMinor: number | null;
  status: string;
  live: boolean;
};

export function buildAccountStatementModel(input: {
  locale: StatementLocale;
  issuerName: string;
  spaces: StatementSpace[];
  members: StatementMember[];
  accounts?: StatementAccount[];
  transactions: StatementTransaction[];
  occurrences?: StatementOccurrence[];
  spaceId?: string | null;
  accountId?: string | null;
  txnFilter?: StatementTxnFilter;
}) {
  const locale = input.locale;
  const txnFilter = input.txnFilter ?? "full";
  const space = input.spaceId ? input.spaces.find((item) => item.id === input.spaceId) ?? null : null;
  const account = input.accountId ? (input.accounts ?? []).find((item) => item.id === input.accountId) ?? null : null;
  const currency = space?.currency ?? input.spaces[0]?.currency ?? "OMR";

  const scopedSpaces = space ? [space] : input.spaces;
  const spaceIds = new Set(scopedSpaces.map((item) => item.id));
  let rows = input.transactions.filter((txn) => spaceIds.has(txn.space_id));
  if (account) rows = rows.filter((txn) => txn.account_id === account.id);
  rows = filterStatementTransactions(rows, txnFilter);
  rows = [...rows].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());

  const liveSigned = rows.filter(isLive).reduce((sum, txn) => sum + signedMinor(txn), 0);
  const closing = account
    ? Number(account.balance_minor ?? account.opening_minor + liveSigned)
    : space
      ? Number(space.balance_minor)
      : scopedSpaces.reduce((sum, item) => sum + Number(item.balance_minor), 0);
  const opening = txnFilter === "voided" ? 0 : closing - liveSigned;
  const entityName = account
    ? `${account.name} · ${space ? spaceName(space, locale) : ""}`.trim()
    : space
      ? spaceName(space, locale)
      : t(locale, "كل المحافظ", "All wallets");

  let running = opening;
  const occurrenceByTxn = new Map((input.occurrences ?? []).filter((row) => row.transaction_id).map((row) => [String(row.transaction_id), row]));
  const lines: AccountStatementLine[] = rows.map((txn) => {
    const live = isLive(txn);
    const signed = live ? signedMinor(txn) : 0;
    if (live) running += signed;
    const member = input.members.find((item) => item.id === txn.member_id);
    const txnSpace = input.spaces.find((item) => item.id === txn.space_id);
    const txnAccount = (input.accounts ?? []).find((item) => item.id === txn.account_id);
    const occ = occurrenceByTxn.get(txn.id);
    const item = occ?.rule_name || kindLabel(txn.kind, locale);
    const place = txnAccount?.name
      || (txn.allocation === "personal_reserve" ? t(locale, "احتياطي شخصي", "Personal reserve") : t(locale, "صندوق المحفظة", "Wallet fund"));
    const dest = spaceName(txnSpace ?? scopedSpaces[0], locale);
    const amountShown = live ? signed : (["expense", "reimbursement"].includes(txn.kind) ? -(Number(txn.amount_minor) || 0) : (Number(txn.amount_minor) || 0));
    return {
      at: txn.occurred_at,
      ref: txn.id.slice(0, 8).toUpperCase(),
      description: locale === "ar" ? txn.description_ar : txn.description_en,
      item,
      flow: `${place} → ${dest}`,
      userName: member?.display_name || input.issuerName,
      depositMinor: amountShown > 0 ? amountShown : 0,
      withdrawMinor: amountShown < 0 ? -amountShown : 0,
      balanceMinor: live && txnFilter !== "voided" ? running : null,
      status: statusLabel(txn, locale),
      live,
    };
  });

  const totalIn = lines.reduce((sum, line) => sum + line.depositMinor, 0);
  const totalOut = lines.reduce((sum, line) => sum + line.withdrawMinor, 0);

  return {
    locale,
    txnFilter,
    currency,
    entityName,
    title: filterTitle(txnFilter, locale),
    subtitle: filterSubtitle(txnFilter, locale),
    openingMinor: opening,
    closingMinor: closing,
    totalInMinor: totalIn,
    totalOutMinor: totalOut,
    movementCount: lines.length,
    lines,
  };
}

export function buildAccountStatementHtml(input: {
  locale: StatementLocale;
  logoUrl: string;
  issuerName: string;
  spaces: StatementSpace[];
  members: StatementMember[];
  accounts?: StatementAccount[];
  transactions: StatementTransaction[];
  occurrences?: StatementOccurrence[];
  spaceId?: string | null;
  accountId?: string | null;
  /** Default `full` — association statement print choices. */
  txnFilter?: StatementTxnFilter;
}) {
  const locale = input.locale;
  const model = buildAccountStatementModel(input);
  const txnFilter = model.txnFilter;
  const currency = model.currency;
  const money = (minor: number) => formatMoneyMinor(minor, currency, locale);
  const opening = model.openingMinor;
  const closing = model.closingMinor;
  const entityName = model.entityName;
  const title = model.title;
  const subtitle = model.subtitle;
  const rows = model.lines;

  const head = [
    t(locale, "التاريخ والوقت", "Date & time"),
    t(locale, "المرجع", "Ref"),
    t(locale, "البيان", "Description"),
    t(locale, "البند", "Item"),
    t(locale, "من / إلى", "From / to"),
    t(locale, "المستخدم", "User"),
    t(locale, "إيداع", "Deposit"),
    t(locale, "سحب", "Withdrawal"),
    t(locale, "الرصيد", "Balance"),
    t(locale, "الحالة", "Status"),
  ];

  const body = rows.map((line) => ({
    live: line.live,
    cells: [
      { text: formatStatementWhen(line.at, locale), cls: "col-date" },
      { text: line.ref, cls: "col-ref" },
      { text: line.description, cls: "col-desc" },
      { text: line.item, cls: "col-item" },
      { text: line.flow, cls: "col-flow" },
      { text: line.userName, cls: "col-user" },
      { text: line.depositMinor > 0 ? money(line.depositMinor) : "—", cls: "num" },
      { text: line.withdrawMinor > 0 ? money(line.withdrawMinor) : "—", cls: "num" },
      { text: line.balanceMinor != null ? money(line.balanceMinor) : "—", cls: "num" },
      { text: line.status, cls: "col-status" },
    ],
  }));

  const table = `<section><h2>${escapeHtml(t(locale, "الحركات", "Movements"))}</h2>
    <table>
      <thead><tr>${head.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead>
      <tbody>${body.length
        ? body.map((row) => `<tr class="${row.live ? "" : "voided"}">${row.cells.map((cell, index) => {
          const tone = index === 6 && cell.text !== "—" ? " in" : index === 7 && cell.text !== "—" ? " out" : "";
          return `<td class="${cell.cls}${tone}">${escapeHtml(cell.text)}</td>`;
        }).join("")}</tr>`).join("")
        : `<tr><td colspan="${head.length}">${escapeHtml(t(locale, "لا توجد حركات في هذا النطاق.", "No movements in this scope."))}</td></tr>`}
      </tbody>
    </table>
    <p class="footer-note">${escapeHtml(
      txnFilter === "voided"
        ? t(locale, `عدد المعاملات المحذوفة: ${rows.length}`, `Deleted movements: ${rows.length}`)
        : t(locale, `الرصيد الختامي: ${money(closing)}`, `Closing balance: ${money(closing)}`),
    )}</p>
  </section>`;

  const scopeLabel = filterTitle(txnFilter, locale);

  return wrapPrintDocument({
    locale,
    title,
    entityName,
    logoUrl: input.logoUrl,
    subtitle,
    orientation: "landscape",
    meta: [
      { label: t(locale, "النطاق", "Scope"), value: entityName },
      { label: t(locale, "نوع الكشف", "Statement type"), value: scopeLabel },
      { label: t(locale, "أُصدر بواسطة", "Issued by"), value: input.issuerName },
      { label: t(locale, "تاريخ الإصدار", "Issued at"), value: new Date().toLocaleString(locale === "ar" ? "ar-OM" : "en-GB") },
      { label: t(locale, "عدد الحركات", "Movements"), value: String(rows.length) },
    ],
    kpis: txnFilter === "voided"
      ? [
          { label: t(locale, "عدد الملغاة", "Voided count"), value: String(rows.length) },
          { label: t(locale, "إجمالي المبالغ", "Total amounts"), value: money(rows.reduce((sum, line) => sum + line.depositMinor + line.withdrawMinor, 0)) },
          { label: t(locale, "المحفظة", "Wallet"), value: entityName },
          { label: t(locale, "الرصيد الحالي", "Current balance"), value: money(closing) },
        ]
      : [
          { label: t(locale, "رصيد أول المدة", "Opening"), value: money(opening) },
          { label: t(locale, "إجمالي الإيداع", "Total in"), value: money(model.totalInMinor) },
          { label: t(locale, "إجمالي السحب", "Total out"), value: money(model.totalOutMinor) },
          { label: t(locale, "رصيد آخر المدة", "Closing"), value: money(closing) },
        ],
    bodyHtml: table,
  });
}
