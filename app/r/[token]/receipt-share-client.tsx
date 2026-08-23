"use client";

import { useEffect, useState } from "react";
import WazenLogo from "../../../components/brand/WazenLogo";
import { buildReceiptBodyHtml, downloadReportHtml, printWazenHtml, wrapPrintDocument } from "../../../lib/print-document";

type ReceiptPayload = {
  locale: "ar" | "en";
  title: string;
  memberName: string;
  description: string;
  walletName: string;
  amountLabel: string;
  dateLabel: string;
  reference: string;
  kind: string;
  occurredAt: string;
};

function receiptBodyHtml(data: ReceiptPayload) {
  const l = data.locale;
  return buildReceiptBodyHtml({
    locale: l,
    amountLabel: data.amountLabel,
    fields: [
      { label: l === "ar" ? "الوصف" : "Description", value: data.description },
      { label: l === "ar" ? "المحفظة" : "Wallet", value: data.walletName },
      { label: l === "ar" ? "المساهم" : "Member", value: data.memberName },
      { label: l === "ar" ? "التاريخ" : "Date", value: data.dateLabel },
      { label: l === "ar" ? "النوع" : "Type", value: data.kind },
    ],
    reference: data.reference,
  });
}

export default function ReceiptShareClient({ token }: { token: string }) {
  const [data, setData] = useState<ReceiptPayload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"print" | "download" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/receipt/${encodeURIComponent(token)}`, { cache: "no-store" });
        const result = await response.json() as ReceiptPayload & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "RECEIPT_NOT_FOUND");
        if (!cancelled) setData(result);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "RECEIPT_NOT_FOUND");
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const print = async () => {
    if (!data) return;
    setBusy("print");
    try {
      await printWazenHtml((logoUrl) => wrapPrintDocument({
        locale: data.locale,
        title: data.title,
        entityName: data.walletName,
        logoUrl,
        subtitle: data.dateLabel,
        bodyHtml: receiptBodyHtml(data),
      }), true);
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    if (!data) return;
    setBusy("download");
    try {
      const logoUrl = `${window.location.origin}/brand/wazen-lockup.png`;
      const html = wrapPrintDocument({
        locale: data.locale,
        title: data.title,
        entityName: data.walletName,
        logoUrl,
        subtitle: data.dateLabel,
        bodyHtml: receiptBodyHtml(data),
      });
      await downloadReportHtml(html, `wazen-receipt-${data.reference}`);
    } finally {
      setBusy(null);
    }
  };

  const locale = data?.locale ?? "ar";

  return (
    <main className="receipt-share-page" dir={locale === "ar" ? "rtl" : "ltr"} lang={locale}>
      <header className="receipt-share-top">
        <WazenLogo showText iconClassName="receipt-share-logo" />
      </header>
      {!data && !error && <p className="receipt-share-status">{locale === "ar" ? "جارٍ تحميل الإيصال…" : "Loading receipt…"}</p>}
      {error && <p className="receipt-share-error">{locale === "ar" ? "رابط الإيصال غير صالح أو منتهٍ." : "This receipt link is invalid or expired."}</p>}
      {data && (
        <article className="receipt-share-card">
          <div className="receipt-share-accent" aria-hidden="true" />
          <p className="receipt-share-eyebrow">{data.walletName}</p>
          <h1>{data.title}</h1>
          <p className="receipt-share-date">{data.dateLabel}</p>
          <div className="receipt-share-amount">
            <span>{locale === "ar" ? "المبلغ" : "Amount"}</span>
            <strong>{data.amountLabel}</strong>
          </div>
          <dl>
            <div><dt>{locale === "ar" ? "الوصف" : "Description"}</dt><dd>{data.description}</dd></div>
            <div><dt>{locale === "ar" ? "المساهم" : "Member"}</dt><dd>{data.memberName}</dd></div>
            <div><dt>{locale === "ar" ? "النوع" : "Type"}</dt><dd>{data.kind}</dd></div>
            <div><dt>{locale === "ar" ? "المرجع" : "Reference"}</dt><dd>{data.reference}</dd></div>
          </dl>
          <div className="receipt-share-actions">
            <button type="button" className="primary-button" disabled={busy !== null} onClick={() => void download()}>
              {busy === "download" ? "…" : (locale === "ar" ? "تنزيل PDF" : "Download PDF")}
            </button>
            <button type="button" className="secondary-button" disabled={busy !== null} onClick={() => void print()}>
              {busy === "print" ? "…" : (locale === "ar" ? "فتح للطباعة" : "Open to print")}
            </button>
          </div>
        </article>
      )}
    </main>
  );
}
