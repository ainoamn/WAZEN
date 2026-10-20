import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePersonKey,
  parseMembersCsv,
  parsePaymentsCsv,
  parseSocietyImportPack,
  societyPackExampleJson,
} from "../lib/society-import.ts";

test("normalizePersonKey collapses Arabic letter variants", () => {
  assert.equal(normalizePersonKey("إبراهيم بن سعيد"), normalizePersonKey("ابراهيم بن سعيد"));
  assert.equal(normalizePersonKey("أسامة"), normalizePersonKey("اسامه"));
});

test("members CSV reads Arabic society headers", () => {
  const rows = parseMembersCsv("الاسم,رقم الهاتف,البريد\nإبراهيم بن سعيد,91100096,\n");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].displayName, "إبراهيم بن سعيد");
  assert.equal(rows[0].phone, "91100096");
});

test("payments CSV reads date/name/amount", () => {
  const rows = parsePaymentsCsv("التاريخ,الاسم,المبلغ,ملاحظات\n2026-04-15,إبراهيم بن سعيد,12,مساهمة\n");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, "12");
  assert.equal(rows[0].memberName, "إبراهيم بن سعيد");
});

test("pack example parses and validates", () => {
  const pack = parseSocietyImportPack(societyPackExampleJson());
  assert.equal(pack.spaceName, "جمعية تجريبية");
  assert.equal(pack.members.length, 1);
  assert.equal(pack.payments?.length, 1);
  assert.equal(pack.expenses?.length, 1);
  assert.equal(Number(pack.openingBalance?.amount), 100);
});

test("pack rejects empty members", () => {
  assert.throws(() => parseSocietyImportPack({ spaceName: "جمعية", members: [] }), /INVALID_MEMBERS/);
});
