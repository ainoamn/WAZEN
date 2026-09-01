import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBalanceAlertHtml,
  buildStatementSummaryHtml,
  isGroupSpaceType,
} from "../lib/member-statement-email-content.ts";
import { buildMemberLedger } from "../lib/member-ledger.ts";
import { applyTemplatePlaceholders, brandedEmailShell, DEFAULT_EMAIL_TEMPLATES } from "../lib/email-template-catalog.ts";

test("isGroupSpaceType recognizes group wallets", () => {
  assert.equal(isGroupSpaceType("society"), true);
  assert.equal(isGroupSpaceType("personal"), false);
});

test("balance alert highlights amount owed to association", () => {
  const html = buildBalanceAlertHtml({
    locale: "ar",
    owesLabel: "34.500",
    creditLabel: "0.000",
    owesMinor: 34500,
    creditMinor: 0,
  });
  assert.match(html, /عليك للجمعية مبلغ/);
  assert.match(html, /34\.500/);
});

test("statement summary includes ledger totals", () => {
  const ledger = buildMemberLedger({
    member: {
      id: "m1",
      space_id: "s1",
      display_name: "Member",
      due_minor: 10000,
      paid_minor: 5000,
      extra_minor: 0,
    },
    spaceNameAr: "جمعية",
    spaceNameEn: "Society",
    currency: "OMR",
    plan: null,
    installments: [],
    transactions: [],
    settlements: [],
    tripExpenses: [],
    expenseSplits: [],
  });
  const html = buildStatementSummaryHtml({ locale: "ar", currency: "OMR", ledger });
  assert.match(html, /المدفوع/);
  assert.match(html, /عليه/);
});

test("member_statement email template renders politely with CTA", () => {
  const definition = DEFAULT_EMAIL_TEMPLATES.member_statement;
  const vars = {
    displayName: "أحمد",
    walletName: "جمعية السفر",
    messageHtml: "<p>summary</p>",
    balanceAlertHtml: "<p>alert</p>",
    transactionNoteHtml: "<p>txn</p>",
    link: "https://example.com/s/token",
  };
  const subject = applyTemplatePlaceholders(definition.subjectAr, vars);
  const bodyHtml = applyTemplatePlaceholders(definition.bodyHtmlAr, vars);
  const html = brandedEmailShell({
    title: subject,
    bodyHtml,
    logoUrl: "https://example.com/brand/wazen-lockup.png",
    appOrigin: "https://example.com",
    locale: "ar",
    ctaUrl: vars.link,
    ctaLabel: "عرض الكشف التفصيلي",
  });
  assert.match(subject, /جمعية السفر/);
  assert.match(html, /السلام عليكم/);
  assert.match(html, /عرض الكشف التفصيلي/);
  assert.match(html, /https:\/\/example\.com\/s\/token/);
});
