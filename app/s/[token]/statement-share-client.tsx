"use client";

import { useEffect, useState } from "react";
import WazenLogo from "../../../components/brand/WazenLogo";
import { buildCombinedMemberLedgerHtml, formatMemberLedgerLineMoney, memberLedgerAmountClass, memberLedgerTone } from "../../../lib/member-ledger";
import { formatMoneyMinor } from "../../../lib/money";
import { downloadReportHtml, printWazenHtml } from "../../../lib/print-document";

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
  owesMinor: number;
  creditMinor: number;
  lines: MemberLine[];
  sections?: MemberSection[];
};

type AssociationPayload = {
  kind: "association_statement";
  locale: "ar" | "en";
  filter: "full" | "valid" | "voided" | "all";
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
        const htmlBuilder = (logoUrl: string) => {
          const money = (minor: number) => new Intl.NumberFormat(data.locale === "ar" ? "ar-OM" : "en-OM", {
            style: "currency",
            currency: data.currency || "OMR",
            minimumFractionDigits: 3,
            maximumFractionDigits: 3,
          }).format(minor / 1000);
          const rows = data.lines.map((line) => {
            const signed = line.depositMinor - line.withdrawMinor;
            return `<article class="statement-card"><header><strong>${line.description}</strong><em>${money(signed)}</em></header>
              <p>${line.item} · ${line.flow}</p>
              <footer><span>${new Date(line.at).toLocaleString(data.locale === "ar" ? "ar-OM" : "en-GB")}</span><span>${line.ref} · ${line.status}</span></footer></article>`;
          }).join("");
          return `<!doctype html><html lang="${data.locale}" dir="${data.locale === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"/><title>${data.title}</title>
            <style>body{font-family:Tahoma,Arial,sans-serif;padding:16px;background:#f7f4ef;color:#1c1917}
            .brand{display:flex;align-items:center;gap:10px;margin-bottom:12px}.brand img{height:36px}
            h1{font-size:1.35rem;margin:0 0 6px}.meta{opacity:.75;margin-bottom:14px}
            .kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:14px}
            .kpis div{background:#fff;border:1px solid #e7e0d6;border-radius:12px;padding:10px}
            .kpis span{display:block;font-size:.75rem;opacity:.7}.kpis strong{font-size:1rem}
            .statement-card{background:#fff;border:1px solid #e7e0d6;border-radius:14px;padding:12px;margin-bottom:8px}
            .statement-card header{display:flex;justify-content:space-between;gap:8px}
            .statement-card footer{display:flex;justify-content:space-between;font-size:.78rem;opacity:.7;margin-top:6px}
            @media print{body{background:#fff}}</style></head><body>
            <div class="brand"><img src="${logoUrl}" alt="WAZEN"/><strong>WAZEN</strong></div>
            <h1>${data.title}</h1><p class="meta">${data.walletName} · ${data.filterLabel}</p>
            <div class="kpis">
              <div><span>${data.locale === "ar" ? "أول المدة" : "Opening"}</span><strong>${data.openingLabel}</strong></div>
              <div><span>${data.locale === "ar" ? "إيداع" : "In"}</span><strong>${data.totalInLabel}</strong></div>
              <div><span>${data.locale === "ar" ? "سحب" : "Out"}</span><strong>${data.totalOutLabel}</strong></div>
              <div><span>${data.locale === "ar" ? "آخر المدة" : "Closing"}</span><strong>${data.closingLabel}</strong></div>
            </div>
            ${rows || `<p>${data.locale === "ar" ? "لا توجد حركات." : "No movements."}</p>`}
            </body></html>`;
        };
        if (mode === "print") await printWazenHtml(htmlBuilder, true);
        else {
          const logoUrl = `${window.location.origin}/brand/wazen-lockup.png`;
          await downloadReportHtml(htmlBuilder(logoUrl), `wazen-association-${data.walletName.slice(0, 20)}`);
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

          <div className="statement-share-kpis">
            <div><span>{locale === "ar" ? "أول المدة" : "Opening"}</span><strong className={data.openingMinor < 0 ? "amount-negative" : ""}>{data.openingLabel}</strong></div>
            <div><span>{locale === "ar" ? "إيداع" : "In"}</span><strong>{data.totalInLabel}</strong></div>
            <div><span>{locale === "ar" ? "سحب" : "Out"}</span><strong>{data.totalOutLabel}</strong></div>
            <div><span>{locale === "ar" ? "آخر المدة" : "Closing"}</span><strong className={data.closingMinor < 0 ? "amount-negative" : ""}>{data.closingLabel}</strong></div>
          </div>

          <dl className="statement-share-meta">
            <div><dt>{locale === "ar" ? "المحفظة" : "Wallet"}</dt><dd>{data.walletName}</dd></div>
            <div><dt>{locale === "ar" ? "نوع الكشف" : "Type"}</dt><dd>{data.filterLabel}</dd></div>
            <div><dt>{locale === "ar" ? "عدد الحركات" : "Movements"}</dt><dd>{data.movementCount}</dd></div>
          </dl>

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

          <p className="receipt-share-foot">
            {locale === "ar"
              ? "هذا كشف جمعية إلكتروني من موقع وازن — واضح على الجوال والكمبيوتر"
              : "This is an electronic association statement from Wazen — clear on phone and desktop"}
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
