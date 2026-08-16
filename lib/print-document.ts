import { escapeHtml } from "./html.ts";

const OFFICIAL_LOCKUP = "/brand/wazen-lockup.png";
/** A4 width at 96dpi — html2canvas capture width so tables scale to a real page, not a cropped browser tab. */
const A4_CSS_PX = 794;

let logoDataUrl: string | null = null;
let logoPromise: Promise<string> | null = null;

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Official site lockup, embedded so print/preview never depends on a second HTTP fetch. */
export async function resolvePrintLogoUrl() {
  if (logoDataUrl) return logoDataUrl;
  if (typeof window === "undefined") return OFFICIAL_LOCKUP;
  if (!logoPromise) {
    logoPromise = fetch(OFFICIAL_LOCKUP, { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error("LOGO_FETCH_FAILED");
        return response.blob();
      })
      .then(blobToDataUrl)
      .then((url) => {
        logoDataUrl = url;
        return url;
      })
      .catch(() => {
        logoPromise = null;
        return `${window.location.origin}${OFFICIAL_LOCKUP}`;
      });
  }
  return logoPromise;
}

export const PRINT_DOCUMENT_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
@page { size: A4; margin: 12mm; }
body { margin: 0; font-family: "Segoe UI", Tahoma, Arial, sans-serif; color: #14221f; background: #f4f7f5; }
.print-actions { position: sticky; top: 0; z-index: 5; display: flex; justify-content: flex-end; gap: 8px; padding: 10px 16px; background: #fff; border-bottom: 1px solid #e5ebe7; }
.print-actions button { border: 0; border-radius: 10px; padding: 10px 16px; background: #0d7a65; color: #fff; font-weight: 700; cursor: pointer; }
.sheet { max-width: 960px; margin: 20px auto 40px; background: white; border: 1px solid #d7e0db; border-radius: 18px; overflow: visible; }
.brand-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 24px; background: #fff; border-bottom: 3px solid #0d7a65; }
.brand-bar img { height: 48px; width: auto; }
.brand-bar small { display: block; color: #66766f; font-size: 11px; }
.brand-bar strong { font-size: 15px; color: #143a36; }
.head { padding: 22px 24px 8px; }
.head h1 { margin: 0 0 6px; font-size: 24px; color: #0d7a65; }
.head p { margin: 0; color: #66766f; font-size: 14px; }
.meta { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px 18px; margin: 14px 24px; padding: 12px 14px; border: 1px solid #e5ebe7; border-radius: 12px; background: #fbfcfb; }
.meta span { color: #809089; font-size: 12px; display: block; }
.meta b { font-size: 14px; }
.kpis { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 10px; padding: 0 24px 16px; }
.kpi { border: 1px solid #e5ebe7; border-radius: 12px; padding: 10px 12px; }
.kpi span { display: block; color: #809089; font-size: 12px; margin-bottom: 4px; }
section { padding: 8px 24px 20px; }
section h2 { margin: 0 0 10px; font-size: 16px; color: #244c56; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { padding: 8px 6px; border-bottom: 1px solid #e8eeea; text-align: start; vertical-align: top; }
th { color: #66766f; font-size: 11px; background: #f3f7f5; }
.num { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
.in { color: #0d7a65; font-weight: 700; }
.out { color: #a84d58; font-weight: 700; }
.voided td { text-decoration: line-through; color: #809089; }
.footer-note { margin: 10px 0 0; font-weight: 700; color: #0d7a65; }
.empty { color: #809089; }
footer.sheet-foot { padding: 16px 24px 24px; color: #809089; font-size: 12px; border-top: 1px solid #eef2f0; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
@media print {
  body { background: white; }
  .print-actions { display: none !important; }
  .sheet { margin: 0; border: 0; border-radius: 0; max-width: none; overflow: visible; }
  .brand-bar, th { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
@media (max-width: 760px) { .kpis, .meta { grid-template-columns: 1fr 1fr; } }
`;

export function wrapPrintDocument(options: {
  locale: "ar" | "en";
  title: string;
  entityName: string;
  logoUrl: string;
  subtitle?: string;
  meta?: Array<{ label: string; value: string }>;
  kpis?: Array<{ label: string; value: string }>;
  bodyHtml: string;
  footer?: string;
}) {
  const dir = options.locale === "ar" ? "rtl" : "ltr";
  const printLabel = options.locale === "ar" ? "طباعة المستند" : "Print document";
  const metaHtml = (options.meta ?? [])
    .map((item) => `<div><span>${escapeHtml(item.label)}</span><b>${escapeHtml(item.value)}</b></div>`)
    .join("");
  const kpiHtml = (options.kpis ?? [])
    .map((item) => `<div class="kpi"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`)
    .join("");
  return `<!doctype html>
<html lang="${options.locale}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(options.title)} · ${escapeHtml(options.entityName)}</title>
  <style>${PRINT_DOCUMENT_CSS}</style>
</head>
<body>
  <div class="print-actions"><button type="button" onclick="window.print()">${escapeHtml(printLabel)}</button></div>
  <article class="sheet">
    <div class="brand-bar">
      <img src="${escapeHtml(options.logoUrl)}" alt="WAZEN · وازن" />
      <div>
        <small>WAZEN · وازن</small>
        <strong>${escapeHtml(options.entityName)}</strong>
      </div>
    </div>
    <div class="head">
      <h1>${escapeHtml(options.title)}</h1>
      ${options.subtitle ? `<p>${escapeHtml(options.subtitle)}</p>` : ""}
    </div>
    ${metaHtml ? `<div class="meta">${metaHtml}</div>` : ""}
    ${kpiHtml ? `<div class="kpis">${kpiHtml}</div>` : ""}
    ${options.bodyHtml}
    <footer class="sheet-foot">${escapeHtml(options.footer ?? (options.locale === "ar"
      ? "مستند مُولَّد من منصة وازن — كشف رسمي للاستخدام داخل الجمعية أو المحفظة."
      : "Generated by Wazen — official statement for the wallet or association."))}</footer>
  </article>
</body>
</html>`;
}

function waitForPrintReady(win: Window) {
  const images = Array.from(win.document.images);
  return Promise.all(images.map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    });
  })).then(() => new Promise<void>((resolve) => window.setTimeout(resolve, 80)));
}

function pdfFilename(filename: string) {
  const base = filename.replace(/\.(html|pdf)$/i, "");
  return `${base || "wazen-document"}.pdf`;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function printPdfUrl(url: string) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  iframe.src = url;
  document.body.appendChild(iframe);
  iframe.addEventListener("load", () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.open(url, "_blank");
    }
    window.setTimeout(() => {
      iframe.remove();
      URL.revokeObjectURL(url);
    }, 120_000);
  });
  return true;
}

async function htmlDocumentToPdfBlob(html: string): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const host = document.createElement("iframe");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:fixed;left:-12000px;top:0;width:${A4_CSS_PX}px;height:0;border:0;opacity:0;pointer-events:none;`;
  const captureCss = `<style>
    html, body { width: ${A4_CSS_PX}px !important; min-width: ${A4_CSS_PX}px !important; background: #fff !important; }
    .print-actions { display: none !important; }
    .sheet { margin: 0 !important; max-width: none !important; border-radius: 0 !important; overflow: visible !important; }
  </style>`;
  const injected = html.includes("</head>") ? html.replace("</head>", `${captureCss}</head>`) : `${captureCss}${html}`;
  document.body.appendChild(host);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => resolve(), 2500);
      host.addEventListener("load", () => {
        window.clearTimeout(timer);
        resolve();
      }, { once: true });
      host.addEventListener("error", () => {
        window.clearTimeout(timer);
        reject(new Error("PDF_IFRAME_FAILED"));
      }, { once: true });
      host.srcdoc = injected;
    });
    const doc = host.contentDocument;
    const win = host.contentWindow;
    if (!doc || !win) throw new Error("PDF_IFRAME_EMPTY");
    await waitForPrintReady(win);
    const height = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, 400);
    host.style.height = `${height}px`;
    const canvas = await html2canvas(doc.body, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      width: A4_CSS_PX,
      windowWidth: A4_CSS_PX,
      windowHeight: height,
      scrollX: 0,
      scrollY: 0,
    });
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "p", compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;
    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    let heightLeft = imgH;
    let position = 0;
    pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH, undefined, "FAST");
    heightLeft -= pageH;
    while (heightLeft > 0.4) {
      position = heightLeft - imgH;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH, undefined, "FAST");
      heightLeft -= pageH;
    }
    return pdf.output("blob");
  } finally {
    host.remove();
  }
}

function printViaIframe(html: string) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.left = "-9999px";
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
  iframe.addEventListener("load", () => {
    const win = iframe.contentWindow;
    if (!win) {
      iframe.remove();
      return;
    }
    void waitForPrintReady(win).then(() => {
      try {
        win.focus();
        win.print();
      } catch { /* user can use on-page print */ }
      window.setTimeout(() => iframe.remove(), 120_000);
    });
  });
  return true;
}

/** HTML fallback if canvas PDF generation fails. */
export function openReportPreview(html: string, autoPrint = false) {
  if (typeof window === "undefined") return false;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const popup = window.open(url, "_blank", "width=960,height=900");
  if (popup) {
    const onReady = () => {
      void waitForPrintReady(popup).then(() => {
        if (autoPrint) {
          try { popup.focus(); popup.print(); } catch { printViaIframe(html); }
        }
      });
    };
    popup.addEventListener("load", onReady);
    window.setTimeout(onReady, 700);
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return true;
  }
  URL.revokeObjectURL(url);
  if (autoPrint) return printViaIframe(html);
  return false;
}

export async function downloadReportHtml(html: string, filename: string) {
  if (typeof window === "undefined") return;
  try {
    const blob = await htmlDocumentToPdfBlob(html);
    triggerBlobDownload(blob, pdfFilename(filename));
  } catch {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    triggerBlobDownload(blob, filename.endsWith(".html") ? filename : `${filename}.html`);
  }
}

/** Build a multi-page A4 PDF, then open the browser print dialog on the PDF (not the live webpage). */
export async function printWazenHtml(build: (logoUrl: string) => string, autoPrint = true) {
  const logoUrl = await resolvePrintLogoUrl();
  const html = build(logoUrl);
  if (typeof window === "undefined") return false;
  try {
    const blob = await htmlDocumentToPdfBlob(html);
    const url = URL.createObjectURL(blob);
    if (autoPrint) return printPdfUrl(url);
    const opened = window.open(url, "_blank");
    if (!opened) {
      triggerBlobDownload(blob, "wazen-document.pdf");
      URL.revokeObjectURL(url);
      return false;
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return true;
  } catch {
    return openReportPreview(html, autoPrint);
  }
}
