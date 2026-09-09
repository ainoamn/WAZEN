import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseKeeper,
  duplicateSummary,
  findDuplicateClusters,
  findMultiAssociationPeople,
  findSameSpaceNameClusters,
  linkedMembershipsByPhone,
  mergedLedgerTotals,
  mergeInstallmentPair,
  phonesEquivalent,
} from "../lib/member-duplicates.ts";
import { parseContactFile, parseCsvContacts, parseVcardContacts, contactsToCsv, contactsToVcard } from "../lib/contact-file.ts";
import { contactsFromGooglePeople } from "../lib/google-contacts.ts";

const space = "space-1";
const other = "space-2";

test("equivalent Oman numbers are treated as the same person", () => {
  assert.equal(phonesEquivalent("9904406", "9689904406"), true);
  assert.equal(phonesEquivalent("+968 9904 406", "9904406"), true);
  assert.equal(phonesEquivalent("9904406", "91112222"), false);
});

test("duplicate clusters stay inside one association and ignore other wallets", () => {
  const clusters = findDuplicateClusters([
    { id: "a1", space_id: space, display_name: "سالم", email: "salem@x.com", phone: "9904406", role: "member", paid_minor: 10, due_minor: 100, extra_minor: 0 },
    { id: "a2", space_id: space, display_name: "سالم الحارثي", email: null, phone: "9689904406", role: "member", paid_minor: 20, due_minor: 100, extra_minor: 5 },
    { id: "b1", space_id: other, display_name: "سالم", email: "salem@x.com", phone: "9904406", role: "member", paid_minor: 50, due_minor: 200, extra_minor: 0 },
    { id: "c1", space_id: space, display_name: "محمد", email: "mohd@x.com", phone: "91112222", role: "member", paid_minor: 0, due_minor: 100, extra_minor: 0 },
  ]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].spaceId, space);
  assert.equal(clusters[0].extraCount, 1);
  assert.equal(clusters[0].members.length, 2);
  assert.ok(clusters[0].members.every((item) => item.space_id === space));
  const summary = duplicateSummary(clusters);
  assert.equal(summary.clusterCount, 1);
  assert.equal(summary.extraAccounts, 1);
});

test("membership in two associations is listed separately and is not a merge cluster", () => {
  const members = [
    { id: "a1", space_id: space, display_name: "عبد الحميد", phone: "96895655200", role: "member", paid_minor: 0, due_minor: 0, extra_minor: 0 },
    { id: "a2", space_id: other, display_name: "عبد الحميد", phone: "96895655200", role: "member", paid_minor: 0, due_minor: 0, extra_minor: 0 },
    { id: "b1", space_id: space, display_name: "ماجد", phone: "96899260305", role: "member", paid_minor: 0, due_minor: 0, extra_minor: 0 },
  ];
  assert.equal(findDuplicateClusters(members).length, 0);
  const multi = findMultiAssociationPeople(members);
  assert.equal(multi.length, 1);
  assert.equal(multi[0].associationCount, 2);
  assert.equal(multi[0].members.length, 2);
});

test("linked memberships by phone include every association for the same person", () => {
  const seed = { id: "a1", phone: "96895655200" };
  const linked = linkedMembershipsByPhone(seed, [
    seed,
    { id: "a2", phone: "96895655200" },
    { id: "b1", phone: "96899260305" },
  ]);
  assert.equal(linked.length, 2);
  assert.deepEqual(linked.map((item) => item.id), ["a1", "a2"]);
});

test("same name with different phones inside one association is a name cluster", () => {
  const clusters = findSameSpaceNameClusters([
    { id: "a1", space_id: space, display_name: "سالم", phone: "96895655200", role: "member", status: "active", paid_minor: 0, due_minor: 0, extra_minor: 0 },
    { id: "a2", space_id: space, display_name: "سالم", phone: "96896552661", role: "member", status: "active", paid_minor: 0, due_minor: 0, extra_minor: 0 },
    { id: "b1", space_id: other, display_name: "سالم", phone: "96891112222", role: "member", status: "active", paid_minor: 0, due_minor: 0, extra_minor: 0 },
  ]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].spaceId, space);
  assert.equal(clusters[0].extraCount, 1);
});

test("arabic and latin names with different phones are not auto-clustered", () => {
  const members = [
    { id: "a1", space_id: space, display_name: "عبد الحميد", phone: "96895655200", role: "member", status: "active", paid_minor: 0, due_minor: 0, extra_minor: 0 },
    { id: "a2", space_id: other, display_name: "ABDUL HAMID", phone: "96896552661", role: "member", status: "active", paid_minor: 0, due_minor: 0, extra_minor: 0 },
  ];
  assert.equal(findSameSpaceNameClusters(members).length, 0);
  assert.equal(findDuplicateClusters(members).length, 0);
});

test("same email with different phones is not a duplicate cluster", () => {
  const clusters = findDuplicateClusters([
    { id: "a1", space_id: space, display_name: "سالم", email: "shared@x.com", phone: "9904406", role: "member", paid_minor: 0, due_minor: 0, extra_minor: 0 },
    { id: "a2", space_id: space, display_name: "محمد", email: "shared@x.com", phone: "91112222", role: "member", paid_minor: 0, due_minor: 0, extra_minor: 0 },
  ]);
  assert.equal(clusters.length, 0);
});

test("two linked logins in the same wallet are blocked from merging", () => {
  const clusters = findDuplicateClusters([
    { id: "a1", space_id: space, display_name: "سالم", email: "a@x.com", phone: "9904406", role: "member", user_id: "u1", paid_minor: 0, due_minor: 0, extra_minor: 0 },
    { id: "a2", space_id: space, display_name: "سالم 2", email: "b@x.com", phone: "9689904406", role: "member", user_id: "u2", paid_minor: 0, due_minor: 0, extra_minor: 0 },
  ]);
  assert.equal(clusters[0].blockedReason, "linked_accounts_conflict");
  assert.equal(duplicateSummary(clusters).mergeableClusters, 0);
});

test("keeper prefers owner then linked login then higher paid", () => {
  const keeper = chooseKeeper([
    { id: "m1", space_id: space, display_name: "أ", email: null, phone: "9904406", role: "member", paid_minor: 80, due_minor: 100, extra_minor: 0 },
    { id: "m2", space_id: space, display_name: "ب", email: null, phone: "9904406", role: "owner", paid_minor: 0, due_minor: 100, extra_minor: 0 },
  ]);
  assert.equal(keeper.id, "m2");
});

test("merged ledger sums money in without doubling the dues plan", () => {
  const totals = mergedLedgerTotals(
    { id: "k", space_id: space, display_name: "ك", role: "member", paid_minor: 20, due_minor: 120, extra_minor: 3, addon_minor: 1 },
    [{ id: "d", space_id: space, display_name: "د", role: "member", paid_minor: 15, due_minor: 120, extra_minor: 2, addon_minor: 4 }],
  );
  assert.equal(totals.paid_minor, 35);
  assert.equal(totals.extra_minor, 5);
  assert.equal(totals.addon_minor, 5);
  assert.equal(totals.due_minor, 120);
});

test("installment merge keeps one month and caps paid at the amount", () => {
  const merged = mergeInstallmentPair(
    { period_index: 1, amount_minor: 20_000, paid_minor: 10_000 },
    { amount_minor: 20_000, paid_minor: 15_000 },
  );
  assert.equal(merged.amount_minor, 20_000);
  assert.equal(merged.paid_minor, 20_000);
  assert.equal(merged.status, "paid");
});

test("vcard and csv contact files parse names emails and phones", () => {
  const vcf = `BEGIN:VCARD\nVERSION:3.0\nFN:سالم الحارثي\nTEL;TYPE=CELL:+9689904406\nEMAIL:salem@example.com\nEND:VCARD\n`;
  const fromVcf = parseVcardContacts(vcf);
  assert.equal(fromVcf[0].displayName, "سالم الحارثي");
  assert.equal(fromVcf[0].email, "salem@example.com");
  const csv = "الاسم,البريد,الهاتف\nمحمد علي,mohd@x.com,91112222\n";
  const fromCsv = parseCsvContacts(csv);
  assert.equal(fromCsv[0].displayName, "محمد علي");
  assert.equal(fromCsv[0].phone, "91112222");
  const roundTrip = parseContactFile("book.csv", contactsToCsv(fromCsv));
  assert.equal(roundTrip[0].email, "mohd@x.com");
  assert.match(contactsToVcard(fromVcf), /BEGIN:VCARD/);
});

test("google people connections map to saved contacts", () => {
  const rows = contactsFromGooglePeople({
    connections: [
      { names: [{ displayName: "سالم" }], emailAddresses: [{ value: "salem@gmail.com" }], phoneNumbers: [{ value: "+968 9904 406" }] },
      { names: [{ displayName: "" }], emailAddresses: [], phoneNumbers: [] },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].displayName, "سالم");
  assert.equal(rows[0].email, "salem@gmail.com");
});
