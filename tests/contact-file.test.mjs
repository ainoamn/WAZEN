import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeContactFileBytes,
  parseCsvContacts,
  parseContactFile,
} from "../lib/contact-file.ts";
import { splitPhoneParts } from "../lib/phone.ts";

test("csv parses Arabic society headers name/phone/email", () => {
  const source = [
    "معرف العضو,الاسم,رقم الهاتف,البريد الإلكتروني",
    "1,إبراهيم بن سعيد,91100096,",
    "2,أحمد بن حمود,96961810,a@example.com",
  ].join("\n");
  const rows = parseCsvContacts(source);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].displayName, "إبراهيم بن سعيد");
  assert.equal(rows[0].phone, "91100096");
  assert.equal(rows[0].email, "");
  assert.equal(rows[1].email, "a@example.com");
});

test("semicolon CSV and phone-in-email column are recovered", () => {
  const source = "الاسم;البريد;الهاتف\nخالد;92993228;\n";
  const rows = parseCsvContacts(source);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].displayName, "خالد");
  assert.equal(rows[0].phone, "92993228");
  assert.equal(rows[0].email, "");
});

test("valid UTF-8 arabic is preferred over windows-1256 misread", () => {
  const arabic = "إبراهيم بن سعيد";
  const bytes = Uint8Array.from(Buffer.from(arabic, "utf8"));
  const text = decodeContactFileBytes(bytes.buffer);
  assert.equal(text, arabic);
});

test("xlsx magic throws", () => {
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);
  assert.throws(() => decodeContactFileBytes(zip.buffer), /XLSX_NOT_SUPPORTED/);
  assert.throws(() => parseContactFile("members.xlsx", "anything"), /XLSX_NOT_SUPPORTED/);
});

test("oman 8-digit mobile is not India +91", () => {
  const parts = splitPhoneParts("91100096");
  assert.equal(parts.dial, "968");
  assert.equal(parts.iso2, "OM");
  assert.equal(parts.national, "91100096");
});
