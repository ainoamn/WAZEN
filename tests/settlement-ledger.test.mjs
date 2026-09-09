import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { memberRemainingSettlementOwe, peerSettlementNarration, peerSettlementReason } from "../lib/settlement-posting.ts";

test("peer settlement copy names from, to, why, and how", () => {
  const reason = peerSettlementReason(null);
  assert.match(reason.reasonAr, /صافي مصروفات الرحلة/);
  const copy = peerSettlementNarration({ fromName: "أحمد", toName: "خالد", ...reason });
  assert.match(copy.fromAr, /من أحمد إلى خالد/);
  assert.match(copy.fromAr, /السبب/);
  assert.match(copy.fromAr, /كيف/);
  assert.match(copy.toEn, /Ahmed|أحمد|Khalid|خالد|→/);
});

test("remaining owe sums only pending outgoing transfers", () => {
  const rows = [
    { from_member_id: "a", amount_minor: 10_000, status: "pending" },
    { from_member_id: "a", amount_minor: 5_000, status: "settled" },
    { from_member_id: "b", amount_minor: 8_000, status: "pending" },
  ];
  assert.equal(memberRemainingSettlementOwe("a", rows), 10_000);
  assert.equal(memberRemainingSettlementOwe("b", rows), 8_000);
});

test("dashboard loads posted settlements and posts a transfer journal", () => {
  const root = process.cwd();
  const api = fs.readFileSync(path.join(root, "app/api/dashboard/route.ts"), "utf8");
  const posting = fs.readFileSync(path.join(root, "lib/settlement-posting.ts"), "utf8");
  const ui = fs.readFileSync(path.join(root, "app/wazen-dashboard.tsx"), "utf8");
  assert.match(api, /status IN \('pending','settled'\)/);
  assert.match(api, /postPeerMemberSettlement/);
  assert.match(posting, /liability:member_due/);
  assert.match(posting, /liability:member_payable/);
  assert.doesNotMatch(posting, /addon_minor/);
  assert.match(ui, /سجل التحويلات/);
  assert.match(ui, /مدفوع/);
});
