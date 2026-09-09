/** Prevent duplicate name/email/phone among active members of the same space. */

import { ApiError } from "./api-error";
import { digitsOnly, toWhatsAppNumber } from "./phone";

export type MemberContactField = "email" | "phone" | "name";

export type MemberContactConflict = {
  field: MemberContactField;
  memberId: string;
  displayName: string;
};

export type MemberContactRow = {
  id: string;
  display_name: string;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  space_id?: string | null;
};

export const MEMBER_CONTACT_TAKEN_CODES = [
  "MEMBER_EMAIL_TAKEN",
  "MEMBER_PHONE_TAKEN",
  "MEMBER_NAME_TAKEN",
] as const;

export type MemberContactTakenCode = (typeof MEMBER_CONTACT_TAKEN_CODES)[number];

function normalizeEmail(value: string) {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeMemberName(value: string) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function phonesMatch(a: string, b: string) {
  const left = toWhatsAppNumber(a) || digitsOnly(a);
  const right = toWhatsAppNumber(b) || digitsOnly(b);
  if (!left || !right) return false;
  return left === right;
}

export function memberContactTakenCode(field: MemberContactField): MemberContactTakenCode {
  if (field === "email") return "MEMBER_EMAIL_TAKEN";
  if (field === "phone") return "MEMBER_PHONE_TAKEN";
  return "MEMBER_NAME_TAKEN";
}

export function memberContactTakenField(code: string | null | undefined): MemberContactField | null {
  if (code === "MEMBER_EMAIL_TAKEN") return "email";
  if (code === "MEMBER_PHONE_TAKEN") return "phone";
  if (code === "MEMBER_NAME_TAKEN") return "name";
  return null;
}

export function isMemberContactTakenError(code: string | null | undefined): code is MemberContactTakenCode {
  return memberContactTakenField(code) !== null;
}

export function findMemberContactConflictInRows(
  rows: MemberContactRow[],
  input: { email?: string | null; phone?: string | null; displayName?: string | null; excludeMemberId?: string | null },
): MemberContactConflict | null {
  const email = normalizeEmail(String(input.email ?? ""));
  const phoneRaw = String(input.phone ?? "").trim();
  const phone = phoneRaw ? (toWhatsAppNumber(phoneRaw) || digitsOnly(phoneRaw)) : "";
  const name = normalizeMemberName(String(input.displayName ?? ""));
  const excludeId = input.excludeMemberId ? String(input.excludeMemberId) : "";

  const active = rows.filter((row) => {
    if (excludeId && row.id === excludeId) return false;
    return (row.status ?? "active") === "active";
  });

  if (email) {
    const row = active.find((item) => normalizeEmail(String(item.email ?? "")) === email);
    if (row) return { field: "email", memberId: row.id, displayName: row.display_name };
  }

  if (phone) {
    const row = active.find((item) => phonesMatch(phone, String(item.phone ?? "")));
    if (row) return { field: "phone", memberId: row.id, displayName: row.display_name };
  }

  if (name) {
    const row = active.find((item) => normalizeMemberName(item.display_name) === name);
    if (row) return { field: "name", memberId: row.id, displayName: row.display_name };
  }

  return null;
}

export async function findSpaceMemberContactConflict(
  db: D1Database,
  spaceId: string,
  input: { email?: string | null; phone?: string | null; displayName?: string | null; excludeMemberId?: string | null },
): Promise<MemberContactConflict | null> {
  const excludeId = input.excludeMemberId ? String(input.excludeMemberId) : "";
  const rows = await db.prepare(
    `SELECT id, display_name, email, phone, status FROM members
     WHERE space_id=? AND status='active'
       AND (?='' OR id<>?)`,
  ).bind(spaceId, excludeId, excludeId).all<MemberContactRow>();
  return findMemberContactConflictInRows(rows.results ?? [], input);
}

export function throwMemberContactConflict(conflict: MemberContactConflict): never {
  throw new ApiError(409, memberContactTakenCode(conflict.field), {
    conflictName: conflict.displayName,
    conflictMemberId: conflict.memberId,
    conflictField: conflict.field,
  });
}

export function memberContactConflictMessage(
  conflict: { field: MemberContactField; displayName: string },
  locale: "ar" | "en",
) {
  const name = conflict.displayName || (locale === "ar" ? "عضو آخر" : "another member");
  if (locale === "ar") {
    if (conflict.field === "email") {
      return `هذا البريد مسجّل لمستخدم موجود («${name}»). للمتابعة حرّر بياناته.`;
    }
    if (conflict.field === "phone") {
      return `هذا الرقم مسجّل لمستخدم موجود («${name}»). للمتابعة حرّر بياناته.`;
    }
    return `هذا المستخدم موجود («${name}»). للمتابعة حرّر بياناته.`;
  }
  if (conflict.field === "email") {
    return `This email already belongs to “${name}”. To continue, edit their details.`;
  }
  if (conflict.field === "phone") {
    return `This phone number already belongs to “${name}”. To continue, edit their details.`;
  }
  return `This member already exists (“${name}”). To continue, edit their details.`;
}
