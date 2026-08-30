/** Prevent duplicate email/phone among active members of the same space. */

import { normalizeEmail } from "./auth";
import { digitsOnly, toWhatsAppNumber } from "./phone";
import { ApiError } from "./security";

export type MemberContactConflict = {
  field: "email" | "phone";
  memberId: string;
  displayName: string;
};

function phonesMatch(a: string, b: string) {
  const left = toWhatsAppNumber(a) || digitsOnly(a);
  const right = toWhatsAppNumber(b) || digitsOnly(b);
  if (!left || !right) return false;
  return left === right;
}

export async function findSpaceMemberContactConflict(
  db: D1Database,
  spaceId: string,
  input: { email?: string | null; phone?: string | null; excludeMemberId?: string | null },
): Promise<MemberContactConflict | null> {
  const email = normalizeEmail(String(input.email ?? ""));
  const phoneRaw = String(input.phone ?? "").trim();
  const phone = phoneRaw ? (toWhatsAppNumber(phoneRaw) || digitsOnly(phoneRaw)) : "";
  const excludeId = input.excludeMemberId ? String(input.excludeMemberId) : "";

  if (email) {
    const row = await db.prepare(
      `SELECT id, display_name FROM members
       WHERE space_id=? AND status='active' AND email=? COLLATE NOCASE
         AND (?='' OR id<>?)
       LIMIT 1`,
    ).bind(spaceId, email, excludeId, excludeId).first<{ id: string; display_name: string }>();
    if (row) {
      return { field: "email", memberId: row.id, displayName: row.display_name };
    }
  }

  if (phone) {
    const rows = await db.prepare(
      `SELECT id, display_name, phone FROM members
       WHERE space_id=? AND status='active'
         AND phone IS NOT NULL AND TRIM(phone)!=''
         AND (?='' OR id<>?)`,
    ).bind(spaceId, excludeId, excludeId).all<{ id: string; display_name: string; phone: string }>();
    for (const row of rows.results ?? []) {
      if (phonesMatch(phone, row.phone)) {
        return { field: "phone", memberId: row.id, displayName: row.display_name };
      }
    }
  }

  return null;
}

export function throwMemberContactConflict(conflict: MemberContactConflict): never {
  throw new ApiError(
    409,
    conflict.field === "email" ? "MEMBER_EMAIL_TAKEN" : "MEMBER_PHONE_TAKEN",
    { conflictName: conflict.displayName },
  );
}

export function memberContactConflictMessage(
  conflict: { field: "email" | "phone"; displayName: string },
  locale: "ar" | "en",
) {
  if (locale === "ar") {
    return conflict.field === "email"
      ? `هذا البريد مستخدم للعضو «${conflict.displayName}».`
      : `هذا الرقم مستخدم للعضو «${conflict.displayName}».`;
  }
  return conflict.field === "email"
    ? `This email is already used by “${conflict.displayName}”.`
    : `This phone number is already used by “${conflict.displayName}”.`;
}
