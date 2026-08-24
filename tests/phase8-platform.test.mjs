import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { computeLaunchReadiness } from "../lib/launch-readiness.ts";
import { isRlsDryRunEnabled, isRlsEnforceEnabled } from "../lib/db-request-context.ts";

const root = process.cwd();

test("launch readiness returns score and required ids", () => {
  const readiness = computeLaunchReadiness();
  assert.equal(typeof readiness.score, "number");
  assert.ok(readiness.score >= 0 && readiness.score <= 100);
  assert.ok(Array.isArray(readiness.items));
  assert.ok(readiness.items.some((item) => item.id === "database"));
  assert.ok(readiness.items.some((item) => item.id === "sentry"));
  assert.ok(readiness.items.some((item) => item.id === "legal_counsel"));
  assert.equal(typeof readiness.ready, "boolean");
  assert.equal(typeof isRlsEnforceEnabled(), "boolean");
  assert.equal(typeof isRlsDryRunEnabled(), "boolean");
});

test("phase 8 markers exist in platform, health, legal, checklist", () => {
  const platform = fs.readFileSync(path.join(root, "app/api/platform/route.ts"), "utf8");
  const health = fs.readFileSync(path.join(root, "app/api/health/route.ts"), "utf8");
  const legal = fs.readFileSync(path.join(root, "app/legal-page.tsx"), "utf8");
  const checklist = fs.readFileSync(path.join(root, "docs/LAUNCH-CHECKLIST.md"), "utf8");
  const admin = fs.readFileSync(path.join(root, "app/admin/admin-client.tsx"), "utf8");
  assert.match(platform, /runWithDbUser/);
  assert.match(platform, /computeLaunchReadiness/);
  assert.match(platform, /scope === "ops"/);
  assert.match(health, /computeLaunchReadiness/);
  assert.match(legal, /v0\.2\.0-legal/);
  assert.match(legal, /WAZEN_LEGAL_COUNSEL_SIGNED/);
  assert.match(checklist, /readiness\.ready/);
  assert.match(admin, /Launch readiness|جاهزية الإطلاق/);
});
