import assert from "node:assert/strict";
import test from "node:test";
import { resolveMemberRemovalDecision } from "../lib/member-lifecycle.ts";

test("hard delete only for unlinked members without history", () => {
  assert.deepEqual(
    resolveMemberRemovalDecision({ prefer: "remove", linkedToAccount: false, hasHistory: false }),
    { mode: "remove" },
  );
});

test("linked accounts cannot be hard-deleted", () => {
  assert.deepEqual(
    resolveMemberRemovalDecision({ prefer: "remove", linkedToAccount: true, hasHistory: false }),
    { error: "MEMBER_LINKED_ACCOUNT" },
  );
  assert.deepEqual(
    resolveMemberRemovalDecision({ prefer: "auto", linkedToAccount: true, hasHistory: false }),
    { mode: "archive" },
  );
});

test("history blocks hard delete and auto archives", () => {
  assert.deepEqual(
    resolveMemberRemovalDecision({ prefer: "remove", linkedToAccount: false, hasHistory: true }),
    { error: "MEMBER_HAS_HISTORY" },
  );
  assert.deepEqual(
    resolveMemberRemovalDecision({ prefer: "auto", linkedToAccount: false, hasHistory: true }),
    { mode: "archive" },
  );
});
