import assert from "node:assert/strict";
import test from "node:test";
import {
  actionLabel,
  countryLabel,
  csvHeaderLabel,
  errorLabel,
  methodLabel,
  roleLabel,
  scopeLabel,
  statusLabel,
} from "../lib/admin-labels.ts";

test("admin labels stay bilingual and never leak raw codes for known keys", () => {
  assert.equal(roleLabel("super_admin", "ar"), "مدير المنصة");
  assert.equal(roleLabel("super_admin", "en"), "Super admin");
  assert.equal(statusLabel("pending_payment", "ar"), "بانتظار الدفع");
  assert.equal(statusLabel("pending_payment", "en"), "Awaiting payment");
  assert.equal(methodLabel("apple_pay", "ar"), "آبل باي");
  assert.equal(methodLabel("apple_pay", "en"), "Apple Pay");
  assert.equal(scopeLabel("local", "ar"), "محلية");
  assert.equal(scopeLabel("regional", "en"), "Regional");
  assert.equal(countryLabel("om", "ar"), "عُمان");
  assert.equal(countryLabel("SA", "en"), "Saudi Arabia");
  assert.equal(csvHeaderLabel("display_name", "ar"), "الاسم");
  assert.equal(csvHeaderLabel("display_name", "en"), "Name");
  assert.equal(errorLabel("SAVE_FAILED", "ar"), "تعذر الحفظ");
  assert.equal(errorLabel("SAVE_FAILED", "en"), "Could not save");
  assert.equal(actionLabel("plan.upserted", "ar"), "حفظ الباقة");
  assert.equal(actionLabel("plan.upserted", "en"), "Plan saved");
});
