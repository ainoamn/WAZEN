export function isProductionLikeRuntime() {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

export function productionAuthRisks() {
  const risks: string[] = [];
  if (process.env.WAZEN_DEMO_MODE === "1") risks.push("WAZEN_DEMO_MODE");
  if (process.env.WAZEN_TRUST_OAI_HEADERS === "1") risks.push("WAZEN_TRUST_OAI_HEADERS");
  if (process.env.WAZEN_USE_NODE_SQLITE === "1") risks.push("WAZEN_USE_NODE_SQLITE");
  return risks;
}

export type ProductionSetupItem = {
  id: string;
  ok: boolean;
  label: string;
  hint?: string;
};

export function productionSetupChecklist(): ProductionSetupItem[] {
  const hasTurso = Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);
  const hasOrigin = Boolean(process.env.WAZEN_APP_ORIGIN?.trim());
  const hasKeyring = Boolean(process.env.WAZEN_ENCRYPTION_KEYRING?.trim());
  const hasJobSecret = Boolean(process.env.WAZEN_JOB_SECRET?.trim());
  const hasWebhookSecret = Boolean(process.env.WAZEN_PAYMENT_WEBHOOK_SECRET?.trim());
  const adminEmails = process.env.WAZEN_ADMIN_EMAILS?.trim();
  const risks = productionAuthRisks();

  return [
    {
      id: "database",
      ok: hasTurso,
      label: "Turso database linked",
      hint: hasTurso ? undefined : "Set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN or run npm run provision:production",
    },
    {
      id: "app_origin",
      ok: hasOrigin,
      label: "Public app origin configured",
      hint: hasOrigin ? undefined : "Set WAZEN_APP_ORIGIN to the production URL",
    },
    {
      id: "encryption",
      ok: hasKeyring,
      label: "Encryption keyring configured",
      hint: hasKeyring ? undefined : "Set WAZEN_ENCRYPTION_KEYRING (npm run secrets:production)",
    },
    {
      id: "job_secret",
      ok: hasJobSecret,
      label: "Background job secret configured",
    },
    {
      id: "webhook_secret",
      ok: hasWebhookSecret,
      label: "Payment webhook secret configured",
    },
    {
      id: "auth_hardening",
      ok: risks.length === 0,
      label: "Demo / trust-headers / Node SQLite disabled",
      hint: risks.length ? `Remove: ${risks.join(", ")}` : undefined,
    },
    {
      id: "admin_bootstrap",
      ok: Boolean(adminEmails),
      label: "Admin bootstrap email allowlist (remove after setup)",
      hint: adminEmails ? `Currently: ${adminEmails}` : "Set WAZEN_ADMIN_EMAILS until /admin/setup completes",
    },
  ];
}
