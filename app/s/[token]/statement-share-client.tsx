"use client";

import { useEffect, useState } from "react";
import WazenLogo from "../../../components/brand/WazenLogo";
import { buildMemberLedgerHtml } from "../../../lib/member-ledger";
import { downloadReportHtml, printWazenHtml } from "../../../lib/print-document";

type StatementLine = {
  at: string;
  titleAr: string;
  titleEn: string;
  detailAr: string;
  detailEn: string;
  amountMinor: number;
  direction: "in" | "out" | "info";
  focus: "paid" | "spent" | "owes" | "credit";
};

type StatementPayload = {
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
  lines: StatementLine[];
};

function typeLabel(focus: StatementLine["focus"], locale: "ar" | "en") {
  const map = {
    paid: locale === "ar" ? "مدفوع" : "Paid",
    spent: locale === "ar" ? "صرف" : "Spent",
    owes: locale === "ar" ? "عليه" : "Owes",
    credit: locale === "ar" ? "له" : "Credit",
  };
  return map[focus];
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
      const htmlBuilder = (logoUrl: string) => buildMemberLedgerHtml({
        locale: data.locale,
        logoUrl,
        issuerName: "WAZEN",
        memberName: data.memberName,
        spaceName: data.walletName,
        currency: data.currency,
        joinedAt: data.joinedAt ?? undefined,
        phone: data.phone,
        email: data.email,
        focus: data.focus,
        ledger: {
          paidMinor: data.paidMinor,
          addonMinor: data.spentMinor,
          owesMinor: data.owesMinor,
          creditMinor: data.creditMinor,
          lines: data.lines,
        },
      });
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
      {data && (
        <article className="receipt-share-card statement-share-card">
          <div className="receipt-share-accent" aria-hidden="true" />
          <p className="receipt-share-eyebrow">{data.walletName}</p>
          <h1>{data.title}</h1>
          <p className="receipt-share-date">{data.memberName} · {data.focusLabel}</p>

          <div className="statement-share-kpis">
            <div><span>{locale === "ar" ? "المدفوع" : "Paid"}</span><strong>{data.paidLabel}</strong></div>
            <div><span>{locale === "ar" ? "الصرف" : "Spent"}</span><strong>{data.spentLabel}</strong></div>
            <div><span>{locale === "ar" ? "عليه" : "Owes"}</span><strong>{data.owesLabel}</strong></div>
            <div><span>{locale === "ar" ? "له" : "Credit"}</span><strong>{data.creditLabel}</strong></div>
          </div>

          <dl className="statement-share-meta">
            <div><dt>{locale === "ar" ? "العضو" : "Member"}</dt><dd>{data.memberName}</dd></div>
            <div><dt>{locale === "ar" ? "الجمعية" : "Association"}</dt><dd>{data.walletName}</dd></div>
            <div><dt>{locale === "ar" ? "الهاتف" : "Phone"}</dt><dd>{data.phone || "—"}</dd></div>
            <div><dt>{locale === "ar" ? "البريد" : "Email"}</dt><dd>{data.email || "—"}</dd></div>
          </dl>

          <section className="statement-share-lines">
            <h2>{locale === "ar" ? "الحركات" : "Movements"}</h2>
            {data.lines.length ? data.lines.map((line, index) => {
              const amount = new Intl.NumberFormat(locale === "ar" ? "ar-OM" : "en-OM", {
                style: "currency",
                currency: data.currency || "OMR",
                minimumFractionDigits: 3,
                maximumFractionDigits: 3,
              }).format((line.amountMinor || 0) / 1000);
              return (
                <article key={`${line.at}:${index}`} className={`statement-share-line is-${line.direction}`}>
                  <header>
                    <strong>{locale === "ar" ? line.titleAr : line.titleEn}</strong>
                    <em className={line.direction === "out" ? "amount-negative" : line.direction === "in" ? "amount-positive" : ""}>{amount}</em>
                  </header>
                  <p>{locale === "ar" ? line.detailAr : line.detailEn}</p>
                  <footer>
                    <span>{new Date(line.at).toLocaleString(locale === "ar" ? "ar-OM" : "en-GB")}</span>
                    <span>{typeLabel(line.focus, locale)}</span>
                  </footer>
                </article>
              );
            }) : (
              <p className="receipt-share-status">{locale === "ar" ? "لا توجد حركات في هذا القسم." : "No movements in this section."}</p>
            )}
          </section>

          <div className="receipt-share-actions">
            <button type="button" className="primary-button" disabled={busy !== null} onClick={() => void printOrDownload("download")}>
              {busy === "download" ? "…" : (locale === "ar" ? "تنزيل / فتح" : "Download / open")}
            </button>
            <button type="button" className="secondary-button" disabled={busy !== null} onClick={() => void printOrDownload("print")}>
              {busy === "print" ? "…" : (locale === "ar" ? "فتح للطباعة" : "Open to print")}
            </button>
          </div>
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
