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
import { resolveWhatsAppAttach } from "../lib/statement-copy.ts";
import { buildCombinedMemberLedgerHtml, buildMemberLedgerHtml } from "../lib/member-ledger.ts";
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
  const token = signAssociationStatementToken({
    spaceId: "s9",
    filter: "valid",
    locale: "en",
    sheetKind: "dues",
    ttlMs: 60_000,
  });
  const payload = verifyAssociationStatementToken(token);
  assert.equal(payload?.spaceId, "s9");
  assert.equal(payload?.filter, "valid");
  assert.equal(payload?.locale, "en");
  assert.equal(payload?.sheetKind, "dues");
  assert.equal(verifyAnyStatementToken(token)?.kind, "association_statement");
  assert.equal(verifyMemberStatementToken(token), null);
});

test("combined member statement tokens keep every membership id", () => {
  const token = signMemberStatementToken({
    memberId: "m1",
    spaceId: "s1",
    memberIds: ["m1", "m2", "m3"],
    focus: "all",
    locale: "ar",
    ttlMs: 60_000,
  });
  const payload = verifyMemberStatementToken(token);
  assert.deepEqual(payload?.memberIds, ["m1", "m2", "m3"]);
  assert.equal(verifyAnyStatementToken(token)?.kind, "member_statement");
});

test("full WhatsApp statement lists every association then one link", () => {
  const message = buildMemberStatementWhatsAppMessage({
    locale: "ar",
    memberName: "عبد الحميد",
    walletName: "جمعية السفر للاخوان",
    focusLabel: "الكل",
    paidLabel: "340.000",
    owesLabel: "10.000",
    creditLabel: "0",
    statementUrl: "https://example.com/s/full",
    scope: "all",
    associations: [
      { walletName: "جمعية السفر للاخوان", paidLabel: "340.000", owesLabel: "0", creditLabel: "0" },
      { walletName: "بندر الصقله", paidLabel: "0", owesLabel: "10.000", creditLabel: "0" },
    ],
  });
  assert.match(message, /كشف كامل/);
  assert.match(message, /جمعية السفر للاخوان/);
  assert.match(message, /بندر الصقله/);
  assert.match(message, /https:\/\/example\.com\/s\/full/);
  assert.doesNotMatch(message, /^الجمعية: جمعية السفر للاخوان$/m);
});

test("combined print html includes a section for each association", () => {
  const html = buildCombinedMemberLedgerHtml({
    locale: "ar",
    logoUrl: "/brand/wazen-lockup.png",
    issuerName: "أمين",
    memberName: "عبد الحميد",
    focus: "all",
    sections: [
      {
        spaceName: "جمعية السفر للاخوان",
        currency: "OMR",
        ledger: { paidMinor: 340_000, addonMinor: 0, owesMinor: 0, creditMinor: 0, lines: [] },
      },
      {
        spaceName: "بندر الصقله",
        currency: "OMR",
        ledger: { paidMinor: 0, addonMinor: 0, owesMinor: 10_000, creditMinor: 0, lines: [] },
      },
    ],
  });
  assert.match(html, /كشف كامل لكل الجمعيات/);
  assert.match(html, /ملخص الجمعيات/);
  assert.match(html, /statement-association/);
  assert.match(html, /statement-totals/);
  assert.match(html, /جمعية السفر للاخوان/);
  assert.match(html, /بندر الصقله/);
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
  const letter = resolveWhatsAppAttach(null, "ar", "movements", "جمعية الحي");
  const message = buildAssociationStatementWhatsAppMessage({
    locale: "ar",
    walletName: "جمعية الحي",
    filterLabel: "كشف كامل وعام",
    balanceLabel: "120.000 ر.ع.",
    movementsLabel: "14",
    statementUrl: "https://example.com/s/assoc",
    sheetKind: "movements",
    attachOverride: letter,
    availableLabel: "150.000 ر.ع.",
    expensesLabel: "30.000 ر.ع.",
    arrearsLabel: "45.000 ر.ع.",
    lateMembersLabel: "3",
    committedMembersLabel: "12",
  });
  assert.match(message, /السلام عليكم ورحمة الله وبركاته/);
  assert.match(message, /الكشف المالي الشامل/);
  assert.match(message, /إدارة جمعية الحي/);
  assert.match(message, /المتوفر \(نقد \+ ودائع\): 150\.000/);
  assert.match(message, /المصروفات: 30\.000/);
  assert.match(message, /إجمالي المتأخرات: 45\.000/);
  assert.match(message, /عدد المتأخرين: 3/);
  assert.match(message, /عدد الملتزمين: 12/);
  assert.match(message, /https:\/\/example\.com\/s\/assoc/);
});

test("association arrears WhatsApp message uses approved letter without type-line boilerplate", () => {
  const letter = resolveWhatsAppAttach(null, "ar", "dues", "جمعية أبناء خلفان");
  const message = buildAssociationStatementWhatsAppMessage({
    locale: "ar",
    walletName: "جمعية أبناء خلفان",
    filterLabel: "متأخرات",
    balanceLabel: "0",
    movementsLabel: "0",
    statementUrl: "https://example.com/s/dues",
    sheetKind: "dues",
    attachOverride: letter,
    availableLabel: "10.000 ر.ع.",
    expensesLabel: "2.000 ر.ع.",
    arrearsLabel: "8.000 ر.ع.",
    lateMembersLabel: "5",
    committedMembersLabel: "20",
  });
  assert.match(message, /كشف المستحقات المالية المتأخرة عن السداد/);
  assert.match(message, /إدارة جمعية أبناء خلفان/);
  assert.doesNotMatch(message, /نوع الكشف:/);
  assert.doesNotMatch(message, /عدد الحركات/);
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
  assert.match(html, /statement-association/);
  assert.match(html, /statement-movements/);
  assert.match(html, /دفعة اشتراك/);
  assert.match(html, /data-orientation="portrait"/);
});
