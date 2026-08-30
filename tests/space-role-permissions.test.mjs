/** Unit checks for space role permission helpers. */

import test from "node:test";
import assert from "node:assert/strict";
import {
  canMutateCreatorTxn,
  parseSpaceRolePermissions,
  roleAllowsTxnAction,
  serializeSpaceRolePermissions,
} from "../lib/space-role-permissions.ts";

test("defaults: member view-only, manager full, treasurer add+delete", () => {
  const map = parseSpaceRolePermissions(null);
  assert.equal(roleAllowsTxnAction(map, "member", "view"), true);
  assert.equal(roleAllowsTxnAction(map, "member", "add"), false);
  assert.equal(roleAllowsTxnAction(map, "manager", "delete"), true);
  assert.equal(roleAllowsTxnAction(map, "treasurer", "add"), true);
  assert.equal(roleAllowsTxnAction(map, "treasurer", "delete"), true);
  assert.equal(roleAllowsTxnAction(map, "treasurer", "edit"), false);
});

test("rank: member cannot edit manager transaction", () => {
  assert.equal(canMutateCreatorTxn("member", "manager", "edit"), false);
  assert.equal(canMutateCreatorTxn("manager", "member", "edit"), true);
  assert.equal(canMutateCreatorTxn("owner", "manager", "delete"), true);
  assert.equal(canMutateCreatorTxn("treasurer", "supervisor", "delete"), false);
});

test("serialize round-trip keeps configurable roles", () => {
  const map = parseSpaceRolePermissions(null);
  map.member.add = true;
  const json = serializeSpaceRolePermissions(map);
  const again = parseSpaceRolePermissions(json);
  assert.equal(again.member.add, true);
  assert.equal(again.manager.edit, true);
});
