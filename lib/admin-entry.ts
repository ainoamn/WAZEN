export const ADMIN_ENTRY_COOKIE = "wazen_admin_entry";
export const ADMIN_LOCAL_LOGIN_PATH = "/login?local=1&next=/admin&fresh=1";

function secureAttribute() {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

export function adminEntryCookie(maxAge = 300) {
  return `${ADMIN_ENTRY_COOKIE}=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureAttribute()}`;
}

export function clearAdminEntryCookie() {
  return `${ADMIN_ENTRY_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureAttribute()}`;
}

export function hasAdminEntryIntent(cookieHeader: string | null | undefined) {
  if (!cookieHeader) return false;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === ADMIN_ENTRY_COOKIE && rest.join("=") === "1") return true;
  }
  return false;
}
