import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("approved peer transfers never inflate member paid or fund cash in SQL rebuilds", () => {
  const posting = read("lib/settlement-posting.ts");
  const ledger = read("lib/ledger-void.ts");
  assert.match(posting, /fromAr: `تحويل مسجّل: /);
  assert.match(posting, /toAr: `استلام تحويل: /);
  assert.match(ledger, /NOT LIKE 'تحويل مسجّل:%'/);
  assert.match(ledger, /NOT LIKE 'استلام تحويل:%'/);
  const paid = ledger.slice(ledger.indexOf("paid_minor = COALESCE"), ledger.indexOf("extra_minor = COALESCE"));
  assert.match(paid, /NOT_PEER_TRANSFER_SQL\("t\."\)/);
  const cash = ledger.slice(ledger.indexOf("export async function writeApprovedCashBalance"), ledger.indexOf("export type VoidableTransaction"));
  assert.match(cash, /NOT_PEER_TRANSFER_SQL\(""\)/);
});

test("voiding either half of a peer transfer cancels the sibling and returns the settlement to pending", () => {
  const ledger = read("lib/ledger-void.ts");
  const revert = ledger.slice(ledger.indexOf("async function revertPeerTransfer"), ledger.indexOf("export async function repairVoidedPeerSettlements"));
  assert.match(revert, /UPDATE transactions SET status=\?/);
  assert.match(revert, /PEER_TRANSFER_SQL\(""\)/);
  assert.match(revert, /UPDATE settlements SET status='pending', settled_at=NULL/);
  assert.match(revert, /settled_at=\?/);
  assert.match(revert, /rebuildSpaceTripSettlements\(db, txn\.space_id\)/);
  const voidFn = ledger.slice(ledger.indexOf("export async function voidApprovedTransaction"));
  assert.match(voidFn, /isPeerTransferDescription\(txn\.description_ar\)/);
  assert.match(voidFn, /revertPeerTransfer\(db, txn, recordStatus\)/);
});

test("dashboard load heals settlements stuck settled after their transfer was voided", () => {
  const ledger = read("lib/ledger-void.ts");
  const repair = ledger.slice(ledger.indexOf("export async function repairVoidedPeerSettlements"));
  assert.match(repair, /s\.status='settled'/);
  assert.match(repair, /t\.status IN \('voided','superseded'\)/);
  assert.match(repair, /t\.occurred_at=s\.settled_at/);
  assert.match(repair, /rebuildSpaceTripSettlements\(db, spaceId\)/);
  const dashboard = read("app/api/dashboard/route.ts");
  assert.match(dashboard, /await repairVoidedPeerSettlements\(db, ids\)/);
});
