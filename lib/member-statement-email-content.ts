/** Pure helpers for member statement email content (no DB / billing). */

import { buildMemberLedger, filterMemberLedgerLines } from "./member-ledger.ts";
import { formatMoneyMinor } from "./money.ts";

const GROUP_SPACE_TYPES = new Set(["household", "trip", "society", "group"]);

export function isGroupSpaceType(type: string) {
  return GROUP_SPACE_TYPES.has(type);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildStatementSummaryHtml(input: {
  locale: "ar" | "en";
  currency: string;
  ledger: ReturnType<typeof buildMemberLedger>;
  maxLines?: number;
}) {
  const locale = input.locale;
  const money = (minor: number) => formatMoneyMinor(minor, input.currency, locale);
  const lines = filterMemberLedgerLines(input.ledger.lines, "all");
  const recent = lines.slice(-(input.maxLines ?? 18));
  const totals = locale === "ar"
    ? `<p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#24443c;">
        <strong>المدفوع:</strong> ${money(input.ledger.paidMinor)} ·
        <strong>عليه:</strong> ${money(input.ledger.owesMinor)} ·
        <strong>له:</strong> ${money(input.ledger.creditMinor)}
      </p>`
    : `<p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#24443c;">
        <strong>Paid:</strong> ${money(input.ledger.paidMinor)} ·
        <strong>Owes:</strong> ${money(input.ledger.owesMinor)} ·
        <strong>Credit:</strong> ${money(input.ledger.creditMinor)}
      </p>`;

  if (!recent.length) {
    return totals + (locale === "ar"
      ? `<p style="margin:0;font-size:14px;color:#5f6e68;">لا حركات مسجّلة بعد.</p>`
      : `<p style="margin:0;font-size:14px;color:#5f6e68;">No movements recorded yet.</p>`);
  }

  const header = locale === "ar"
    ? `<tr style="background:#eef5f2;"><th style="padding:8px 10px;text-align:right;font-size:12px;">التاريخ</th><th style="padding:8px 10px;text-align:right;font-size:12px;">البيان</th><th style="padding:8px 10px;text-align:left;font-size:12px;">المبلغ</th></tr>`
    : `<tr style="background:#eef5f2;"><th style="padding:8px 10px;text-align:left;font-size:12px;">Date</th><th style="padding:8px 10px;text-align:left;font-size:12px;">Description</th><th style="padding:8px 10px;text-align:right;font-size:12px;">Amount</th></tr>`;

  const rows = recent.map((line) => {
    const date = new Date(line.at).toLocaleDateString(locale === "ar" ? "ar-OM" : "en-GB", { day: "numeric", month: "short" });
    const title = locale === "ar" ? line.titleAr : line.titleEn;
    const sign = line.direction === "in" ? "+" : line.direction === "out" ? "−" : "";
    const align = locale === "ar" ? "right" : "left";
    const amountAlign = locale === "ar" ? "left" : "right";
    return `<tr>
      <td style="padding:7px 10px;border-top:1px solid #e3ece8;font-size:12px;white-space:nowrap;text-align:${align};">${escapeHtml(date)}</td>
      <td style="padding:7px 10px;border-top:1px solid #e3ece8;font-size:12px;text-align:${align};">${escapeHtml(title)}</td>
      <td style="padding:7px 10px;border-top:1px solid #e3ece8;font-size:12px;white-space:nowrap;text-align:${amountAlign};">${sign}${money(line.amountMinor)}</td>
    </tr>`;
  }).join("");

  return `${totals}<table style="width:100%;border-collapse:collapse;border:1px solid #d7e5df;border-radius:10px;overflow:hidden;">${header}${rows}</table>`;
}

export function buildBalanceAlertHtml(input: {
  locale: "ar" | "en";
  owesLabel: string;
  creditLabel: string;
  owesMinor: number;
  creditMinor: number;
}) {
  const { locale, owesLabel, creditLabel, owesMinor, creditMinor } = input;
  if (owesMinor > 0) {
    return locale === "ar"
      ? `<div style="margin:0 0 16px;padding:14px 16px;border-radius:12px;background:#fff7ed;border:1px solid #f5c26b;font-size:15px;line-height:1.75;color:#7c4a03;">
          <strong>تنبيه:</strong> عليك للجمعية مبلغ <strong>${escapeHtml(owesLabel)}</strong>.
          نرجو منك التكرم بالسداد في أقرب وقت ممكن — وشكراً لتعاونك الدائم.
        </div>`
      : `<div style="margin:0 0 16px;padding:14px 16px;border-radius:12px;background:#fff7ed;border:1px solid #f5c26b;font-size:15px;line-height:1.75;color:#7c4a03;">
          <strong>Reminder:</strong> you owe the association <strong>${escapeHtml(owesLabel)}</strong>.
          Kindly settle when convenient — thank you for your cooperation.
        </div>`;
  }
  if (creditMinor > 0) {
    return locale === "ar"
      ? `<div style="margin:0 0 16px;padding:14px 16px;border-radius:12px;background:#f0fdf8;border:1px solid #9fd9c9;font-size:15px;line-height:1.75;color:#0f5132;">
          <strong>ملاحظة:</strong> لديك رصيد لدى الجمعية بمبلغ <strong>${escapeHtml(creditLabel)}</strong>.
        </div>`
      : `<div style="margin:0 0 16px;padding:14px 16px;border-radius:12px;background:#f0fdf8;border:1px solid #9fd9c9;font-size:15px;line-height:1.75;color:#0f5132;">
          <strong>Note:</strong> you have a credit balance of <strong>${escapeHtml(creditLabel)}</strong> with the association.
        </div>`;
  }
  return locale === "ar"
    ? `<div style="margin:0 0 16px;padding:14px 16px;border-radius:12px;background:#f4f8f6;border:1px solid #d7e5df;font-size:15px;line-height:1.75;color:#24443c;">
        حسابك متوازن حالياً — لا مطالبات مستحقة. شكراً لالتزامك.
      </div>`
    : `<div style="margin:0 0 16px;padding:14px 16px;border-radius:12px;background:#f4f8f6;border:1px solid #d7e5df;font-size:15px;line-height:1.75;color:#24443c;">
        Your account is balanced — no outstanding dues. Thank you for staying current.
      </div>`;
}

export function buildTransactionNoteHtml(input: {
  locale: "ar" | "en";
  description: string;
  amountLabel: string;
  dateLabel: string;
}) {
  return input.locale === "ar"
    ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#24443c;">
        <strong>المعاملة الجديدة:</strong> ${escapeHtml(input.description)} —
        ${escapeHtml(input.amountLabel)} · ${escapeHtml(input.dateLabel)}
      </p>`
    : `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#24443c;">
        <strong>New transaction:</strong> ${escapeHtml(input.description)} —
        ${escapeHtml(input.amountLabel)} · ${escapeHtml(input.dateLabel)}
      </p>`;
}
