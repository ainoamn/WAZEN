import { escapeHtml } from "./html.ts";
import { formatDebitMoneyMinor, formatMoneyMinor, formatSignedMoneyMinor } from "./money.ts";
import { wrapPrintDocument } from "./print-document.ts";
import {
  ROSTER_COLUMNS,
  buildMemberRosterHtml,
  defaultRosterColumns,
  sortRosterRows,
  type RosterColumnId,
  type RosterMemberRow,
  type RosterSort,
} from "./member-roster-export.ts";

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

export type StatementHolding = {
  id: string;
  space_id: string;
  name: string;
  kind: string;
  amount_minor: number;
  matures_at?: string | null;
  expected_return_minor?: number;
  status?: string;
};

export type StatementColumnId =
  | "when"
  | "ref"
  | "description"
  | "item"
  | "flow"
  | "user"
  | "deposit"
  | "withdraw"
  | "balance"
  | "status";

export const STATEMENT_COLUMNS: Array<{
  id: StatementColumnId;
  ar: string;
  en: string;
  defaultOn: boolean;
}> = [
  { id: "when", ar: "التاريخ والوقت", en: "Date & time", defaultOn: true },
  { id: "ref", ar: "المرجع", en: "Ref", defaultOn: false },
  { id: "description", ar: "البيان", en: "Description", defaultOn: true },
  { id: "item", ar: "البند", en: "Item", defaultOn: true },
  { id: "flow", ar: "من / إلى", en: "From / to", defaultOn: false },
  { id: "user", ar: "العضو / المستخدم", en: "Member / user", defaultOn: true },
  { id: "deposit", ar: "إيداع", en: "Deposit", defaultOn: true },
  { id: "withdraw", ar: "سحب", en: "Withdrawal", defaultOn: true },
  { id: "balance", ar: "الرصيد", en: "Balance", defaultOn: true },
  { id: "status", ar: "الحالة", en: "Status", defaultOn: true },
];

export function defaultStatementColumns(): StatementColumnId[] {
  return STATEMENT_COLUMNS.filter((column) => column.defaultOn).map((column) => column.id);
}

function t(locale: StatementLocale, ar: string, en: string) {
  return locale === "ar" ? ar : en;
}

function spaceName(space: StatementSpace, locale: StatementLocale) {
  return locale === "ar" ? space.name_ar : space.name_en;
}

function kindLabel(kind: string, allocation: string | undefined, locale: StatementLocale) {
  if (kind === "transfer" && allocation === "holding") {
    return t(locale, "تحويل إلى وديعة / استثمار", "Transfer to deposit / investment");
  }
  if (kind === "transfer" && allocation === "from_holding") {
    return t(locale, "استرداد وديعة / استثمار", "Redeem deposit / investment");
  }
  const map: Record<string, [string, string]> = {
    income: ["إيداع / دخل", "Deposit / income"],
    contribution: ["مساهمة / إيداع", "Contribution / deposit"],
    expense: ["سحب / مصروف", "Withdrawal / expense"],
    reimbursement: ["تعويض", "Reimbursement"],
    transfer: ["تحويل", "Transfer"],
  };
  const pair = map[kind];
  return pair ? t(locale, pair[0], pair[1]) : kind;
}

/** Cash effect for spendable balance (holdings leave/return cash). */
function signedMinor(txn: StatementTransaction) {
  if (["income", "contribution"].includes(txn.kind)) return Number(txn.amount_minor) || 0;
  if (["expense", "reimbursement"].includes(txn.kind)) return -(Number(txn.amount_minor) || 0);
  if (txn.kind === "transfer" && txn.allocation === "holding") return -(Number(txn.amount_minor) || 0);
  if (txn.kind === "transfer" && txn.allocation === "from_holding") return Number(txn.amount_minor) || 0;
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
    full: ["الكشف الكامل: الحركات المرحّلة مع الملغاة الظاهرة. الودائع تظهر كتحويل من النقد.", "Full statement: posted movements with voided rows. Deposits show as cash transfers."],
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
  holdings?: StatementHolding[];
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
    const item = occ?.rule_name || kindLabel(txn.kind, txn.allocation, locale);
    const place = txn.kind === "transfer" && txn.allocation === "holding"
      ? t(locale, "نقد الصندوق", "Fund cash")
      : txn.kind === "transfer" && txn.allocation === "from_holding"
        ? t(locale, "وديعة / استثمار", "Deposit / investment")
        : txnAccount?.name
          || (txn.allocation === "personal_reserve" ? t(locale, "احتياطي شخصي", "Personal reserve") : t(locale, "صندوق المحفظة", "Wallet fund"));
    const dest = txn.kind === "transfer" && txn.allocation === "holding"
      ? t(locale, "وديعة / استثمار", "Deposit / investment")
      : txn.kind === "transfer" && txn.allocation === "from_holding"
        ? t(locale, "نقد الصندوق", "Fund cash")
        : spaceName(txnSpace ?? scopedSpaces[0], locale);
    const amountShown = live
      ? signed
      : (["expense", "reimbursement"].includes(txn.kind) || (txn.kind === "transfer" && txn.allocation === "holding")
        ? -(Number(txn.amount_minor) || 0)
        : (Number(txn.amount_minor) || 0));
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
  const holdings = (input.holdings ?? []).filter((row) => spaceIds.has(row.space_id) && (row.status ?? "active") === "active");
  const holdingsMinor = holdings.reduce((sum, row) => sum + Number(row.amount_minor || 0), 0);

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
    holdingsMinor,
    holdings,
    movementCount: lines.length,
    lines,
  };
}

function cellForColumn(
  line: AccountStatementLine,
  column: StatementColumnId,
  money: (minor: number) => string,
  signedMoney: (minor: number) => string,
  locale: StatementLocale,
) {
  switch (column) {
    case "when":
      return { text: formatStatementWhen(line.at, locale), cls: "col-date" };
    case "ref":
      return { text: line.ref, cls: "col-ref" };
    case "description":
      return { text: line.description, cls: "col-desc" };
    case "item":
      return { text: line.item, cls: "col-item" };
    case "flow":
      return { text: line.flow, cls: "col-flow" };
    case "user":
      return { text: line.userName, cls: "col-user" };
    case "deposit":
      return { text: line.depositMinor > 0 ? money(line.depositMinor) : "—", cls: "num" };
    case "withdraw":
      return { text: line.withdrawMinor > 0 ? money(line.withdrawMinor) : "—", cls: "num" };
    case "balance":
      return {
        text: line.balanceMinor != null ? signedMoney(line.balanceMinor) : "—",
        cls: `num${line.balanceMinor != null && line.balanceMinor < 0 ? " neg" : ""}`,
      };
    case "status":
      return { text: line.status, cls: "col-status" };
    default:
      return { text: "", cls: "" };
  }
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
  txnFilter?: StatementTxnFilter;
  columns?: StatementColumnId[];
  holdings?: StatementHolding[];
  /** Append members roster (society/group). */
  includeMembers?: boolean;
  memberRows?: RosterMemberRow[];
  memberColumns?: RosterColumnId[];
  memberSort?: RosterSort;
}) {
  const locale = input.locale;
  const model = buildAccountStatementModel(input);
  const txnFilter = model.txnFilter;
  const currency = model.currency;
  const money = (minor: number) => formatMoneyMinor(minor, currency, locale);
  const signedMoney = (minor: number) => formatSignedMoneyMinor(minor, currency, locale);
  const signedTone = (minor: number): "neg" | undefined => (minor < 0 ? "neg" : undefined);
  const opening = model.openingMinor;
  const closing = model.closingMinor;
  const entityName = model.entityName;
  const title = model.title;
  const subtitle = model.subtitle;
  const rows = model.lines;
  const columns = (input.columns?.length ? input.columns : defaultStatementColumns())
    .filter((id, index, list) => list.indexOf(id) === index);

  const head = columns.map((id) => {
    const meta = STATEMENT_COLUMNS.find((column) => column.id === id);
    return locale === "ar" ? (meta?.ar ?? id) : (meta?.en ?? id);
  });

  const body = rows.map((line) => ({
    live: line.live,
    cells: columns.map((column) => cellForColumn(line, column, money, signedMoney, locale)),
  }));

  const depositIndex = columns.indexOf("deposit");
  const withdrawIndex = columns.indexOf("withdraw");

  let table = `<section><h2>${escapeHtml(t(locale, "الحركات", "Movements"))}</h2>
    <table>
      <thead><tr>${head.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead>
      <tbody>${body.length
        ? body.map((row) => `<tr class="${row.live ? "" : "voided"}">${row.cells.map((cell, index) => {
          const tone = index === depositIndex && cell.text !== "—" ? " in" : index === withdrawIndex && cell.text !== "—" ? " out" : "";
          return `<td class="${cell.cls}${tone}">${escapeHtml(cell.text)}</td>`;
        }).join("")}</tr>`).join("")
        : `<tr><td colspan="${head.length}">${escapeHtml(t(locale, "لا توجد حركات في هذا النطاق.", "No movements in this scope."))}</td></tr>`}
      </tbody>
    </table>
    <p class="footer-note${txnFilter !== "voided" && closing < 0 ? " neg" : ""}">${escapeHtml(
      txnFilter === "voided"
        ? t(locale, `عدد المعاملات المحذوفة: ${rows.length}`, `Deleted movements: ${rows.length}`)
        : t(
          locale,
          `نقد ختامي: ${signedMoney(closing)}${model.holdingsMinor > 0 ? ` · ودائع/استثمارات: ${money(model.holdingsMinor)} · إجمالي الأصول: ${money(closing + model.holdingsMinor)}` : ""}`,
          `Closing cash: ${signedMoney(closing)}${model.holdingsMinor > 0 ? ` · Holdings: ${money(model.holdingsMinor)} · Total assets: ${money(closing + model.holdingsMinor)}` : ""}`,
        ),
    )}</p>
  </section>`;

  if (model.holdings.length) {
    const holdingRows = model.holdings.map((holding) => {
      const due = holding.matures_at
        ? new Date(holding.matures_at).toLocaleDateString(locale === "ar" ? "ar-OM" : "en-GB")
        : "—";
      const profit = Number(holding.expected_return_minor || 0) > 0
        ? money(Number(holding.expected_return_minor))
        : "—";
      return `<tr>
        <td>${escapeHtml(holding.name)}</td>
        <td class="num">${escapeHtml(money(holding.amount_minor))}</td>
        <td>${escapeHtml(due)}</td>
        <td class="num">${escapeHtml(profit)}</td>
      </tr>`;
    }).join("");
    table += `<section><h2>${escapeHtml(t(locale, "الودائع والاستثمارات", "Deposits & investments"))}</h2>
      <table>
        <thead><tr>
          <th>${escapeHtml(t(locale, "الأصل", "Holding"))}</th>
          <th>${escapeHtml(t(locale, "المبلغ", "Amount"))}</th>
          <th>${escapeHtml(t(locale, "الاستحقاق", "Maturity"))}</th>
          <th>${escapeHtml(t(locale, "أرباح متوقعة", "Expected profit"))}</th>
        </tr></thead>
        <tbody>${holdingRows}</tbody>
      </table>
    </section>`;
  }

  if (input.includeMembers && input.memberRows?.length) {
    const memberSort = input.memberSort ?? "alphaAsc";
    const memberColumns = input.memberColumns?.length ? input.memberColumns : defaultRosterColumns();
    const ordered = sortRosterRows(input.memberRows, memberSort, locale);
    const labels = memberColumns.map((id) => {
      const meta = ROSTER_COLUMNS.find((column) => column.id === id);
      return locale === "ar" ? (meta?.ar ?? id) : (meta?.en ?? id);
    });
    const memberBody = ordered.map((row) => {
      const cells = memberColumns.map((column) => {
        if (column === "member") return escapeHtml(row.display_name);
        if (column === "goal") return escapeHtml(money(row.goal_minor));
        if (column === "paid") return escapeHtml(money(row.paid_minor));
        if (column === "extra") return escapeHtml(money(row.extra_minor));
        if (column === "owes") {
          return escapeHtml(row.owes_minor > 0
            ? formatDebitMoneyMinor(row.owes_minor, currency, locale)
            : money(0));
        }
        if (column === "credit") return escapeHtml(money(row.credit_minor));
        if (column === "status") {
          const active = (row.status ?? "active") === "active";
          return escapeHtml(active
            ? t(locale, "نشط", "Active")
            : t(locale, "مؤرشف", "Archived"));
        }
        return "";
      });
      return `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
    }).join("");
    const sortNote = memberSort === "alphaAsc"
      ? t(locale, "مرتّب أبجدياً أ → ي", "Sorted A → Z")
      : memberSort === "alphaDesc"
        ? t(locale, "مرتّب أبجدياً ي → أ", "Sorted Z → A")
        : t(locale, "ترتيب السجل", "Ledger order");
    table += `<section><h2>${escapeHtml(t(locale, "أعضاء الجمعية", "Association members"))}</h2>
      <p class="footer-note">${escapeHtml(sortNote)} · ${ordered.length}</p>
      <table>
        <thead><tr>${labels.map((label) => `<th>${escapeHtml(label)}</th>`).join("")}</tr></thead>
        <tbody>${memberBody}</tbody>
      </table>
    </section>`;
  }

  const scopeLabel = filterTitle(txnFilter, locale);
  const kpis = txnFilter === "voided"
    ? [
        { label: t(locale, "عدد الملغاة", "Voided count"), value: String(rows.length) },
        { label: t(locale, "إجمالي المبالغ", "Total amounts"), value: money(rows.reduce((sum, line) => sum + line.depositMinor + line.withdrawMinor, 0)) },
        { label: t(locale, "المحفظة", "Wallet"), value: entityName },
        { label: t(locale, "الرصيد الحالي", "Current balance"), value: signedMoney(closing), tone: signedTone(closing) },
      ]
    : [
        { label: t(locale, "رصيد أول المدة (نقد)", "Opening cash"), value: signedMoney(opening), tone: signedTone(opening) },
        { label: t(locale, "إجمالي الإيداع", "Total in"), value: money(model.totalInMinor) },
        { label: t(locale, "إجمالي السحب / التحويل", "Total out / transfers"), value: money(model.totalOutMinor) },
        { label: t(locale, "نقد آخر المدة", "Closing cash"), value: signedMoney(closing), tone: signedTone(closing) },
      ];

  if (model.holdingsMinor > 0 && txnFilter !== "voided") {
    kpis.push({ label: t(locale, "ودائع واستثمارات", "Holdings"), value: money(model.holdingsMinor) });
  }

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
    kpis,
    bodyHtml: table,
  });
}

export { buildMemberRosterHtml, defaultRosterColumns, ROSTER_COLUMNS };
export type { RosterColumnId, RosterMemberRow, RosterSort };
