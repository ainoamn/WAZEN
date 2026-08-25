import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("phase 25 smart pay, pay preview, and member ledger", () => {
  const payments = fs.readFileSync(path.join(root, "lib/installment-payments.ts"), "utf8");
  const smart = fs.readFileSync(path.join(root, "lib/v1-smart-pay.ts"), "utf8");
  const ledgerLib = fs.readFileSync(path.join(root, "lib/v1-member-ledger.ts"), "utf8");
  const smartRoute = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/members/[memberId]/smart-pay/route.ts"), "utf8");
  const preview = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/members/[memberId]/pay/preview/route.ts"), "utf8");
  const ledger = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/members/[memberId]/ledger/route.ts"), "utf8");
  const hooks = fs.readFileSync(path.join(root, "lib/integration-webhooks.ts"), "utf8");
  const openapi = fs.readFileSync(path.join(root, "app/api/v1/openapi/route.ts"), "utf8");
  const developers = fs.readFileSync(path.join(root, "app/developers/developers-client.tsx"), "utf8");
  const security = fs.readFileSync(path.join(root, "app/account/security/security-client.tsx"), "utf8");

  assert.match(payments, /paymentInstallmentStatements/);
  assert.match(smart, /applyV1SmartPay/);
  assert.match(smart, /previewV1MemberPay/);
  assert.match(smart, /smart_accountant/);
  assert.match(ledgerLib, /getV1MemberLedger/);
  assert.match(smartRoute, /applyV1SmartPay/);
  assert.match(preview, /previewV1MemberPay/);
  assert.match(ledger, /getV1MemberLedger/);
  assert.match(hooks, /smart_pay\.applied/);
  assert.match(openapi, /phase25/);
  assert.match(openapi, /\/smart-pay/);
  assert.match(openapi, /\/pay\/preview/);
  assert.match(openapi, /\/ledger/);
  assert.match(developers, /phase 25/);
  assert.match(developers, /\/smart-pay/);
  assert.match(developers, /\/ledger/);
  assert.match(security, /smart_pay\.applied/);
});
