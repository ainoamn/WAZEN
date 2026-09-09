import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { clampDueDay, dueAtForPeriod, personalDueAlerts, reminderKindForDue, resolveInstallmentAmounts } from "../lib/personal-finance.ts";

test("installment math fills months from total and monthly amount", () => {
  const car = resolveInstallmentAmounts({ amountMinor: 98_000, totalMinor: 9_000_000, durationMonths: 0 });
  assert.equal(car.durationMonths, 92);
  assert.equal(car.totalMinor, 9_000_000);
  assert.equal(car.amountMinor, 98_000);
  const school = resolveInstallmentAmounts({ amountMinor: 50_000, totalMinor: 500_000, durationMonths: 0 });
  assert.equal(school.durationMonths, 10);
  const bill = resolveInstallmentAmounts({ amountMinor: 26_000, totalMinor: 0, durationMonths: 0 });
  assert.equal(bill.durationMonths, 0);
  assert.equal(bill.totalMinor, 0);
});

test("due day 31 lands on the last day of the month", () => {
  assert.equal(clampDueDay(31), 31);
  assert.equal(dueAtForPeriod("2026-02", 31).slice(0, 10), "2026-02-28");
  assert.equal(dueAtForPeriod("2026-09", 31).slice(0, 10), "2026-09-30");
  assert.equal(dueAtForPeriod("2026-09", 28).slice(0, 10), "2026-09-28");
});

test("reminder kind is eve yesterday of due and due on the day", () => {
  assert.equal(reminderKindForDue("2026-09-28T12:00:00.000Z", new Date("2026-09-27T06:00:00.000Z")), "eve");
  assert.equal(reminderKindForDue("2026-09-28T12:00:00.000Z", new Date("2026-09-28T06:00:00.000Z")), "due");
  assert.equal(reminderKindForDue("2026-09-28T12:00:00.000Z", new Date("2026-09-26T06:00:00.000Z")), null);
});

test("personal due alerts surface recurring bills on the personal wallet", () => {
  const alerts = personalDueAlerts(
    [{
      id: "occ1",
      space_id: "p1",
      due_at: "2026-09-28T12:00:00.000Z",
      status: "pending",
      expected_minor: 98_000,
      rule_name: "سيارة",
      total_minor: 9_000_000,
      rule_paid_minor: 0,
    }],
    [{ id: "p1", type: "personal", name_ar: "محفظتي", name_en: "Mine" }],
    new Date("2026-09-27T06:00:00.000Z"),
  );
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].ar, /غداً/);
  assert.match(alerts[0].href ?? "", /view=personal/);
});

test("personal due alerts remind to approve monthly income", () => {
  const alerts = personalDueAlerts(
    [{
      id: "inc1",
      space_id: "p1",
      due_at: "2026-09-01T12:00:00.000Z",
      status: "pending",
      expected_minor: 1_200_000,
      rule_name: "راتب",
      rule_kind: "income",
    }],
    [{ id: "p1", type: "personal", name_ar: "محفظتي", name_en: "Mine" }],
    new Date("2026-09-01T06:00:00.000Z"),
  );
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].ar, /دخل/);
  assert.match(alerts[0].ar, /اعتمد/);
  assert.match(alerts[0].id, /personal-income/);
});

test("personal wallet UI and cron expose installment reminders", () => {
  const root = process.cwd();
  const ui = fs.readFileSync(path.join(root, "components/personal/personal-wallet.tsx"), "utf8");
  const tick = fs.readFileSync(path.join(root, "app/api/jobs/tick/route.ts"), "utf8");
  const catalog = fs.readFileSync(path.join(root, "lib/email-template-catalog.ts"), "utf8");
  const runtime = fs.readFileSync(path.join(root, "db/runtime.ts"), "utf8");
  const reminders = fs.readFileSync(path.join(root, "lib/personal-bill-reminders.ts"), "utf8");
  assert.match(ui, /قسط \/ تمويل/);
  assert.match(ui, /فاتورة شهرية/);
  assert.match(ui, /دخل شهري ثابت/);
  assert.match(ui, /personal-section-nav/);
  assert.match(ui, /صفحة الدخل/);
  assert.match(ui, /صفحة المصروف/);
  assert.match(ui, /المعاملات/);
  assert.match(ui, /يوم الدفع كل شهر/);
  const categories = fs.readFileSync(path.join(root, "lib/personal-categories.ts"), "utf8");
  assert.match(categories, /مصاريف البيت/);
  assert.match(categories, /راتب شهري/);
  assert.match(tick, /runPersonalBillReminders/);
  assert.match(catalog, /personal_bill_reminder/);
  assert.match(runtime, /personal_reminder_log/);
  assert.match(runtime, /category TEXT NOT NULL DEFAULT ''/);
  assert.match(reminders, /r\.kind IN \('expense','income'\)/);
  const dashboard = fs.readFileSync(path.join(root, "app/api/dashboard/route.ts"), "utf8");
  assert.match(dashboard, /rule\.kind === "expense"/);
  const v1Create = fs.readFileSync(path.join(root, "app/api/v1/spaces/[spaceId]/rules/route.ts"), "utf8");
  assert.match(v1Create, /dueDay: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(31\)/);
});
