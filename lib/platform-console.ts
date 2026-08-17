/** Roles that may open `/admin`. Finance/support use scoped APIs, not the console chrome. */
export const PLATFORM_CONSOLE_ROLES = ["super_admin", "admin"] as const;

export function canOpenPlatformConsole(role?: string | null) {
  return PLATFORM_CONSOLE_ROLES.includes((role ?? "") as (typeof PLATFORM_CONSOLE_ROLES)[number]);
}
