/** Pure helpers for plan retention windows (no DB / no plan-features import). */

export const USER_GRACE_DAYS = 15;
export const ADMIN_ARCHIVE_DAYS = 60;
const DAY_MS = 86_400_000;

export function graceEndsAt(fromIso = new Date().toISOString()) {
  return new Date(new Date(fromIso).getTime() + USER_GRACE_DAYS * DAY_MS).toISOString();
}

export function archivePurgeAt(fromIso = new Date().toISOString()) {
  return new Date(new Date(fromIso).getTime() + ADMIN_ARCHIVE_DAYS * DAY_MS).toISOString();
}

/** User-facing copy only — never mentions admin recovery or the 60-day archive. */
export function userGraceWarningCopy(locale: "ar" | "en", graceEndsAtIso: string, walletCount: number) {
  const when = new Intl.DateTimeFormat(locale === "ar" ? "ar-OM" : "en-GB", { dateStyle: "medium" }).format(new Date(graceEndsAtIso));
  if (locale === "ar") {
    return {
      title: "تنبيه الاحتفاظ بالبيانات",
      text: `المحافظ والبيانات غير المشمولة في باقتك الحالية (${walletCount}) ستظل ظاهرة حتى ${when} (${USER_GRACE_DAYS} يوماً). بعد هذا التاريخ تُحذف من حسابك ولن تتمكن من استرجاعها.`,
    };
  }
  return {
    title: "Data retention notice",
    text: `Wallets and data not included in your current plan (${walletCount}) stay visible until ${when} (${USER_GRACE_DAYS} days). After that they are removed from your account and cannot be recovered.`,
  };
}

export function spaceInUserGrace<T extends { grace_until?: string | null; status?: string | null }>(space: T, now = Date.now()) {
  if ((space.status ?? "active") === "retention_held") return false;
  if (!space.grace_until) return false;
  const ends = new Date(space.grace_until).getTime();
  return Number.isFinite(ends) && ends > now;
}
