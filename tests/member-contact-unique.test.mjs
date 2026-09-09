import assert from "node:assert/strict";
import test from "node:test";
import {
  findMemberContactConflictInRows,
  isMemberContactTakenError,
  memberContactConflictMessage,
  memberContactTakenCode,
  memberContactTakenField,
  normalizeMemberName,
} from "../lib/member-contact-unique.ts";

const members = [
  { id: "m1", display_name: "سالم الحارثي", email: "salem@example.com", phone: "9689904406", status: "active" },
  { id: "m2", display_name: "محمد علي", email: "mohd@example.com", phone: "96891112222", status: "active" },
  { id: "m3", display_name: "مؤرشف", email: "old@example.com", phone: "96893334444", status: "archived" },
];

test("duplicate email in the same space is rejected", () => {
  const conflict = findMemberContactConflictInRows(members, { email: "Salem@example.com" });
  assert.ok(conflict);
  assert.equal(conflict.field, "email");
  assert.equal(conflict.memberId, "m1");
  assert.equal(memberContactTakenCode(conflict.field), "MEMBER_EMAIL_TAKEN");
});

test("duplicate phone matches Oman numbers with or without country code", () => {
  const conflict = findMemberContactConflictInRows(members, { phone: "9904406" });
  assert.ok(conflict);
  assert.equal(conflict.field, "phone");
  assert.equal(conflict.memberId, "m1");
  assert.equal(memberContactTakenCode(conflict.field), "MEMBER_PHONE_TAKEN");
});

test("duplicate member name is rejected even when contact details differ", () => {
  const conflict = findMemberContactConflictInRows(members, {
    displayName: "  سالم   الحارثي ",
    email: "other@example.com",
    phone: "96895556666",
  });
  assert.ok(conflict);
  assert.equal(conflict.field, "name");
  assert.equal(conflict.memberId, "m1");
  assert.equal(normalizeMemberName("  سالم   الحارثي "), "سالم الحارثي");
});

test("email conflict is reported before phone or name", () => {
  const conflict = findMemberContactConflictInRows(members, {
    displayName: "سالم الحارثي",
    email: "salem@example.com",
    phone: "9904406",
  });
  assert.ok(conflict);
  assert.equal(conflict.field, "email");
});

test("archived members do not block a new record", () => {
  const conflict = findMemberContactConflictInRows(members, {
    email: "old@example.com",
    phone: "93334444",
    displayName: "مؤرشف",
  });
  assert.equal(conflict, null);
});

test("editing the same member does not conflict with itself", () => {
  const conflict = findMemberContactConflictInRows(members, {
    email: "salem@example.com",
    phone: "9904406",
    displayName: "سالم الحارثي",
    excludeMemberId: "m1",
  });
  assert.equal(conflict, null);
});

test("conflict message tells the user to edit existing details", () => {
  const ar = memberContactConflictMessage({ field: "phone", displayName: "سالم الحارثي" }, "ar");
  assert.match(ar, /هذا الرقم مسجّل لمستخدم موجود/);
  assert.match(ar, /حرّر بياناته/);
  const nameAr = memberContactConflictMessage({ field: "name", displayName: "سالم الحارثي" }, "ar");
  assert.match(nameAr, /هذا المستخدم موجود/);
  assert.match(nameAr, /حرّر بياناته/);
  const en = memberContactConflictMessage({ field: "email", displayName: "Salem" }, "en");
  assert.match(en, /edit their details/i);
});

test("taken error codes map back to contact fields", () => {
  assert.equal(memberContactTakenField("MEMBER_EMAIL_TAKEN"), "email");
  assert.equal(memberContactTakenField("MEMBER_PHONE_TAKEN"), "phone");
  assert.equal(memberContactTakenField("MEMBER_NAME_TAKEN"), "name");
  assert.equal(isMemberContactTakenError("MEMBER_PHONE_TAKEN"), true);
  assert.equal(isMemberContactTakenError("INVALID_MEMBER"), false);
});
