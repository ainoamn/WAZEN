"use client";

import { useEffect, useState } from "react";
import WazenLogo from "../../../components/brand/WazenLogo";
import { downloadReportHtml, printWazenHtml, wrapPrintDocument } from "../../../lib/print-document";
import { escapeHtml } from "../../../lib/html";

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
  return `<section><h2>${escapeHtml(data.title)}</h2><table>
    <tr><td>${l === "ar" ? "الوصف" : "Description"}</td><td>${escapeHtml(data.description)}</td></tr>
    <tr><td>${l === "ar" ? "المحفظة" : "Wallet"}</td><td>${escapeHtml(data.walletName)}</td></tr>
    <tr><td>${l === "ar" ? "المساهم" : "Member"}</td><td>${escapeHtml(data.memberName)}</td></tr>
    <tr><td>${l === "ar" ? "المبلغ" : "Amount"}</td><td>${escapeHtml(data.amountLabel)}</td></tr>
    <tr><td>${l === "ar" ? "التاريخ" : "Date"}</td><td>${escapeHtml(data.dateLabel)}</td></tr>
    <tr><td>${l === "ar" ? "المرجع" : "Reference"}</td><td>${escapeHtml(data.reference)}</td></tr>
  </table></section>`;
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
          <h1>{data.title}</h1>
          <dl>
            <div><dt>{locale === "ar" ? "الوصف" : "Description"}</dt><dd>{data.description}</dd></div>
            <div><dt>{locale === "ar" ? "المحفظة" : "Wallet"}</dt><dd>{data.walletName}</dd></div>
            <div><dt>{locale === "ar" ? "المساهم" : "Member"}</dt><dd>{data.memberName}</dd></div>
            <div><dt>{locale === "ar" ? "المبلغ" : "Amount"}</dt><dd>{data.amountLabel}</dd></div>
            <div><dt>{locale === "ar" ? "التاريخ" : "Date"}</dt><dd>{data.dateLabel}</dd></div>
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
