import assert from "node:assert/strict";
import test from "node:test";
import { buildReceiptWhatsAppMessage, signReceiptShareToken, verifyReceiptShareToken, whatsappShareUrl } from "../lib/receipt-share.ts";

test("receipt share tokens round-trip and reject tampering", () => {
  const token = signReceiptShareToken({ transactionId: "txn-123", locale: "ar", ttlMs: 60_000 });
  const payload = verifyReceiptShareToken(token);
  assert.equal(payload?.transactionId, "txn-123");
  assert.equal(payload?.locale, "ar");
  assert.equal(verifyReceiptShareToken(`${token}x`), null);
  assert.equal(verifyReceiptShareToken("bad.token"), null);
});

test("whatsapp receipt message greets the member and includes the link", () => {
  const message = buildReceiptWhatsAppMessage({
    locale: "ar",
    memberName: "المعتصم",
    description: "مساهمة المعتصم · سداد 2026-07",
    walletName: "جمعية السفر للاخوان",
    amountLabel: "‏٢٠٫٠٠٠ OMR",
    dateLabel: "٢١‏/٨‏/٢٠٢٦",
    reference: "4C91AE8B",
    receiptUrl: "https://example.com/r/token",
  });
  assert.match(message, /السلام عليكم المعتصم/);
  assert.match(message, /إيصال وازن/);
  assert.match(message, /المساهم: المعتصم/);
  assert.match(message, /https:\/\/example\.com\/r\/token/);
  assert.equal(whatsappShareUrl("9689904406", "مرحبا").includes("wa.me/9689904406"), true);
});
