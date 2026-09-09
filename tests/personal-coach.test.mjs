import assert from "node:assert/strict";
import test from "node:test";
import { inferPersonalCategory, normalizePersonalCategory, personalCategoryLabel } from "../lib/personal-categories.ts";
import { buildPersonalCoachBriefing } from "../lib/personal-coach.ts";

test("category presets infer from Arabic names", () => {
  assert.equal(inferPersonalCategory("expense", "فاتورة الكهرباء"), "electricity");
  assert.equal(inferPersonalCategory("expense", "فاتورة الماء"), "water");
  assert.equal(inferPersonalCategory("expense", "قسط السيارة"), "cars");
  assert.equal(inferPersonalCategory("income", "راتب سبتمبر"), "salary");
  assert.equal(inferPersonalCategory("income", "دخل تجاري من المحل"), "business");
  assert.equal(normalizePersonalCategory("expense", "مصاريف البيت", ""), "home");
  assert.equal(personalCategoryLabel("income", "salary", "ar"), "راتب شهري");
});

test("coach flags a monthly gap and pending approve actions", () => {
  const briefing = buildPersonalCoachBriefing({
    asOf: new Date("2026-09-09T06:00:00.000Z"),
    rules: [
      { kind: "income", status: "active", schedule: "monthly", amount_minor: 800_000, category: "salary", name: "راتب" },
      { kind: "expense", status: "active", schedule: "monthly", amount_minor: 1_200_000, category: "home", name: "البيت" },
    ],
    occurrences: [
      { status: "pending", rule_kind: "income", expected_minor: 800_000, period_key: "2026-09", due_at: "2026-09-01T12:00:00.000Z" },
      { status: "pending", rule_kind: "expense", expected_minor: 1_200_000, period_key: "2026-09", due_at: "2026-09-05T12:00:00.000Z" },
    ],
  });
  assert.equal(briefing.plannedInMinor, 800_000);
  assert.equal(briefing.plannedOutMinor, 1_200_000);
  assert.equal(briefing.plannedLeftMinor, -400_000);
  assert.ok(briefing.tips.some((tip) => tip.id === "gap"));
  assert.ok(briefing.tips.some((tip) => tip.id === "pending-in"));
  assert.ok(briefing.tips.some((tip) => tip.id === "pending-out"));
});

test("coach asks for a salary when no monthly income exists", () => {
  const briefing = buildPersonalCoachBriefing({
    asOf: new Date("2026-09-09T06:00:00.000Z"),
    rules: [{ kind: "expense", status: "active", schedule: "monthly", amount_minor: 26_000, category: "phone", name: "هاتف" }],
    occurrences: [],
  });
  assert.equal(briefing.plannedInMinor, 0);
  assert.ok(briefing.tips.some((tip) => tip.id === "no-income"));
});
