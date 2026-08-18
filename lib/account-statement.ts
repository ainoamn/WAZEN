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

function formatStatementWhen(iso: string, locale: StatementLocale) {
  return new Date(iso).toLocaleString(locale === "ar" ? "ar-OM" : "en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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
}) {
  const locale = input.locale;
  const space = input.spaceId ? input.spaces.find((item) => item.id === input.spaceId) ?? null : null;
  const account = input.accountId ? (input.accounts ?? []).find((item) => item.id === input.accountId) ?? null : null;
  const currency = space?.currency ?? input.spaces[0]?.currency ?? "OMR";
  const money = (minor: number) => formatMoneyMinor(minor, currency, locale);

  const scopedSpaces = space ? [space] : input.spaces;
  const spaceIds = new Set(scopedSpaces.map((item) => item.id));
  let rows = input.transactions.filter((txn) => spaceIds.has(txn.space_id));
  if (account) rows = rows.filter((txn) => txn.account_id === account.id);

  rows = [...rows].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());

  const liveSigned = rows.filter(isLive).reduce((sum, txn) => sum + signedMinor(txn), 0);
  const closing = account
    ? Number(account.balance_minor ?? account.opening_minor + liveSigned)
    : space
      ? Number(space.balance_minor)
      : scopedSpaces.reduce((sum, item) => sum + Number(item.balance_minor), 0);
  const opening = closing - liveSigned;

  const entityName = account
    ? `${account.name} · ${space ? spaceName(space, locale) : ""}`.trim()
    : space
      ? spaceName(space, locale)
      : t(locale, "كل المحافظ", "All wallets");

  const title = t(locale, "كشف حساب تفصيلي", "Detailed account statement");
  const subtitle = account
    ? t(locale, "حركات حساب واحد بالإيداع والسحب مع الرصيد الجاري.", "One account: deposits, withdrawals and running balance.")
    : space
      ? t(locale, "كل حركات الجمعية أو المحفظة ككشف بنكي.", "Every movement in this wallet, like a bank statement.")
      : t(locale, "كشف موحّد لكل المحافظ والحسابات.", "Combined statement for every wallet and account.");

  let running = opening;
  const occurrenceByTxn = new Map((input.occurrences ?? []).filter((row) => row.transaction_id).map((row) => [String(row.transaction_id), row]));

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

  const body = rows.map((txn) => {
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
    const userName = member?.display_name || input.issuerName;
    const deposit = signed > 0 ? money(signed) : "—";
    const withdraw = signed < 0 ? money(-signed) : (!live && ["expense", "reimbursement"].includes(txn.kind) ? money(Number(txn.amount_minor) || 0) : "—");
    const status = live ? t(locale, "مرحّلة", "Posted") : t(locale, "ملغاة", "Voided");
    const when = formatStatementWhen(txn.occurred_at, locale);
    const desc = locale === "ar" ? txn.description_ar : txn.description_en;
    return { live, cells: [
      { text: when, cls: "col-date" },
      { text: txn.id.slice(0, 8).toUpperCase(), cls: "col-ref" },
      { text: desc, cls: "col-desc" },
      { text: item, cls: "col-item" },
      { text: `${place} → ${dest}`, cls: "col-flow" },
      { text: userName, cls: "col-user" },
      { text: deposit, cls: "num" },
      { text: withdraw, cls: "num" },
      { text: live ? money(running) : "—", cls: "num" },
      { text: status, cls: "col-status" },
    ] };
  });

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
    <p class="footer-note">${escapeHtml(t(locale, `الرصيد الختامي: ${money(closing)}`, `Closing balance: ${money(closing)}`))}</p>
  </section>`;

  return wrapPrintDocument({
    locale,
    title,
    entityName,
    logoUrl: input.logoUrl,
    subtitle,
    orientation: "landscape",
    meta: [
      { label: t(locale, "النطاق", "Scope"), value: entityName },
      { label: t(locale, "أُصدر بواسطة", "Issued by"), value: input.issuerName },
      { label: t(locale, "تاريخ الإصدار", "Issued at"), value: new Date().toLocaleString(locale === "ar" ? "ar-OM" : "en-GB") },
      { label: t(locale, "عدد الحركات", "Movements"), value: String(rows.length) },
    ],
    kpis: [
      { label: t(locale, "رصيد أول المدة", "Opening"), value: money(opening) },
      { label: t(locale, "إجمالي الإيداع", "Total in"), value: money(rows.filter((txn) => isLive(txn) && signedMinor(txn) > 0).reduce((sum, txn) => sum + signedMinor(txn), 0)) },
      { label: t(locale, "إجمالي السحب", "Total out"), value: money(-rows.filter((txn) => isLive(txn) && signedMinor(txn) < 0).reduce((sum, txn) => sum + signedMinor(txn), 0)) },
      { label: t(locale, "رصيد آخر المدة", "Closing"), value: money(closing) },
    ],
    bodyHtml: table,
  });
}
