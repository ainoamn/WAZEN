import { escapeHtml } from "./html.ts";

const OFFICIAL_LOCKUP = "/brand/wazen-lockup.png";
/** A4 width at 96dpi — html2canvas capture width so tables scale to a real page, not a cropped browser tab. */
const A4_PORTRAIT_CSS_PX = 794;
const A4_LANDSCAPE_CSS_PX = 1123;

export type PrintOrientation = "portrait" | "landscape";

export function printOrientationFromHtml(html: string): PrintOrientation {
  return /data-orientation=["']landscape["']/i.test(html) ? "landscape" : "portrait";
}

export function printPageCssPx(orientation: PrintOrientation) {
  return orientation === "landscape" ? A4_LANDSCAPE_CSS_PX : A4_PORTRAIT_CSS_PX;
}

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
:root {
  color-scheme: light;
  --ink: #12231f;
  --muted: #5a6b64;
  --line: #dce6e1;
  --soft: #f3f8f5;
  --green: #0d7a65;
  --green-deep: #0a5c4c;
  --canvas: #eef3f0;
}
* { box-sizing: border-box; }
@page { size: A4 portrait; margin: 12mm; }
html[data-orientation="landscape"] { }
body {
  margin: 0;
  font-family: "Segoe UI", Tahoma, "Noto Sans Arabic", Arial, sans-serif;
  color: var(--ink);
  background:
    radial-gradient(120% 80% at 100% 0%, rgba(13,122,101,.10), transparent 55%),
    radial-gradient(90% 60% at 0% 100%, rgba(24,47,54,.06), transparent 50%),
    var(--canvas);
  font-size: 16px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  min-height: 100%;
}
body.page-landscape { font-size: 12px; line-height: 1.4; }
.print-actions {
  position: sticky; top: 0; z-index: 5;
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 10px 16px;
  background: rgba(255,255,255,.92);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
}
.print-actions button {
  border: 0; border-radius: 12px; padding: 11px 18px;
  background: var(--green); color: #fff; font-size: 15px; font-weight: 700; cursor: pointer;
}
.sheet {
  max-width: 920px;
  margin: 24px auto 48px;
  background: #fff;
  border: 1px solid rgba(13,122,101,.12);
  border-radius: 22px;
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(18,35,31,.08);
}
body.page-landscape .sheet { max-width: 1123px; margin: 12px auto 28px; border-radius: 16px; }
.sheet-accent { height: 5px; background: linear-gradient(90deg, var(--green-deep), var(--green), #2aa88a); }
.brand-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 20px 28px 16px;
  background: linear-gradient(180deg, #f8fcfa 0%, #fff 100%);
}
body.page-landscape .brand-bar { padding: 12px 18px; }
.brand-bar img { height: 48px; width: auto; max-width: min(220px, 55vw); object-fit: contain; }
body.page-landscape .brand-bar img { height: 38px; }
.brand-bar small { display: block; color: var(--muted); font-size: 12px; font-weight: 700; letter-spacing: .04em; }
.brand-bar strong { font-size: 17px; color: var(--ink); font-weight: 800; }
.head { padding: 8px 28px 6px; }
body.page-landscape .head { padding: 8px 18px 4px; }
.head h1 {
  margin: 0 0 6px;
  font-size: 30px;
  line-height: 1.25;
  color: var(--green-deep);
  letter-spacing: -0.02em;
  font-weight: 800;
}
body.page-landscape .head h1 { font-size: 22px; margin-bottom: 4px; }
.head p { margin: 0; color: var(--muted); font-size: 15px; font-weight: 600; }
body.page-landscape .head p { font-size: 13px; }
.meta {
  display: grid; grid-template-columns: repeat(2,minmax(0,1fr));
  gap: 12px 18px; margin: 14px 28px; padding: 14px 16px;
  border: 1px solid var(--line); border-radius: 14px; background: var(--soft);
}
body.page-landscape .meta { margin: 10px 18px; padding: 10px 12px; gap: 8px 16px; }
.meta span { color: var(--muted); font-size: 12px; display: block; font-weight: 700; margin-bottom: 3px; }
.meta b { font-size: 15px; color: var(--ink); font-weight: 800; overflow-wrap: anywhere; }
body.page-landscape .meta span { font-size: 11px; }
body.page-landscape .meta b { font-size: 13px; }
.kpis { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 12px; padding: 0 28px 18px; }
body.page-landscape .kpis { gap: 8px; padding: 0 18px 12px; }
.kpi {
  border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px;
  background: linear-gradient(180deg, #fff, var(--soft));
}
body.page-landscape .kpi { padding: 8px 10px; border-radius: 10px; }
.kpi span { display: block; color: var(--muted); font-size: 12px; margin-bottom: 6px; font-weight: 700; }
.kpi strong { font-size: 18px; color: var(--ink); font-weight: 800; }
body.page-landscape .kpi span { font-size: 11px; margin-bottom: 4px; }
body.page-landscape .kpi strong { font-size: 14px; }
section { padding: 8px 28px 22px; }
body.page-landscape section { padding: 6px 18px 16px; }
section h2 { margin: 0 0 12px; font-size: 18px; color: var(--green-deep); font-weight: 800; }
body.page-landscape section h2 { margin: 0 0 8px; font-size: 15px; }
table { width: 100%; border-collapse: collapse; font-size: 16px; }
th, td { padding: 12px 10px; border-bottom: 1px solid var(--line); text-align: start; vertical-align: top; }
th { color: var(--muted); font-size: 13px; background: var(--soft); font-weight: 800; }
td { color: var(--ink); font-size: 16px; font-weight: 600; overflow-wrap: anywhere; }
body.page-portrait td:first-child { color: var(--muted); font-weight: 700; width: 34%; }
.num { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; font-size: 16px; font-weight: 800; }
.in { color: var(--green); font-weight: 800; }
.out { color: #a84d58; font-weight: 800; }
.voided td { text-decoration: line-through; color: #5b6b66; }
.footer-note { margin: 12px 0 0; font-weight: 800; color: var(--green); font-size: 15px; }
.empty { color: #5b6b66; font-size: 15px; }
.receipt-block { padding-top: 4px; }
.receipt-amount {
  margin: 0 0 18px;
  padding: 18px 18px 16px;
  border-radius: 18px;
  background: linear-gradient(145deg, #0a5c4c 0%, #0d7a65 55%, #1c967c 100%);
  color: #fff;
  text-align: center;
  box-shadow: 0 16px 36px rgba(10,92,76,.22);
}
.receipt-amount span {
  display: block;
  font-size: 13px;
  font-weight: 700;
  opacity: .88;
  margin-bottom: 6px;
  letter-spacing: .02em;
}
.receipt-amount strong {
  display: block;
  font-size: clamp(28px, 7vw, 40px);
  line-height: 1.15;
  font-weight: 800;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}
.receipt-fields { margin: 0; display: grid; gap: 0; }
.receipt-fields > div {
  display: grid;
  grid-template-columns: minmax(7.5rem, 34%) 1fr;
  gap: 10px 14px;
  padding: 13px 4px;
  border-bottom: 1px solid var(--line);
  align-items: start;
}
.receipt-fields dt {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
}
.receipt-fields dd {
  margin: 0;
  color: var(--ink);
  font-size: 16px;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.receipt-ref {
  margin: 16px 0 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--soft);
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
  text-align: center;
  letter-spacing: .04em;
}
footer.sheet-foot {
  padding: 16px 28px 24px;
  color: var(--muted);
  font-size: 14px;
  font-weight: 600;
  border-top: 1px solid var(--line);
  line-height: 1.6;
  background: #fbfcfb;
}
body.page-landscape footer.sheet-foot { padding: 12px 18px 18px; font-size: 11px; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
body.page-landscape table { font-size: 11px; table-layout: auto; }
body.page-landscape th, body.page-landscape td { padding: 5px 6px; font-size: 11px; line-height: 1.35; vertical-align: middle; }
body.page-landscape th { font-size: 10px; }
body.page-landscape td:first-child { width: auto; color: var(--ink); font-weight: 600; }
body.page-landscape .num { font-size: 11px; white-space: nowrap; }
body.page-landscape td.col-date, body.page-landscape td.col-ref, body.page-landscape td.col-user, body.page-landscape td.col-status {
  white-space: nowrap; font-size: 10px; font-weight: 600;
}
body.page-landscape td.col-desc { min-width: 160px; white-space: normal; overflow-wrap: anywhere; }
@media print {
  body {
    background: white;
    font-size: 16px;
    color: #000;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
  body.page-landscape { font-size: 11px; }
  .print-actions { display: none !important; }
  .sheet { margin: 0; border: 0; border-radius: 0; max-width: none; overflow: visible; box-shadow: none; }
  .brand-bar, th, .meta, .kpi, .receipt-amount, .sheet-accent { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .brand-bar small, .meta span, .kpi span, th, body.page-portrait td:first-child, footer.sheet-foot, .receipt-fields dt { color: #222 !important; }
  .brand-bar strong, .meta b, .kpi strong, td, .head p, .receipt-fields dd { color: #000 !important; }
  .head h1 { font-size: 32px; color: #0a5c4c !important; }
  body.page-landscape .head h1 { font-size: 20px !important; }
  table, td, .num { font-size: 16px; }
  body.page-landscape table, body.page-landscape td, body.page-landscape .num { font-size: 11px; }
  body.page-landscape th, body.page-landscape td.col-date, body.page-landscape td.col-ref { font-size: 10px; }
  th { font-size: 14px; }
  footer.sheet-foot { font-size: 13px; background: #fff; }
}
@media (max-width: 760px) {
  body { background: #f4f7f5; }
  .print-actions { justify-content: stretch; padding: 10px 12px; }
  .print-actions button { width: 100%; min-height: 48px; }
  .sheet {
    margin: 0;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    max-width: none;
    min-height: 100dvh;
  }
  .brand-bar {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 16px 16px 12px;
  }
  .brand-bar img { height: 40px; max-width: min(180px, 70vw); }
  .brand-bar strong { font-size: 15px; }
  .head { padding: 4px 16px 8px; }
  .head h1 { font-size: 24px; }
  .head p { font-size: 13px; }
  .meta, .kpis { grid-template-columns: 1fr; margin: 10px 16px; }
  .kpis { padding: 0 16px 14px; }
  section { padding: 6px 16px 20px; }
  body.page-portrait td:first-child { width: 38%; font-size: 13px; }
  td { font-size: 15px; }
  .receipt-amount { margin-bottom: 14px; padding: 16px 14px; border-radius: 16px; }
  .receipt-amount strong { font-size: clamp(26px, 9vw, 34px); }
  .receipt-fields > div {
    grid-template-columns: 1fr;
    gap: 4px;
    padding: 12px 2px;
  }
  .receipt-fields dt { font-size: 12px; }
  .receipt-fields dd { font-size: 15px; }
  footer.sheet-foot { padding: 14px 16px 22px; font-size: 12px; }
}
`;

/** Elegant receipt body: amount hero + labeled fields (mobile-friendly). */
export function buildReceiptBodyHtml(input: {
  locale: "ar" | "en";
  amountLabel: string;
  fields: Array<{ label: string; value: string }>;
  reference?: string;
}) {
  const amountCaption = input.locale === "ar" ? "المبلغ" : "Amount";
  const rows = input.fields
    .filter((item) => String(item.value ?? "").trim())
    .map((item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd></div>`)
    .join("");
  const ref = input.reference
    ? `<p class="receipt-ref">${input.locale === "ar" ? "المرجع" : "Ref"} · ${escapeHtml(input.reference)}</p>`
    : "";
  return `<section class="receipt-block">
  <div class="receipt-amount"><span>${escapeHtml(amountCaption)}</span><strong>${escapeHtml(input.amountLabel)}</strong></div>
  <dl class="receipt-fields">${rows}</dl>
  ${ref}
</section>`;
}

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
  orientation?: PrintOrientation;
}) {
  const dir = options.locale === "ar" ? "rtl" : "ltr";
  const orientation = options.orientation ?? "portrait";
  const printLabel = options.locale === "ar" ? "طباعة المستند" : "Print document";
  const metaHtml = (options.meta ?? [])
    .map((item) => `<div><span>${escapeHtml(item.label)}</span><b>${escapeHtml(item.value)}</b></div>`)
    .join("");
  const kpiHtml = (options.kpis ?? [])
    .map((item) => `<div class="kpi"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`)
    .join("");
  const pageRule = orientation === "landscape"
    ? "@page { size: A4 landscape; margin: 8mm; }"
    : "@page { size: A4 portrait; margin: 12mm; }";
  return `<!doctype html>
<html lang="${options.locale}" dir="${dir}" data-orientation="${orientation}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(options.title)} · ${escapeHtml(options.entityName)}</title>
  <style>${PRINT_DOCUMENT_CSS}\n${pageRule}</style>
</head>
<body class="page-${orientation}">
  <div class="print-actions"><button type="button" onclick="window.print()">${escapeHtml(printLabel)}</button></div>
  <article class="sheet">
    <div class="sheet-accent" aria-hidden="true"></div>
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
      ? "مستند رسمي من منصة وازن — للاستخدام داخل الجمعية أو المحفظة."
      : "Official document from Wazen — for the wallet or association."))}</footer>
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
  const orientation = printOrientationFromHtml(html);
  const pageCssPx = printPageCssPx(orientation);
  const host = document.createElement("iframe");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:fixed;left:-12000px;top:0;width:${pageCssPx}px;height:0;border:0;opacity:0;pointer-events:none;`;
  const captureCss = `<style>
    html, body { width: ${pageCssPx}px !important; min-width: ${pageCssPx}px !important; background: #fff !important; }
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
      width: pageCssPx,
      windowWidth: pageCssPx,
      windowHeight: height,
      scrollX: 0,
      scrollY: 0,
    });
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: orientation === "landscape" ? "l" : "p", compress: true });
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
  const orientation = printOrientationFromHtml(html);
  const popup = window.open(url, "_blank", orientation === "landscape" ? "width=1280,height=900" : "width=960,height=900");
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

export type SharePdfResult = "shared" | "downloaded" | "cancelled" | "failed";

/**
 * Attach a generated PDF with the caption text.
 * Prefer the system share sheet (WhatsApp accepts file + text as caption on mobile).
 * Otherwise download the PDF and open wa.me with the text so the user can attach the file.
 */
export async function shareWazenPdfWithText(input: {
  buildHtml: (logoUrl: string) => string;
  text: string;
  filename?: string;
  /** Digits only, no + — opens a direct chat when Web Share is unavailable. */
  phone?: string | null;
  title?: string;
}): Promise<SharePdfResult> {
  if (typeof window === "undefined") return "failed";
  const filename = pdfFilename(input.filename ?? "wazen-receipt");
  const title = input.title ?? "WAZEN";
  const text = String(input.text ?? "").trim();
  try {
    const logoUrl = await resolvePrintLogoUrl();
    const html = input.buildHtml(logoUrl);
    const blob = await htmlDocumentToPdfBlob(html);
    const file = new File([blob], filename, { type: "application/pdf" });
    const shareData: ShareData = { files: [file], title, text };
    if (typeof navigator.canShare === "function" && navigator.canShare(shareData) && typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        return "shared";
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
        // Fall through: some browsers advertise canShare then reject file shares.
      }
    }
    // Partial share: files-only sheet still gets the PDF into WhatsApp; text is in the download fallback path.
    const filesOnly: ShareData = { files: [file], title };
    if (typeof navigator.canShare === "function" && navigator.canShare(filesOnly) && typeof navigator.share === "function") {
      try {
        await navigator.share(filesOnly);
        const phone = String(input.phone ?? "").replace(/\D/g, "");
        const wa = phone
          ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
          : `https://wa.me/?text=${encodeURIComponent(text)}`;
        if (text) window.open(wa, "_blank", "noopener,noreferrer");
        return "shared";
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      }
    }
    triggerBlobDownload(blob, filename);
    const phone = String(input.phone ?? "").replace(/\D/g, "");
    const wa = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(wa, "_blank", "noopener,noreferrer");
    return "downloaded";
  } catch {
    const phone = String(input.phone ?? "").replace(/\D/g, "");
    const wa = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(wa, "_blank", "noopener,noreferrer");
    return "failed";
  }
}
