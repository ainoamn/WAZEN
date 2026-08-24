import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAssociationStatementWhatsAppMessage,
  buildMemberStatementWhatsAppMessage,
  signAssociationStatementToken,
  signMemberStatementToken,
  verifyAnyStatementToken,
  verifyAssociationStatementToken,
  verifyMemberStatementToken,
} from "../lib/statement-share.ts";
import { buildMemberLedgerHtml } from "../lib/member-ledger.ts";
import { buildAccountStatementModel } from "../lib/account-statement.ts";

test("member statement tokens round-trip and reject tampering", () => {
  const token = signMemberStatementToken({ memberId: "m1", spaceId: "s1", focus: "owes", locale: "ar", ttlMs: 60_000 });
  const payload = verifyMemberStatementToken(token);
  assert.equal(payload?.memberId, "m1");
  assert.equal(payload?.spaceId, "s1");
  assert.equal(payload?.focus, "owes");
  assert.equal(verifyMemberStatementToken(`${token}x`), null);
  assert.equal(verifyMemberStatementToken("bad.token"), null);
});

test("association statement tokens round-trip", () => {
  const token = signAssociationStatementToken({ spaceId: "s9", filter: "valid", locale: "en", ttlMs: 60_000 });
  const payload = verifyAssociationStatementToken(token);
  assert.equal(payload?.spaceId, "s9");
  assert.equal(payload?.filter, "valid");
  assert.equal(payload?.locale, "en");
  assert.equal(verifyAnyStatementToken(token)?.kind, "association_statement");
  assert.equal(verifyMemberStatementToken(token), null);
});

test("member statement WhatsApp message includes the share link", () => {
  const message = buildMemberStatementWhatsAppMessage({
    locale: "ar",
    memberName: "المعتصم",
    walletName: "جمعية السفر",
    focusLabel: "الكل",
    paidLabel: "20.000",
    owesLabel: "0",
    creditLabel: "5.000",
    statementUrl: "https://example.com/s/token",
  });
  assert.match(message, /السلام عليكم المعتصم/);
  assert.match(message, /كشف حساب وازن/);
  assert.match(message, /https:\/\/example\.com\/s\/token/);
});

test("association statement WhatsApp message includes wallet and link", () => {
  const message = buildAssociationStatementWhatsAppMessage({
    locale: "ar",
    walletName: "جمعية الحي",
    filterLabel: "الكشف الكامل",
    balanceLabel: "120.000 ر.ع.",
    movementsLabel: "14",
    statementUrl: "https://example.com/s/assoc",
  });
  assert.match(message, /كشف حساب الجمعية/);
  assert.match(message, /جمعية الحي/);
  assert.match(message, /https:\/\/example\.com\/s\/assoc/);
});

test("account statement model builds running balance lines", () => {
  const model = buildAccountStatementModel({
    locale: "ar",
    issuerName: "أمين",
    spaces: [{ id: "s1", name_ar: "جمعية", name_en: "Assoc", type: "society", currency: "OMR", balance_minor: 30_000 }],
    members: [{ id: "m1", space_id: "s1", display_name: "ماجد" }],
    transactions: [
      {
        id: "aaaaaaaa",
        space_id: "s1",
        member_id: "m1",
        kind: "contribution",
        amount_minor: 20_000,
        description_ar: "دفعة",
        description_en: "Pay",
        status: "approved",
        occurred_at: "2026-08-01T10:00:00.000Z",
      },
      {
        id: "bbbbbbbb",
        space_id: "s1",
        member_id: "m1",
        kind: "expense",
        amount_minor: 5_000,
        description_ar: "صرف",
        description_en: "Out",
        status: "approved",
        occurred_at: "2026-08-02T10:00:00.000Z",
      },
    ],
    spaceId: "s1",
    txnFilter: "valid",
  });
  assert.equal(model.movementCount, 2);
  assert.equal(model.totalInMinor, 20_000);
  assert.equal(model.totalOutMinor, 5_000);
  assert.ok(model.lines[0]?.ref);
});

test("member ledger print uses portrait statement cards", () => {
  const html = buildMemberLedgerHtml({
    locale: "ar",
    logoUrl: "/brand/wazen-lockup.png",
    issuerName: "أمين",
    memberName: "ماجد",
    spaceName: "جمعية السفر",
    currency: "OMR",
    focus: "all",
    ledger: {
      paidMinor: 20_000,
      addonMinor: 0,
      owesMinor: 0,
      creditMinor: 0,
      lines: [{
        at: "2026-08-01T10:00:00.000Z",
        focus: "paid",
        direction: "in",
        titleAr: "دفعة اشتراك",
        titleEn: "Dues",
        detailAr: "شهر 1",
        detailEn: "Month 1",
        amountMinor: 20_000,
      }],
    },
  });
  assert.match(html, /is-statement/);
  assert.match(html, /statement-card/);
  assert.match(html, /دفعة اشتراك/);
  assert.match(html, /data-orientation="portrait"/);
});
