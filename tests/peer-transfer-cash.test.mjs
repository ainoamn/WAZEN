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
