/** Prevent duplicate phone numbers among active members of the same space. Email and name may repeat. */

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
  "MEMBER_PHONE_TAKEN",
] as const;

export type MemberContactTakenCode = (typeof MEMBER_CONTACT_TAKEN_CODES)[number];

export function normalizeMemberName(value: string) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function phonesMatch(a: string, b: string) {
  const left = toWhatsAppNumber(a) || digitsOnly(a);
  const right = toWhatsAppNumber(b) || digitsOnly(b);
  if (!left || !right || left.length < 7 || right.length < 7) return false;
  if (left === right) return true;
  const tail = (value: string) => value.slice(-8);
  return tail(left) === tail(right) && tail(left).length >= 7;
}

export function memberContactTakenCode(_field: MemberContactField): MemberContactTakenCode {
  return "MEMBER_PHONE_TAKEN";
}

export function memberContactTakenField(code: string | null | undefined): MemberContactField | null {
  if (code === "MEMBER_PHONE_TAKEN") return "phone";
  return null;
}

export function isMemberContactTakenError(code: string | null | undefined): code is MemberContactTakenCode {
  return memberContactTakenField(code) !== null;
}

export function findMemberContactConflictInRows(
  rows: MemberContactRow[],
  input: { email?: string | null; phone?: string | null; displayName?: string | null; excludeMemberId?: string | null },
): MemberContactConflict | null {
  const phoneRaw = String(input.phone ?? "").trim();
  const phone = phoneRaw ? (toWhatsAppNumber(phoneRaw) || digitsOnly(phoneRaw)) : "";
  const excludeId = input.excludeMemberId ? String(input.excludeMemberId) : "";
  if (!phone) return null;

  const active = rows.filter((row) => {
    if (excludeId && row.id === excludeId) return false;
    return (row.status ?? "active") === "active";
  });

  const row = active.find((item) => phonesMatch(phone, String(item.phone ?? "")));
  if (row) return { field: "phone", memberId: row.id, displayName: row.display_name };
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
    return `هذا الرقم مسجّل لمستخدم موجود («${name}»). لا يُسمح بتكرار رقم الهاتف داخل الجمعية. للمتابعة حرّر بياناته.`;
  }
  return `This phone number already belongs to “${name}”. Phone numbers cannot be repeated in this association. To continue, edit their details.`;
}
