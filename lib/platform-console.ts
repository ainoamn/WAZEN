export const PLATFORM_CONSOLE_ROLES = ["super_admin", "admin", "finance", "support"] as const;

export function canOpenPlatformConsole(role?: string | null) {
  return PLATFORM_CONSOLE_ROLES.includes((role ?? "") as (typeof PLATFORM_CONSOLE_ROLES)[number]);
}
