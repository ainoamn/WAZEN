import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeAuditMetadata } from "../lib/audit.ts";
import { decryptSecret, encryptSecret } from "../lib/encryption.ts";
import { escapeHtml, safeDownloadFilename } from "../lib/html.ts";
import { calculatePercentMinor, multiplyMinor, parseMoneyToMinor, parseNonNegativeMoneyToMinor } from "../lib/money.ts";
import { validateOutboundHttpsUrl } from "../lib/outbound.ts";
import { createTotpSecret, totpCode, verifyTotp } from "../lib/totp.ts";

test("audit regression: secrets are redacted recursively", () => {
  const sanitized = sanitizeAuditMetadata({ authorization: "Bearer abc", nested: { password: "DoNotLog", note: "safe", apiKey: "wzn_live_secret" }, token: "0123456789012345678901234567890123456789" });
  const text = JSON.stringify(sanitized);
  assert.doesNotMatch(text, /DoNotLog|wzn_live_secret|0123456789/);
  assert.match(text, /safe/);
  assert.match(text, /REDACTED/);
});

test("money conversion is decimal-exact and rejects unsupported precision", () => {
  assert.equal(parseMoneyToMinor("0.10", "SAR"), 10);
  assert.equal(parseMoneyToMinor("12.345", "OMR"), 12345);
  assert.equal(parseNonNegativeMoneyToMinor("0", "SAR"), 0);
  assert.equal(calculatePercentMinor(101, 1500), 15);
  assert.equal(multiplyMinor(2000, 60), 120000);
  assert.throws(() => parseMoneyToMinor("0.001", "SAR"));
  assert.throws(() => parseMoneyToMinor(0.1 + 0.2, "SAR"));
});

test("downloaded invoice HTML helpers neutralize markup and filenames", () => {
  assert.equal(escapeHtml(`<img src=x onerror="alert(1)">`), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert.equal(safeDownloadFilename("../../invoice:<script>"), "..-..-invoice-script-");
});

test("outbound URL validation blocks SSRF destinations", () => {
  assert.equal(validateOutboundHttpsUrl("https://api.example.com/v1", ["api.example.com"]).hostname, "api.example.com");
  for (const value of ["http://api.example.com", "https://127.0.0.1/x", "https://localhost/x", "https://10.0.0.1/x", "https://api.example.com:8443/x", "https://api.example.com.evil.test/x"]) {
    assert.throws(() => validateOutboundHttpsUrl(value, ["api.example.com"]));
  }
});

test("encryption separates purposes and supports key rotation", async () => {
  const oldKey = Buffer.alloc(32, 1).toString("base64"); const newKey = Buffer.alloc(32, 2).toString("base64");
  const oldRing = { active: "v1", keys: { v1: oldKey } }; const currentRing = { active: "v2", keys: { v1: oldKey, v2: newKey } };
  const encrypted = await encryptSecret("provider-secret", "payment-provider:test", oldRing);
  const decrypted = await decryptSecret(encrypted, "payment-provider:test", currentRing);
  assert.equal(decrypted.value, "provider-secret"); assert.equal(decrypted.keyVersion, "v1"); assert.equal(decrypted.needsRotation, true);
  await assert.rejects(() => decryptSecret(encrypted, "totp:user", currentRing));
});

test("production setup checklist flags missing Turso in production-like runtime", async () => {
  const { productionSetupChecklist } = await import("../lib/production-setup.ts");
  const original = {
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
    WAZEN_APP_ORIGIN: process.env.WAZEN_APP_ORIGIN,
    WAZEN_ENCRYPTION_KEYRING: process.env.WAZEN_ENCRYPTION_KEYRING,
    WAZEN_JOB_SECRET: process.env.WAZEN_JOB_SECRET,
    WAZEN_PAYMENT_WEBHOOK_SECRET: process.env.WAZEN_PAYMENT_WEBHOOK_SECRET,
    WAZEN_DEMO_MODE: process.env.WAZEN_DEMO_MODE,
    WAZEN_TRUST_OAI_HEADERS: process.env.WAZEN_TRUST_OAI_HEADERS,
    WAZEN_USE_NODE_SQLITE: process.env.WAZEN_USE_NODE_SQLITE,
    WAZEN_ADMIN_EMAILS: process.env.WAZEN_ADMIN_EMAILS,
  };

  try {
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    process.env.WAZEN_APP_ORIGIN = "https://wazen-roan.vercel.app";
    process.env.WAZEN_ENCRYPTION_KEYRING = "test";
    process.env.WAZEN_JOB_SECRET = "test";
    process.env.WAZEN_PAYMENT_WEBHOOK_SECRET = "test";
    process.env.WAZEN_DEMO_MODE = "0";
    process.env.WAZEN_TRUST_OAI_HEADERS = "0";
    process.env.WAZEN_USE_NODE_SQLITE = "0";
    process.env.WAZEN_ADMIN_EMAILS = "admin@wazen.pro";

    const setup = productionSetupChecklist();
    const database = setup.find((item) => item.id === "database");
    assert.equal(database?.ok, false);
    assert.match(database?.hint ?? "", /provision:production/);
    assert.equal(setup.find((item) => item.id === "auth_hardening")?.ok, true);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
