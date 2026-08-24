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
