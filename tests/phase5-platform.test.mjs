import assert from "node:assert/strict";
import test from "node:test";
import { countryPack, listCountryPacks } from "../lib/country-packs.ts";
import { currencyScale } from "../lib/money.ts";
import { runWithDbUser, getDbRequestUserId, isRlsEnforceEnabled } from "../lib/db-request-context.ts";
import { normalizePushSubscription, vapidPublicKey } from "../lib/web-push.ts";

test("GCC country packs cover BH KW QA with matching currency scales", () => {
  const packs = listCountryPacks();
  assert.ok(packs.some((pack) => pack.country === "BH" && pack.currency === "BHD"));
  assert.ok(packs.some((pack) => pack.country === "KW" && pack.currency === "KWD"));
  assert.ok(packs.some((pack) => pack.country === "QA" && pack.currency === "QAR"));
  assert.equal(currencyScale("BHD"), 3);
  assert.equal(currencyScale("KWD"), 3);
  assert.equal(currencyScale("QAR"), 2);
  assert.equal(countryPack("bh").timezone, "Asia/Bahrain");
});

test("db request context stores user id for RLS enforce path", async () => {
  assert.equal(getDbRequestUserId(), "");
  await runWithDbUser("user-1", async () => {
    assert.equal(getDbRequestUserId(), "user-1");
  });
  assert.equal(getDbRequestUserId(), "");
  assert.equal(typeof isRlsEnforceEnabled(), "boolean");
});

test("push subscription normalizer rejects unsafe payloads", () => {
  assert.equal(normalizePushSubscription(null), null);
  assert.equal(normalizePushSubscription({ endpoint: "http://bad", keys: { p256dh: "a", auth: "b" } }), null);
  const ok = normalizePushSubscription({
    endpoint: "https://push.example/x",
    keys: { p256dh: "abc", auth: "def" },
  });
  assert.equal(ok?.endpoint, "https://push.example/x");
  assert.equal(typeof vapidPublicKey(), "string");
});
