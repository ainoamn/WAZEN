import assert from "node:assert/strict";
import test from "node:test";
import { computeWorkspaceAlerts } from "../lib/workspace-alerts.ts";

test("workspace alerts flag overdue dues and negative balance", () => {
  const alerts = computeWorkspaceAlerts({
    spaces: [
      { id: "s1", name_ar: "جمعية", name_en: "Assoc", type: "society", balance_minor: -1000 },
    ],
    members: [
      { id: "m1", space_id: "s1", display_name: "أحمد", due_minor: 20_000, paid_minor: 5_000, status: "active" },
    ],
    periods: [{ space_id: "s1", status: "closed", label: "2025" }],
    planStatus: "active",
  });
  assert.ok(alerts.some((item) => item.id === "dues-overdue"));
  assert.ok(alerts.some((item) => item.id.startsWith("deficit:")));
  assert.ok(alerts.some((item) => item.id === "no-open-period"));
});

test("workspace alerts include plan grace", () => {
  const ends = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const alerts = computeWorkspaceAlerts({
    spaces: [],
    members: [],
    graceEndsAt: ends,
  });
  assert.ok(alerts.some((item) => item.id === "plan-grace"));
});

test("uncollected trip goal is a reminder, not dues-overdue", () => {
  const alerts = computeWorkspaceAlerts({
    spaces: [
      { id: "t1", name_ar: "رحلة", name_en: "Trip", type: "trip", balance_minor: 0 },
    ],
    members: [
      { id: "m1", space_id: "t1", display_name: "ماجد", due_minor: 10_000, paid_minor: 0, status: "active" },
    ],
  });
  assert.equal(alerts.some((item) => item.id === "dues-overdue"), false);
  const reminder = alerts.find((item) => item.id === "trip-goal-uncollected");
  assert.ok(reminder);
  assert.match(reminder.ar, /ماجد/);
  assert.match(reminder.ar, /10\.000/);
});
