"use client";

import { useEffect, useState } from "react";
import WazenLogo from "../../../components/brand/WazenLogo";
import { buildCombinedMemberLedgerHtml, formatMemberLedgerLineMoney, memberLedgerAmountClass, memberLedgerTone } from "../../../lib/member-ledger";
import { formatMoneyMinor } from "../../../lib/money";
import { downloadReportHtml, printWazenHtml, wrapPrintDocument } from "../../../lib/print-document";
import { escapeHtml } from "../../../lib/html";

type MemberLine = {
  at: string;
  titleAr: string;
  titleEn: string;
  detailAr: string;
  detailEn: string;
  amountMinor: number;
  direction: "in" | "out" | "info";
  focus: "paid" | "spent" | "owes" | "credit";
};

type AssociationLine = {
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

type MemberSection = {
  walletName: string;
  currency: string;
  joinedAt?: string | null;
  paidLabel: string;
  spentLabel: string;
  owesLabel: string;
  creditLabel: string;
  paidMinor: number;
  spentMinor: number;
  fundSpentMinor?: number;
  pocketSpentMinor?: number;
  pocketPaidMinor?: number;
  owesMinor: number;
  creditMinor: number;
  lines: MemberLine[];
};

type MemberPayload = {
  kind?: "member_statement";
  combined?: boolean;
  locale: "ar" | "en";
  focus: "all" | "paid" | "spent" | "owes" | "credit";
  focusLabel: string;
  title: string;
  memberName: string;
  walletName: string;
  phone?: string | null;
  email?: string | null;
  joinedAt?: string | null;
  currency: string;
  paidLabel: string;
  spentLabel: string;
  owesLabel: string;
  creditLabel: string;
  paidMinor: number;
  spentMinor: number;
  fundSpentMinor?: number;
  pocketSpentMinor?: number;
  pocketPaidMinor?: number;
  owesMinor: number;
  creditMinor: number;
  payInstruction?: string;
  lines: MemberLine[];
  sections?: MemberSection[];
};

type AssociationMember = {
  id: string;
  display_name: string;
  paid_minor: number;
  owes_minor: number;
  paidLabel: string;
  owesLabel: string;
  status: string;
};

type AssociationPayload = {
  kind: "association_statement";
  locale: "ar" | "en";
  filter: "full" | "valid" | "voided" | "all";
  sheetKind?: "movements" | "dues" | "dues_paid" | "dues_owing";
  filterLabel: string;
  title: string;
  subtitle: string;
  walletName: string;
  currency: string;
  openingLabel: string;
  closingLabel: string;
  totalInLabel: string;
  totalOutLabel: string;
  openingMinor: number;
  closingMinor: number;
  totalInMinor: number;
  totalOutMinor: number;
  movementCount: number;
  cashMinor?: number;
  cashLabel?: string;
  holdingsMinor?: number;
  holdingsLabel?: string;
  availableLabel?: string;
  expenseLabel?: string;
  members?: AssociationMember[];
  lines: AssociationLine[];
};

type StatementPayload = MemberPayload | AssociationPayload;

function typeLabel(focus: MemberLine["focus"], locale: "ar" | "en") {
  const map = {
    paid: locale === "ar" ? "مدفوع" : "Paid",
    spent: locale === "ar" ? "صرف" : "Spent",
    owes: locale === "ar" ? "عليه" : "Owes",
    credit: locale === "ar" ? "له" : "Credit",
  };
  return map[focus];
}

function isAssociation(data: StatementPayload): data is AssociationPayload {
  return data.kind === "association_statement";
}

function associationPrintHtml(data: AssociationPayload, logoUrl: string, verifyUrl?: string) {
  const ar = data.locale === "ar";
  const sheetKind = data.sheetKind ?? "movements";
  const isMembers = sheetKind !== "movements";
  const intro = data.subtitle
    || (ar
      ? `إليكم بيان حساب «${data.walletName}» للاطلاع والمتابعة.`
      : `Here is the account statement for “${data.walletName}” for your review.`);
  let bodyHtml = "";
  if (isMembers) {
    const members = data.members ?? [];
    const cards = members.map((row) => `<article class="statement-card">
      <header><strong>${escapeHtml(row.display_name)}</strong><em class="${row.owes_minor > 0 ? "neg" : ""}">${escapeHtml(row.owesLabel)}</em></header>
      <p>${escapeHtml(ar ? "مدفوع" : "Paid")}: ${escapeHtml(row.paidLabel)}</p>
      <footer><span>${escapeHtml(ar ? "متأخر حتى الشهر الحالي" : "Arrears")}</span><span class="${row.owes_minor > 0 ? "neg" : ""}">${escapeHtml(row.owesLabel)}</span></footer>
    </article>`).join("");
    const rows = members.map((row) => `<tr>
      <td>${escapeHtml(row.display_name)}</td>
      <td class="num">${escapeHtml(row.paidLabel)}</td>
      <td class="num ${row.owes_minor > 0 ? "neg" : ""}">${escapeHtml(row.owesLabel)}</td>
    </tr>`).join("");
    bodyHtml = `<section class="statement-members-section"><h2>${escapeHtml(data.filterLabel)}</h2>
      <div class="statement-table-wrap ops-desktop-table"><table>
        <thead><tr>
          <th>${escapeHtml(ar ? "العضو" : "Member")}</th>
          <th>${escapeHtml(ar ? "مدفوع" : "Paid")}</th>
          <th>${escapeHtml(ar ? "متأخر" : "Arrears")}</th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="3">${escapeHtml(ar ? "لا أسماء في هذا الكشف." : "No names on this sheet.")}</td></tr>`}</tbody>
      </table></div>
      <div class="statement-cards">${cards || `<p class="empty">${escapeHtml(ar ? "لا أسماء في هذا الكشف." : "No names on this sheet.")}</p>`}</div>
    </section>`;
  } else {
    const money = (minor: number) => formatMoneyMinor(minor, data.currency || "OMR", data.locale);
    const rows = data.lines.map((line) => {
      const cls = !line.live ? "voided" : "";
      return `<tr class="${cls}">
      <td>${escapeHtml(new Date(line.at).toLocaleDateString(ar ? "ar-OM" : "en-GB"))}</td>
      <td><strong>${escapeHtml(line.description)}</strong><small>${escapeHtml(line.item)} · ${escapeHtml(line.flow)}</small></td>
      <td class="num in">${line.depositMinor ? escapeHtml(money(line.depositMinor)) : "—"}</td>
      <td class="num out">${line.withdrawMinor ? escapeHtml(money(line.withdrawMinor)) : "—"}</td>
      <td class="num">${line.balanceMinor == null ? "—" : escapeHtml(money(line.balanceMinor))}</td>
    </tr>`;
    }).join("");
    bodyHtml = `<section><h2>${escapeHtml(ar ? "الحركات" : "Movements")}</h2>
    <table>
      <thead><tr>
        <th>${escapeHtml(ar ? "التاريخ" : "Date")}</th>
        <th>${escapeHtml(ar ? "البند" : "Item")}</th>
        <th>${escapeHtml(ar ? "إيداع" : "In")}</th>
        <th>${escapeHtml(ar ? "سحب" : "Out")}</th>
        <th>${escapeHtml(ar ? "الرصيد" : "Balance")}</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="5">${escapeHtml(ar ? "لا توجد حركات." : "No movements.")}</td></tr>`}</tbody>
    </table>
  </section>`;
  }
  return wrapPrintDocument({
    locale: data.locale,
    title: data.title,
    entityName: data.walletName,
    logoUrl,
    subtitle: intro,
    variant: "statement",
    orientation: isMembers ? "portrait" : "landscape",
    verifyUrl,
    meta: [
      { label: ar ? "الجمعية" : "Association", value: data.walletName },
      { label: ar ? "نوع الكشف" : "Statement type", value: data.filterLabel },
      isMembers
        ? { label: ar ? "عدد الأسماء" : "Names", value: String(data.members?.length ?? 0) }
        : { label: ar ? "عدد الحركات" : "Movements", value: String(data.movementCount) },
    ],
    kpis: isMembers
      ? [
        { label: ar ? "النقد" : "Cash", value: data.cashLabel ?? data.closingLabel },
        { label: ar ? "الودائع" : "Holdings", value: data.holdingsLabel ?? "—" },
        { label: ar ? "المتوفر (نقد + ودائع)" : "Available (cash + holdings)", value: data.availableLabel ?? "—" },
        { label: ar ? "المصروفات" : "Expenses", value: data.expenseLabel ?? "—" },
      ]
      : [
        { label: ar ? "أول المدة" : "Opening", value: data.openingLabel, tone: data.openingMinor < 0 ? "neg" : undefined },
        { label: ar ? "إيداع" : "In", value: data.totalInLabel },
        { label: ar ? "سحب" : "Out", value: data.totalOutLabel },
        { label: ar ? "آخر المدة" : "Closing", value: data.closingLabel, tone: data.closingMinor < 0 ? "neg" : undefined },
        ...(data.holdingsMinor && data.holdingsMinor > 0
          ? [
            { label: ar ? "الودائع" : "Holdings", value: data.holdingsLabel ?? "—" },
            { label: ar ? "المتوفر (نقد + ودائع)" : "Available", value: data.availableLabel ?? "—" },
          ]
          : []),
      ],
    bodyHtml,
  });
}

export default function StatementShareClient({ token }: { token: string }) {
  const [data, setData] = useState<StatementPayload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"print" | "download" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/statement/${encodeURIComponent(token)}`, { cache: "no-store" });
        const result = await response.json() as StatementPayload & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "STATEMENT_NOT_FOUND");
        if (!cancelled) setData(result);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "STATEMENT_NOT_FOUND");
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const printOrDownload = async (mode: "print" | "download") => {
    if (!data) return;
    setBusy(mode);
    try {
      if (isAssociation(data)) {
        const htmlBuilder = (logoUrl: string) => associationPrintHtml(data, logoUrl, window.location.href);
        if (mode === "print") await printWazenHtml(htmlBuilder, true);
        else {
          const logoUrl = `${window.location.origin}/brand/wazen-lockup.png`;
          await downloadReportHtml(htmlBuilder(logoUrl), `statement-${data.walletName.slice(0, 24)}`);
        }
        return;
      }

      const htmlBuilder = (logoUrl: string) => {
        const sections = (data.sections?.length ? data.sections : [{
          walletName: data.walletName,
          currency: data.currency,
          joinedAt: data.joinedAt,
          paidMinor: data.paidMinor,
          spentMinor: data.spentMinor,
          fundSpentMinor: data.fundSpentMinor,
          pocketSpentMinor: data.pocketSpentMinor,
          pocketPaidMinor: data.pocketPaidMinor,
          owesMinor: data.owesMinor,
          creditMinor: data.creditMinor,
          lines: data.lines,
        }]).map((section) => ({
          spaceName: section.walletName,
          currency: section.currency,
          joinedAt: section.joinedAt ?? undefined,
          ledger: {
            paidMinor: section.paidMinor,
            addonMinor: section.spentMinor,
            fundSpentMinor: section.fundSpentMinor,
            pocketSpentMinor: section.pocketSpentMinor,
            pocketPaidMinor: section.pocketPaidMinor,
            owesMinor: section.owesMinor,
            creditMinor: section.creditMinor,
            lines: section.lines,
          },
        }));
        return buildCombinedMemberLedgerHtml({
          locale: data.locale,
          logoUrl,
          issuerName: "WAZEN",
          memberName: data.memberName,
          phone: data.phone,
          email: data.email,
          focus: data.focus,
          sections,
        });
      };
      if (mode === "print") {
        await printWazenHtml(htmlBuilder, true);
      } else {
        const logoUrl = `${window.location.origin}/brand/wazen-lockup.png`;
        await downloadReportHtml(htmlBuilder(logoUrl), `wazen-statement-${data.memberName.slice(0, 20)}`);
      }
    } finally {
      setBusy(null);
    }
  };

  const locale = data?.locale ?? "ar";

  return (
    <main className="receipt-share-page statement-share-page" dir={locale === "ar" ? "rtl" : "ltr"} lang={locale}>
      <header className="receipt-share-top">
        <WazenLogo showText iconClassName="receipt-share-logo" />
      </header>
      {!data && !error && <p className="receipt-share-status">{locale === "ar" ? "جارٍ تحميل الكشف…" : "Loading statement…"}</p>}
      {error && <p className="receipt-share-error">{locale === "ar" ? "رابط الكشف غير صالح أو منتهٍ." : "This statement link is invalid or expired."}</p>}
      {data && isAssociation(data) && (
        <article className="receipt-share-card statement-share-card">
          <div className="receipt-share-accent" aria-hidden="true" />
          <div className="statement-share-toolbar">
            <button type="button" className="primary-button" disabled={busy !== null} onClick={() => void printOrDownload("print")}>
              {busy === "print" ? "…" : (locale === "ar" ? "طباعة" : "Print")}
            </button>
            <button type="button" className="secondary-button" disabled={busy !== null} onClick={() => void printOrDownload("download")}>
              {busy === "download" ? "…" : (locale === "ar" ? "تنزيل / فتح" : "Download / open")}
            </button>
          </div>
          <p className="receipt-share-eyebrow">{data.walletName}</p>
          <h1>{data.title}</h1>
          <p className="receipt-share-date">{data.subtitle}</p>

          {(data.sheetKind ?? "movements") === "movements" ? (
            <div className="statement-share-kpis">
              <div><span>{locale === "ar" ? "أول المدة" : "Opening"}</span><strong className={data.openingMinor < 0 ? "amount-negative" : ""}>{data.openingLabel}</strong></div>
              <div><span>{locale === "ar" ? "إيداع" : "In"}</span><strong>{data.totalInLabel}</strong></div>
              <div><span>{locale === "ar" ? "سحب" : "Out"}</span><strong>{data.totalOutLabel}</strong></div>
              <div><span>{locale === "ar" ? "آخر المدة" : "Closing"}</span><strong className={data.closingMinor < 0 ? "amount-negative" : ""}>{data.closingLabel}</strong></div>
              {(data.holdingsMinor ?? 0) > 0 ? (
                <>
                  <div><span>{locale === "ar" ? "الودائع" : "Holdings"}</span><strong>{data.holdingsLabel}</strong></div>
                  <div><span>{locale === "ar" ? "المتوفر (نقد + ودائع)" : "Available"}</span><strong>{data.availableLabel}</strong></div>
                </>
              ) : null}
            </div>
          ) : (
            <div className="statement-share-kpis">
              <div><span>{locale === "ar" ? "النقد" : "Cash"}</span><strong>{data.cashLabel ?? data.closingLabel}</strong></div>
              <div><span>{locale === "ar" ? "الودائع" : "Holdings"}</span><strong>{data.holdingsLabel ?? "—"}</strong></div>
              <div><span>{locale === "ar" ? "المتوفر (نقد + ودائع)" : "Available (cash + holdings)"}</span><strong>{data.availableLabel ?? "—"}</strong></div>
              <div><span>{locale === "ar" ? "المصروفات" : "Expenses"}</span><strong>{data.expenseLabel ?? "—"}</strong></div>
            </div>
          )}

          <dl className="statement-share-meta">
            <div><dt>{locale === "ar" ? "الجمعية" : "Association"}</dt><dd>{data.walletName}</dd></div>
            <div><dt>{locale === "ar" ? "نوع الكشف" : "Type"}</dt><dd>{data.filterLabel}</dd></div>
            <div>
              <dt>{(data.sheetKind ?? "movements") === "movements" ? (locale === "ar" ? "عدد الحركات" : "Movements") : (locale === "ar" ? "عدد الأسماء" : "Names")}</dt>
              <dd>{(data.sheetKind ?? "movements") === "movements" ? data.movementCount : (data.members?.length ?? 0)}</dd>
            </div>
          </dl>

          {(data.sheetKind ?? "movements") !== "movements" ? (
            <section className="statement-share-lines">
              <h2>{locale === "ar" ? "الأسماء" : "Names"}</h2>
              {data.members?.length ? data.members.map((member) => (
                <article key={member.id} className={`statement-share-line ${member.owes_minor > 0 ? "is-out" : "is-in"}`}>
                  <header>
                    <strong>{member.display_name}</strong>
                    <em className={member.owes_minor > 0 ? "amount-negative" : "amount-positive"}>{member.owesLabel}</em>
                  </header>
                  <p>{locale === "ar" ? "مدفوع" : "Paid"} · {member.paidLabel}</p>
                  <footer>
                    <span>{locale === "ar" ? "متأخر حتى الشهر الحالي" : "Arrears to current month"}</span>
                    <span className={member.owes_minor > 0 ? "amount-negative" : ""}>{member.owesLabel}</span>
                  </footer>
                </article>
              )) : (
                <p className="receipt-share-status">{locale === "ar" ? "لا أسماء في هذا الكشف." : "No names on this sheet."}</p>
              )}
            </section>
          ) : (
            <section className="statement-share-lines">
              <h2>{locale === "ar" ? "الحركات" : "Movements"}</h2>
              {data.lines.length ? data.lines.map((line, index) => {
                const amountMinor = line.depositMinor || -line.withdrawMinor;
                const amount = formatMoneyMinor(amountMinor, data.currency || "OMR", locale);
                return (
                  <article key={`${line.ref}:${index}`} className={`statement-share-line is-${line.depositMinor > 0 ? "in" : line.withdrawMinor > 0 ? "out" : "info"}`}>
                    <header>
                      <strong>{line.description}</strong>
                      <em className={line.withdrawMinor > 0 ? "amount-negative" : line.depositMinor > 0 ? "amount-positive" : ""}>{amount}</em>
                    </header>
                    <p>{line.item} · {line.flow}</p>
                    <footer>
                      <span>{new Date(line.at).toLocaleString(locale === "ar" ? "ar-OM" : "en-GB")}</span>
                      <span>{line.ref} · {line.status}</span>
                    </footer>
                  </article>
                );
              }) : (
                <p className="receipt-share-status">{locale === "ar" ? "لا توجد حركات في هذا القسم." : "No movements in this section."}</p>
              )}
            </section>
          )}

          <p className="receipt-share-foot">
            {locale === "ar"
              ? `كشف «${data.walletName}» — للطباعة أو الحفظ كـ PDF استخدم الأزرار أعلاه`
              : `Statement for “${data.walletName}” — use the buttons above to print or save as PDF`}
          </p>
        </article>
      )}
      {data && !isAssociation(data) && (
        <article className="receipt-share-card statement-share-card">
          <div className="receipt-share-accent" aria-hidden="true" />
          <div className="statement-share-toolbar">
            <button type="button" className="primary-button" disabled={busy !== null} onClick={() => void printOrDownload("print")}>
              {busy === "print" ? "…" : (locale === "ar" ? "طباعة" : "Print")}
            </button>
            <button type="button" className="secondary-button" disabled={busy !== null} onClick={() => void printOrDownload("download")}>
              {busy === "download" ? "…" : (locale === "ar" ? "تنزيل / فتح" : "Download / open")}
            </button>
          </div>
          <p className="receipt-share-eyebrow">{data.walletName}</p>
          <h1>{data.title}</h1>
          <p className="receipt-share-date">{data.memberName} · {data.focusLabel}</p>

          <div className="statement-share-kpis">
            <div><span>{locale === "ar" ? "المدفوع" : "Paid"}</span><strong className="amount-positive">{data.paidLabel}</strong></div>
            <div><span>{locale === "ar" ? "الصرف" : "Spent"}</span><strong className={data.spentMinor ? "amount-negative" : ""}>{data.spentLabel}</strong></div>
            <div><span>{locale === "ar" ? "عليه" : "Owes"}</span><strong className={data.owesMinor ? "amount-negative" : ""}>{data.owesLabel}</strong></div>
            <div><span>{locale === "ar" ? "له" : "Credit"}</span><strong className={data.creditMinor ? "amount-positive" : ""}>{data.creditLabel}</strong></div>
          </div>
          {(data.fundSpentMinor ?? 0) > 0 || (data.pocketSpentMinor ?? 0) > 0 ? (
            <p className="receipt-share-date">
              {locale === "ar"
                ? `صُرف له من الصندوق ${formatMoneyMinor(data.fundSpentMinor ?? 0, data.currency, locale)} · صُرف له شخصياً (فواتير الأعضاء) ${formatMoneyMinor(data.pocketSpentMinor ?? 0, data.currency, locale)} · دفع من جيبه ${formatMoneyMinor(data.pocketPaidMinor ?? 0, data.currency, locale)}`
                : `Spent for him from fund ${formatMoneyMinor(data.fundSpentMinor ?? 0, data.currency, locale)} · personally (member bills) ${formatMoneyMinor(data.pocketSpentMinor ?? 0, data.currency, locale)} · paid from pocket ${formatMoneyMinor(data.pocketPaidMinor ?? 0, data.currency, locale)}`}
            </p>
          ) : null}
          {data.payInstruction ? (
            <p className="statement-share-pay">{locale === "ar" ? "كيف تسدّد: " : "How to pay: "}{data.payInstruction}</p>
          ) : null}

          <dl className="statement-share-meta">
            <div><dt>{locale === "ar" ? "العضو" : "Member"}</dt><dd>{data.memberName}</dd></div>
            <div><dt>{locale === "ar" ? "الجمعية" : "Association"}</dt><dd>{data.walletName}</dd></div>
            <div><dt>{locale === "ar" ? "الهاتف" : "Phone"}</dt><dd>{data.phone || "—"}</dd></div>
            <div><dt>{locale === "ar" ? "البريد" : "Email"}</dt><dd>{data.email || "—"}</dd></div>
          </dl>

          <section className="statement-share-lines">
            {(data.combined && data.sections?.length ? data.sections : [{
              walletName: data.walletName,
              currency: data.currency,
              paidLabel: data.paidLabel,
              spentLabel: data.spentLabel,
              owesLabel: data.owesLabel,
              creditLabel: data.creditLabel,
              paidMinor: data.paidMinor,
              spentMinor: data.spentMinor,
              owesMinor: data.owesMinor,
              creditMinor: data.creditMinor,
              lines: data.lines,
            }]).map((section, sectionIndex) => (
              <div key={`${section.walletName}:${sectionIndex}`} className="statement-share-association">
                <h2>{sectionIndex + 1}. {section.walletName}</h2>
                <div className="statement-share-table-wrap">
                  <table className="statement-share-totals">
                    <thead>
                      <tr>
                        <th>{locale === "ar" ? "المدفوع" : "Paid"}</th>
                        <th>{locale === "ar" ? "الصرف" : "Spent"}</th>
                        <th>{locale === "ar" ? "عليه" : "Owes"}</th>
                        <th>{locale === "ar" ? "له" : "Credit"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="amount-positive">{section.paidLabel}</td>
                        <td className={section.spentMinor ? "amount-negative" : ""}>{section.spentLabel}</td>
                        <td className={section.owesMinor ? "amount-negative" : ""}>{section.owesLabel}</td>
                        <td className={section.creditMinor ? "amount-positive" : ""}>{section.creditLabel}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {section.lines.length ? (
                  <div className="statement-share-table-wrap">
                    <table className="statement-share-movements">
                      <thead>
                        <tr>
                          <th>{locale === "ar" ? "التاريخ" : "Date"}</th>
                          <th>{locale === "ar" ? "البند" : "Item"}</th>
                          <th>{locale === "ar" ? "النوع" : "Type"}</th>
                          <th>{locale === "ar" ? "المبلغ" : "Amount"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.lines.map((line, index) => {
                          const amount = formatMemberLedgerLineMoney(line, section.currency || data.currency || "OMR", locale);
                          const tone = memberLedgerTone(line);
                          return (
                            <tr key={`${section.walletName}:${line.at}:${index}`} className={`is-${tone}`}>
                              <td>{new Date(line.at).toLocaleString(locale === "ar" ? "ar-OM" : "en-GB")}</td>
                              <td>
                                <strong className="ledger-item-title">
                                  {locale === "ar" ? line.titleAr : line.titleEn}
                                  {tone === "paid" ? <em className="ledger-kind-badge">{locale === "ar" ? "دفع" : "Paid"}</em> : null}
                                </strong>
                                <small>{locale === "ar" ? line.detailAr : line.detailEn}</small>
                              </td>
                              <td>{typeLabel(line.focus, locale)}</td>
                              <td className={memberLedgerAmountClass(line)}>{amount}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="receipt-share-status">{locale === "ar" ? "لا توجد حركات في هذا القسم." : "No movements in this section."}</p>
                )}
              </div>
            ))}
          </section>

          <p className="receipt-share-foot">
            {locale === "ar"
              ? "هذا كشف إلكتروني من موقع وازن — واضح على الجوال والكمبيوتر"
              : "This is an electronic statement from Wazen — clear on phone and desktop"}
          </p>
        </article>
      )}
    </main>
  );
}
