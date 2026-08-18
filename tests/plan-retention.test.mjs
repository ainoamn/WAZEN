import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_ARCHIVE_DAYS,
  USER_GRACE_DAYS,
  archivePurgeAt,
  graceEndsAt,
  spaceInUserGrace,
  userGraceWarningCopy,
} from "../lib/plan-retention-rules.ts";
import { dashboardNavLocked, planAllowsSpaceType } from "../lib/plan-features.ts";

test("retention windows are 15 user days and 60 admin days", () => {
  assert.equal(USER_GRACE_DAYS, 15);
  assert.equal(ADMIN_ARCHIVE_DAYS, 60);
  const start = "2026-08-17T12:00:00.000Z";
  assert.equal(graceEndsAt(start), "2026-09-01T12:00:00.000Z");
  assert.equal(archivePurgeAt(start), "2026-10-16T12:00:00.000Z");
});

test("user grace copy never mentions admin recovery or 60 days", () => {
  const ar = userGraceWarningCopy("ar", "2026-09-01T12:00:00.000Z", 3);
  const en = userGraceWarningCopy("en", "2026-09-01T12:00:00.000Z", 3);
  assert.match(ar.text, /15/);
  assert.match(en.text, /15/);
  assert.doesNotMatch(ar.text, /60|أرشيف إداري|بمقابل|مخاطبة الإدارة/);
  assert.doesNotMatch(en.text, /60|admin archive|paid restore|contact (the )?admin/i);
  assert.match(ar.text, /لن تتمكن من استرجاعها/);
  assert.match(en.text, /cannot be recovered/i);
});

test("grace filter keeps active grace wallets and hides expired ones", () => {
  const features = ["personal"];
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const spaces = [
    { id: "1", type: "personal" },
    { id: "2", type: "household", grace_until: future },
    { id: "3", type: "trip", grace_until: past },
    { id: "4", type: "society" },
  ];
  const allowed = spaces.filter((space) => {
    if (planAllowsSpaceType(features, space.type)) return true;
    return spaceInUserGrace(space);
  });
  assert.deepEqual(allowed.map((space) => space.id), ["1", "2"]);
  assert.equal(spaceInUserGrace({ grace_until: future }), true);
  assert.equal(spaceInUserGrace({ grace_until: past }), false);
});

test("dashboard nav unlocks grace wallet types without unlocking reports", () => {
  const features = ["personal"];
  assert.equal(dashboardNavLocked(features, "household"), true);
  assert.equal(dashboardNavLocked(features, "household", ["household"]), false);
  assert.equal(dashboardNavLocked(features, "reports", ["household"]), true);
});

test("plan access filter treats missing space lists as empty", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "lib/plan-retention.ts"), "utf8");
  assert.match(source, /filterSpacesForPlanAccess[\s\S]*spaces \?\? \[\]/);
});
