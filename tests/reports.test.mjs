import assert from "node:assert/strict";
import test from "node:test";
import { REPORT_CATALOG, buildReportHtml } from "../lib/reports.ts";

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
    logoUrl: "https://example.com/brand/wazen-lockup.svg",
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

  assert.match(html, /wazen-lockup\.svg/);
  assert.match(html, /جمعية الإخوة/);
  assert.match(html, /عبد الحميد/);
  assert.match(html, /تقرير العميل/);
  assert.match(html, /عليه/);
});
