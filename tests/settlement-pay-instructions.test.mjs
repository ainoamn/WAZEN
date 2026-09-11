import assert from "node:assert/strict";
import test from "node:test";
import {
  canConfirmSettlement,
  formatPayInstructionSentence,
  pendingPayInstructions,
} from "../lib/settlement-pay-instructions.ts";
import { buildMemberStatementWhatsAppMessage } from "../lib/statement-share.ts";

test("pending pay instructions list each netted recipient, not the fund twice", () => {
  const items = pendingPayInstructions("m-hamid", [
    { id: "a", from_member_id: "m-hamid", to_member_id: "m-ali", to_member_name: "علي", amount_minor: 3_000, status: "pending" },
    { id: "b", from_member_id: "m-hamid", to_member_id: "m-harith", to_member_name: "حارث", amount_minor: 10_000, status: "pending" },
    { id: "c", from_member_id: "m-hamid", to_member_id: "m-omar", to_member_name: "عمر", amount_minor: 300, status: "pending" },
    { id: "d", from_member_id: "m-hamid", to_member_id: "space:s1", amount_minor: 18_422, status: "pending" },
    { id: "e", from_member_id: "m-ali", to_member_id: "m-harith", to_member_name: "حارث", amount_minor: 5_000, status: "pending" },
    { id: "f", from_member_id: "m-hamid", to_member_id: "m-ali", to_member_name: "علي", amount_minor: 3_000, status: "settled" },
  ], { locale: "ar" });
  assert.equal(items.length, 4);
  const sentence = formatPayInstructionSentence(items, "OMR", "ar");
  assert.match(sentence, /حول إلى/);
  assert.match(sentence, /حارث/);
  assert.match(sentence, /علي/);
  assert.match(sentence, /عمر/);
  assert.match(sentence, /صندوق الجمعية/);
  assert.match(sentence, / و/);
});

test("manager treasurer and payee can confirm, payer cannot", () => {
  assert.equal(canConfirmSettlement({ actorRole: "manager", actorUserId: "u1", toMemberId: "m2", toMemberUserId: "u2" }).as, "manager");
  assert.equal(canConfirmSettlement({ actorRole: "treasurer", actorUserId: "u3", toMemberId: "m2", toMemberUserId: "u2" }).as, "treasurer");
  assert.equal(canConfirmSettlement({ actorRole: "member", actorUserId: "u2", toMemberId: "m2", toMemberUserId: "u2" }).as, "payee");
  assert.equal(canConfirmSettlement({ actorRole: "member", actorUserId: "u-payer", toMemberId: "m2", toMemberUserId: "u2" }).ok, false);
  assert.equal(canConfirmSettlement({ actorRole: "member", actorUserId: "u2", toMemberId: "space:s1", toMemberUserId: "u2" }).ok, false);
});

test("WhatsApp statement includes the pay-instruction sentence", () => {
  const message = buildMemberStatementWhatsAppMessage({
    locale: "ar",
    memberName: "عبد الحميد",
    walletName: "بندر الصقله",
    focusLabel: "الكل",
    paidLabel: "١٣٫٨٠٣ ر.ع.",
    owesLabel: "(١٣٫٨٠٣ ر.ع.)",
    creditLabel: "٠٫٠٠٠ ر.ع.",
    statementUrl: "https://example.com/s/x",
    payInstruction: "حول إلى حارث ١٠٫٠٠٠ ر.ع. وإلى علي ٣٫٠٠٠ ر.ع. وإلى عمر ٠٫٣٠٠ ر.ع.",
  });
  assert.match(message, /كيف تسدّد/);
  assert.match(message, /حول إلى حارث/);
  assert.match(message, /إلى علي/);
  assert.match(message, /إلى عمر/);
});
