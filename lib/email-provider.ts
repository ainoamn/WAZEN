/** True when outbound email webhook credentials are present. */
export function isEmailProviderConfigured() {
  return Boolean(process.env.WAZEN_EMAIL_WEBHOOK_URL?.trim() && process.env.WAZEN_EMAIL_WEBHOOK_TOKEN?.trim());
}
