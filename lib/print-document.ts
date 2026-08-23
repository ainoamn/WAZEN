import { escapeHtml } from "./html.ts";
import { openWhatsAppUrl, whatsappShareUrl } from "./receipt-share.ts";

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

/* —— Receipt document (print / PDF / mobile) —— */
body.is-receipt {
  font-size: 17px;
  line-height: 1.6;
  letter-spacing: 0;
}
body.is-receipt .sheet {
  max-width: 640px;
  margin: 20px auto 40px;
  border-radius: 20px;
}
body.is-receipt .brand-bar {
  padding: 22px 24px 14px;
  align-items: flex-start;
}
body.is-receipt .brand-bar img { height: 44px; max-width: min(200px, 58vw); }
body.is-receipt .brand-bar small {
  font-size: 11px;
  /* Never letter-space or uppercase Arabic — breaks glyph joining. */
  letter-spacing: 0;
  text-transform: none;
}
body.is-receipt .brand-bar strong {
  font-size: 16px;
  line-height: 1.35;
  max-width: 16rem;
}
body.is-receipt .head {
  padding: 4px 24px 10px;
  text-align: center;
  border-bottom: 1px solid var(--line);
  margin-bottom: 4px;
}
body.is-receipt .head h1 {
  font-size: 26px;
  margin: 0 0 8px;
  letter-spacing: 0;
}
body.is-receipt .head p {
  font-size: 14px;
  font-weight: 600;
}
body.is-receipt .receipt-badge {
  display: inline-block;
  margin: 0 0 10px;
  padding: 5px 12px;
  border-radius: 999px;
  background: rgba(13,122,101,.1);
  color: var(--green-deep);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
}
.receipt-block { padding: 8px 24px 8px; }
.receipt-amount {
  margin: 12px 0 18px;
  padding: 22px 16px 26px;
  border-radius: 16px;
  background: linear-gradient(160deg, #084c3f 0%, #0d7a65 48%, #18917a 100%);
  color: #fff;
  text-align: center;
  box-shadow: 0 14px 32px rgba(10,92,76,.18);
  overflow: visible;
}
.receipt-amount span {
  display: block;
  font-size: 13px;
  font-weight: 700;
  opacity: .9;
  margin-bottom: 10px;
  letter-spacing: 0;
  line-height: 1.5;
}
.receipt-amount strong {
  display: block;
  font-size: clamp(28px, 7.5vw, 40px);
  line-height: 1.4;
  font-weight: 800;
  letter-spacing: 0;
  font-variant-numeric: tabular-nums;
  direction: ltr;
  unicode-bidi: isolate;
  padding: 2px 4px 6px;
  overflow: visible;
}
.receipt-fields {
  margin: 0;
  display: grid;
  gap: 0;
  border: 1px solid var(--line);
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
}
.receipt-fields > div {
  display: grid;
  grid-template-columns: minmax(6.5rem, 32%) 1fr;
  gap: 8px 16px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--line);
  align-items: center;
  background: #fff;
}
.receipt-fields > div:nth-child(even) { background: #f7faf8; }
.receipt-fields > div:last-child { border-bottom: 0; }
.receipt-fields dt {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.4;
}
.receipt-fields dd {
  margin: 0;
  color: var(--ink);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.45;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.receipt-ref {
  margin: 16px 0 4px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px dashed rgba(13,122,101,.35);
  background: var(--soft);
  color: var(--green-deep);
  font-size: 13px;
  font-weight: 800;
  text-align: center;
  letter-spacing: 0;
  font-variant-numeric: tabular-nums;
}
.receipt-qr {
  margin: 18px 0 4px;
  padding: 16px 14px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: #fff;
  text-align: center;
}
.receipt-qr img {
  display: block;
  width: 148px;
  height: 148px;
  margin: 0 auto 10px;
  border-radius: 8px;
  background: #fff;
}
.receipt-qr p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.5;
  letter-spacing: 0;
}
.receipt-qr a {
  display: inline-block;
  margin-top: 6px;
  color: var(--green-deep);
  font-size: 11px;
  font-weight: 700;
  word-break: break-all;
  text-decoration: none;
  letter-spacing: 0;
  max-width: 100%;
}
body.is-receipt footer.sheet-foot {
  margin-top: 8px;
  padding: 18px 24px 22px;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--muted);
  line-height: 1.65;
  background: linear-gradient(180deg, #fff 0%, #f4f8f6 100%);
}
body.is-receipt footer.sheet-foot .foot-mark {
  display: block;
  margin-bottom: 6px;
  color: var(--green-deep);
  font-size: 14px;
  font-weight: 800;
}
body.is-receipt footer.sheet-foot .foot-site {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #6a7a74;
  letter-spacing: 0;
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
  body.is-receipt { font-size: 16px; }
  .print-actions { display: none !important; }
  .sheet { margin: 0; border: 0; border-radius: 0; max-width: none; overflow: visible; box-shadow: none; }
  body.is-receipt .sheet { max-width: none; margin: 0; }
  .brand-bar, th, .meta, .kpi, .receipt-amount, .sheet-accent, .receipt-fields > div:nth-child(even) { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .brand-bar small, .meta span, .kpi span, th, body.page-portrait td:first-child, footer.sheet-foot, .receipt-fields dt { color: #222 !important; }
  .brand-bar strong, .meta b, .kpi strong, td, .head p, .receipt-fields dd { color: #000 !important; }
  .head h1 { font-size: 32px; color: #0a5c4c !important; }
  body.is-receipt .head h1 { font-size: 26px !important; }
  body.is-receipt .receipt-amount strong { font-size: 34px !important; color: #fff !important; line-height: 1.4 !important; }
  body.is-receipt .receipt-amount span { color: #fff !important; letter-spacing: 0 !important; }
  body.is-receipt footer.sheet-foot .foot-mark { color: #0a5c4c !important; }
  body.page-landscape .head h1 { font-size: 20px !important; }
  table, td, .num { font-size: 16px; }
  body.page-landscape table, body.page-landscape td, body.page-landscape .num { font-size: 11px; }
  body.page-landscape th, body.page-landscape td.col-date, body.page-landscape td.col-ref { font-size: 10px; }
  th { font-size: 14px; }
  footer.sheet-foot { font-size: 13px; background: #fff; }
  body.is-receipt footer.sheet-foot { font-size: 13px; }
}
@media (max-width: 760px) {
  body { background: #f4f7f5; }
  .print-actions { justify-content: stretch; padding: 10px 12px; }
  .print-actions button { width: 100%; min-height: 48px; border-radius: 14px; font-size: 16px; }
  .sheet {
    margin: 0;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    max-width: none;
    min-height: 100dvh;
  }
  body.is-receipt .sheet { margin: 0; max-width: none; border-radius: 0; min-height: 100dvh; }
  .brand-bar {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 16px 16px 12px;
  }
  body.is-receipt .brand-bar { padding: 18px 16px 12px; }
  .brand-bar img { height: 40px; max-width: min(180px, 70vw); }
  body.is-receipt .brand-bar img { height: 38px; }
  .brand-bar strong { font-size: 15px; }
  .head { padding: 4px 16px 8px; }
  body.is-receipt .head { padding: 8px 16px 12px; }
  .head h1 { font-size: 24px; }
  body.is-receipt .head h1 { font-size: 22px; }
  .head p { font-size: 13px; }
  .meta, .kpis { grid-template-columns: 1fr; margin: 10px 16px; }
  .kpis { padding: 0 16px 14px; }
  section { padding: 6px 16px 20px; }
  body.is-receipt .receipt-block { padding: 6px 16px 10px; }
  body.page-portrait td:first-child { width: 38%; font-size: 13px; }
  td { font-size: 15px; }
  .receipt-amount { margin: 10px 0 14px; padding: 18px 14px; border-radius: 14px; }
  .receipt-amount strong { font-size: clamp(28px, 9vw, 36px); }
  .receipt-fields { border-radius: 12px; }
  .receipt-fields > div {
    grid-template-columns: 1fr;
    gap: 4px;
    padding: 12px 14px;
    align-items: start;
  }
  .receipt-fields dt { font-size: 12px; }
  .receipt-fields dd { font-size: 15px; }
  .receipt-ref { margin-top: 14px; font-size: 12px; }
  footer.sheet-foot { padding: 14px 16px 22px; font-size: 12px; }
  body.is-receipt footer.sheet-foot { padding: 16px 16px 28px; font-size: 12px; }
  body.is-receipt footer.sheet-foot .foot-mark { font-size: 13px; }
}
`;

/** Receipt body: amount hero + labeled fields (mobile + print). */
export function buildReceiptBodyHtml(input: {
  locale: "ar" | "en";
  amountLabel: string;
  fields: Array<{ label: string; value: string }>;
  reference?: string;
  /** Permanent public receipt URL (never a blob: URL). */
  receiptUrl?: string;
  qrDataUrl?: string;
}) {
  const amountCaption = input.locale === "ar" ? "المبلغ" : "Amount";
  const rows = input.fields
    .filter((item) => String(item.value ?? "").trim())
    .map((item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd></div>`)
    .join("");
  const ref = input.reference
    ? `<p class="receipt-ref">${input.locale === "ar" ? "المرجع" : "Ref"} · ${escapeHtml(input.reference)}</p>`
    : "";
  const qrHint = input.locale === "ar"
    ? "امسح الرمز لفتح الإيصال الإلكتروني"
    : "Scan to open the electronic receipt";
  const qr = input.qrDataUrl && input.receiptUrl
    ? `<div class="receipt-qr">
  <img src="${escapeHtml(input.qrDataUrl)}" width="148" height="148" alt="QR" />
  <p>${escapeHtml(qrHint)}</p>
  <a href="${escapeHtml(input.receiptUrl)}">${escapeHtml(input.receiptUrl)}</a>
</div>`
    : "";
  return `<section class="receipt-block">
  <div class="receipt-amount"><span>${escapeHtml(amountCaption)}</span><strong>${escapeHtml(input.amountLabel)}</strong></div>
  <dl class="receipt-fields">${rows}</dl>
  ${ref}
  ${qr}
</section>`;
}

export function receiptElectronicFooter(locale: "ar" | "en") {
  if (locale === "ar") {
    return {
      mark: "هذا إيصال إلكتروني طُبع من موقع وازن",
      site: "WAZEN · وازن",
    };
  }
  return {
    mark: "This is an electronic receipt printed from the Wazen website",
    site: "WAZEN · وازن",
  };
}

/** QR data URL for a permanent https receipt link (not blob:). */
export async function buildReceiptQrDataUrl(receiptUrl: string) {
  const url = String(receiptUrl ?? "").trim();
  if (!url || url.startsWith("blob:")) return "";
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(url, {
    width: 280,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0a5c4c", light: "#ffffff" },
  });
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
  /** Receipt layout: clearer hierarchy + electronic-receipt footer. */
  variant?: "report" | "receipt";
}) {
  const dir = options.locale === "ar" ? "rtl" : "ltr";
  const orientation = options.orientation ?? "portrait";
  const isReceipt = options.variant === "receipt";
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
  const receiptFoot = receiptElectronicFooter(options.locale);
  const footerHtml = isReceipt
    ? (options.footer
      ? escapeHtml(options.footer)
      : `<span class="foot-mark">${escapeHtml(receiptFoot.mark)}</span><span class="foot-site">${escapeHtml(receiptFoot.site)}</span>`)
    : escapeHtml(options.footer ?? (options.locale === "ar"
      ? "مستند رسمي من منصة وازن — للاستخدام داخل الجمعية أو المحفظة."
      : "Official document from Wazen — for the wallet or association."));
  const badge = isReceipt
    ? `<span class="receipt-badge">${options.locale === "ar" ? "إيصال إلكتروني" : "Electronic receipt"}</span>`
    : "";
  return `<!doctype html>
<html lang="${options.locale}" dir="${dir}" data-orientation="${orientation}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${escapeHtml(options.title)} · ${escapeHtml(options.entityName)}</title>
  <style>${PRINT_DOCUMENT_CSS}\n${pageRule}</style>
</head>
<body class="page-${orientation}${isReceipt ? " is-receipt" : ""}">
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
      ${badge}
      <h1>${escapeHtml(options.title)}</h1>
      ${options.subtitle ? `<p>${escapeHtml(options.subtitle)}</p>` : ""}
    </div>
    ${metaHtml ? `<div class="meta">${metaHtml}</div>` : ""}
    ${kpiHtml ? `<div class="kpis">${kpiHtml}</div>` : ""}
    ${options.bodyHtml}
    <footer class="sheet-foot">${footerHtml}</footer>
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
    /* letter-spacing / uppercase shreds Arabic joining when rasterized */
    * { letter-spacing: 0 !important; text-transform: none !important; }
    .receipt-amount { overflow: visible !important; padding-bottom: 28px !important; }
    .receipt-amount strong { line-height: 1.45 !important; padding-bottom: 8px !important; }
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
      onclone(clonedDoc) {
        clonedDoc.querySelectorAll<HTMLElement>("*").forEach((el) => {
          el.style.letterSpacing = "0";
          el.style.textTransform = "none";
        });
      },
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
  // Arabic receipts: keep native HTML so shaping stays intact (canvas PDF breaks joins).
  if (/lang=["']ar["']/i.test(html) && /\bis-receipt\b/.test(html)) {
    openReportPreview(html, false);
    return;
  }
  try {
    const blob = await htmlDocumentToPdfBlob(html);
    triggerBlobDownload(blob, pdfFilename(filename));
  } catch {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    triggerBlobDownload(blob, filename.endsWith(".html") ? filename : `${filename}.html`);
  }
}

/** Build document then print. Arabic receipts use HTML print (correct shaping), not canvas PDF. */
export async function printWazenHtml(build: (logoUrl: string) => string, autoPrint = true) {
  const logoUrl = await resolvePrintLogoUrl();
  const html = build(logoUrl);
  if (typeof window === "undefined") return false;
  if (/lang=["']ar["']/i.test(html) && /\bis-receipt\b/.test(html)) {
    return openReportPreview(html, autoPrint);
  }
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
 * Otherwise download the PDF and open WhatsApp (app on mobile, Web on desktop).
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
  const openChat = () => {
    if (!text) return;
    openWhatsAppUrl(whatsappShareUrl(input.phone ?? null, text));
  };
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
        openChat();
        return "shared";
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      }
    }
    triggerBlobDownload(blob, filename);
    openChat();
    return "downloaded";
  } catch {
    openChat();
    return "failed";
  }
}
