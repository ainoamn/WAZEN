import assert from "node:assert/strict";
import test from "node:test";
import { buildMemberStatementWhatsAppMessage, signMemberStatementToken, verifyMemberStatementToken } from "../lib/statement-share.ts";
import { buildMemberLedgerHtml } from "../lib/member-ledger.ts";

test("member statement tokens round-trip and reject tampering", () => {
  const token = signMemberStatementToken({ memberId: "m1", spaceId: "s1", focus: "owes", locale: "ar", ttlMs: 60_000 });
  const payload = verifyMemberStatementToken(token);
  assert.equal(payload?.memberId, "m1");
  assert.equal(payload?.spaceId, "s1");
  assert.equal(payload?.focus, "owes");
  assert.equal(verifyMemberStatementToken(`${token}x`), null);
  assert.equal(verifyMemberStatementToken("bad.token"), null);
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
