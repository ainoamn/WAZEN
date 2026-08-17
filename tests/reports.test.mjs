import assert from "node:assert/strict";
import test from "node:test";
import { REPORT_CATALOG, buildReportHtml } from "../lib/reports.ts";
import { buildAccountStatementHtml } from "../lib/account-statement.ts";

test("report catalog covers association, member, expense, income and compliance reports", () => {
  const ids = new Set(REPORT_CATALOG.map((item) => item.id));
  for (const id of [
    "association",
    "member",
    "expenses",
    "income",
    "general",
    "statistics",
    "discipline",
    "commitment",
    "delay",
    "evaluation",
    "subscriptions",
    "renewals",
    "arrears",
    "discounts",
    "benefits",
    "obligations",
  ]) {
    assert.equal(ids.has(id), true, `missing report type ${id}`);
  }
});

test("branded report html includes logo, wallet name and member scope", () => {
  const html = buildReportHtml({
    locale: "ar",
    reportType: "member",
    logoUrl: "https://example.com/brand/wazen-lockup.png",
    issuerName: "أمين الصندوق",
    space: {
      id: "space-1",
      name_ar: "جمعية الإخوة",
      name_en: "Brothers Circle",
      type: "society",
      currency: "OMR",
      balance_minor: 120_000,
      goal_minor: 500_000,
    },
    member: {
      id: "m1",
      space_id: "space-1",
      display_name: "عبد الحميد",
      email: null,
      role: "member",
      due_minor: 240_000,
      paid_minor: 100_000,
      extra_minor: 0,
    },
    spaces: [],
    members: [{
      id: "m1",
      space_id: "space-1",
      display_name: "عبد الحميد",
      email: null,
      role: "member",
      due_minor: 240_000,
      paid_minor: 100_000,
      extra_minor: 0,
    }],
    transactions: [{
      id: "t1",
      space_id: "space-1",
      member_id: "m1",
      kind: "contribution",
      allocation: "mandatory",
      amount_minor: 100_000,
      description_ar: "سداد مطالبة",
      description_en: "Dues payment",
      occurred_at: "2026-08-01T10:00:00.000Z",
    }],
  });

  assert.match(html, /wazen-lockup\.png|data:image\//);
  assert.match(html, /onclick="window.print\(\)"/);
  assert.match(html, /@page \{ size: A4;/);
  assert.match(html, /جمعية الإخوة/);
  assert.match(html, /عبد الحميد/);
  assert.match(html, /تقرير العميل/);
  assert.match(html, /عليه/);
});

test("account statement looks like a bank ledger with running balance", () => {
  const html = buildAccountStatementHtml({
    locale: "ar",
    logoUrl: "/brand/wazen-lockup.png",
    issuerName: "أحمد",
    spaces: [{ id: "s1", name_ar: "جمعية السفر", name_en: "Trip", type: "trip", currency: "OMR", balance_minor: 30_000 }],
    members: [{ id: "m1", space_id: "s1", display_name: "ماجد" }],
    transactions: [
      { id: "aaaaaaaa", space_id: "s1", member_id: "m1", kind: "contribution", amount_minor: 50_000, description_ar: "إيداع اشتراك", description_en: "Dues", occurred_at: "2026-08-01T08:00:00.000Z", status: "approved" },
      { id: "bbbbbbbb", space_id: "s1", member_id: "m1", kind: "expense", amount_minor: 20_000, description_ar: "تذاكر", description_en: "Tickets", occurred_at: "2026-08-02T12:30:00.000Z", status: "approved" },
    ],
  });
  assert.match(html, /كشف حساب تفصيلي/);
  assert.match(html, /جمعية السفر/);
  assert.match(html, /إيداع اشتراك/);
  assert.match(html, /تذاكر/);
  assert.match(html, /ماجد/);
  assert.match(html, /wazen-lockup\.png/);
  assert.match(html, /onclick="window.print\(\)"/);
  assert.match(html, /@page \{ size: A4;/);
});

test("print document CSS uses large readable fonts for paper output", async () => {
  const { PRINT_DOCUMENT_CSS, wrapPrintDocument } = await import("../lib/print-document.ts");
  assert.match(PRINT_DOCUMENT_CSS, /body \{[\s\S]*font-size: 16px;/);
  assert.match(PRINT_DOCUMENT_CSS, /table \{[\s\S]*font-size: 16px;/);
  assert.match(PRINT_DOCUMENT_CSS, /\.head h1 \{[\s\S]*font-size: 30px;/);
  assert.match(PRINT_DOCUMENT_CSS, /footer\.sheet-foot \{[\s\S]*font-size: 14px;/);
  assert.match(PRINT_DOCUMENT_CSS, /@media print \{[\s\S]*font-size: 16px;/);
  assert.doesNotMatch(PRINT_DOCUMENT_CSS, /table \{[^}]*font-size: 12px;/);
  const html = wrapPrintDocument({
    locale: "ar",
    title: "إيصال وازن",
    entityName: "جمعية السفر",
    logoUrl: "/brand/wazen-lockup.png",
    subtitle: "2026/08/16",
    bodyHtml: "<section><table><tr><td>الوصف</td><td>تسوية</td></tr></table></section>",
  });
  assert.match(html, /font-size: 16px/);
  assert.match(html, /إيصال وازن/);
});
