/** Launch / production readiness signals for ops health and admin console. */

import { isRlsEnforceEnabled, isRlsDryRunEnabled } from "./db-request-context.ts";
import { isWebPushConfigured } from "./web-push.ts";
import { activeCheckoutProvider, isOmanNetConfigured, isThawaniConfigured } from "./payment-checkout.ts";
import { productionSetupChecklist, productionAuthRisks, isProductionLikeRuntime } from "./production-setup.ts";

export type ReadinessItem = {
  id: string;
  ok: boolean;
  required: boolean;
  labelAr: string;
  labelEn: string;
  hint?: string;
};

function hasSentry() {
  return Boolean(process.env.SENTRY_DSN?.trim() || process.env.WAZEN_SENTRY_DSN?.trim());
}

function hasCronAuth() {
  const job = process.env.WAZEN_JOB_SECRET?.trim() ?? "";
  const cron = process.env.CRON_SECRET?.trim() ?? "";
  return job.length >= 32 || cron.length >= 16;
}

export function computeLaunchReadiness(): {
  ready: boolean;
  score: number;
  requiredPending: string[];
  items: ReadinessItem[];
  checkoutProvider: string;
  rlsEnforce: boolean;
  productionLike: boolean;
} {
  const setup = productionSetupChecklist();
  const risks = productionAuthRisks();
  const checkout = activeCheckoutProvider();
  const items: ReadinessItem[] = [
    {
      id: "database",
      ok: setup.find((item) => item.id === "database")?.ok ?? false,
      required: true,
      labelAr: "قاعدة البيانات",
      labelEn: "Database",
      hint: setup.find((item) => item.id === "database")?.hint,
    },
    {
      id: "app_origin",
      ok: setup.find((item) => item.id === "app_origin")?.ok ?? false,
      required: true,
      labelAr: "أصل التطبيق",
      labelEn: "App origin",
    },
    {
      id: "encryption",
      ok: setup.find((item) => item.id === "encryption")?.ok ?? false,
      required: true,
      labelAr: "حلقة التشفير",
      labelEn: "Encryption keyring",
    },
    {
      id: "auth_hardening",
      ok: risks.length === 0,
      required: true,
      labelAr: "تعطيل Demo/Trust/SQLite في الإنتاج",
      labelEn: "Demo/trust/SQLite off in production",
      hint: risks.length ? risks.join(", ") : undefined,
    },
    {
      id: "job_secret",
      ok: hasCronAuth(),
      required: true,
      labelAr: "سر المهام / Cron",
      labelEn: "Job / Cron secret",
      hint: "Set WAZEN_JOB_SECRET (>=32) and/or CRON_SECRET",
    },
    {
      id: "webhook_secret",
      ok: setup.find((item) => item.id === "webhook_secret")?.ok ?? false,
      required: true,
      labelAr: "سر Webhook الدفع",
      labelEn: "Payment webhook secret",
    },
    {
      id: "sentry",
      ok: hasSentry(),
      required: false,
      labelAr: "Sentry للمراقبة",
      labelEn: "Sentry observability",
      hint: "Set SENTRY_DSN or WAZEN_SENTRY_DSN",
    },
    {
      id: "email",
      ok: setup.find((item) => item.id === "email_provider")?.ok ?? false,
      required: false,
      labelAr: "مزود البريد",
      labelEn: "Email provider",
    },
    {
      id: "web_push",
      ok: isWebPushConfigured(),
      required: false,
      labelAr: "Web Push (VAPID)",
      labelEn: "Web Push (VAPID)",
    },
    {
      id: "checkout",
      ok: checkout !== "manual_transfer" || !isProductionLikeRuntime(),
      required: false,
      labelAr: "دفع بطاقة (ثواني/عمان نت)",
      labelEn: "Card checkout (Thawani/OmanNet)",
      hint: checkout === "manual_transfer"
        ? "Optional: configure Thawani or OmanNet; manual transfer remains valid"
        : `Active: ${checkout}`,
    },
    {
      id: "rls_enforce",
      ok: isRlsEnforceEnabled(),
      required: false,
      labelAr: "RLS صارم (WAZEN_RLS_ENFORCE=1)",
      labelEn: "Strict RLS enforce",
      hint: "Enable only after Staging verification of app.user_id on all user routes",
    },
    {
      id: "rls_dry_run",
      ok: isRlsDryRunEnabled() || isRlsEnforceEnabled(),
      required: false,
      labelAr: "وضع تجريب RLS",
      labelEn: "RLS dry-run mode",
      hint: "Set WAZEN_RLS_DRY_RUN=1 on Staging to mark readiness before enforce",
    },
    {
      id: "legal_counsel",
      ok: process.env.WAZEN_LEGAL_COUNSEL_SIGNED?.trim() === "1",
      required: false,
      labelAr: "اعتماد محامٍ للخصوصية/الشروط",
      labelEn: "Counsel sign-off on privacy/terms",
      hint: "Set WAZEN_LEGAL_COUNSEL_SIGNED=1 after external review",
    },
  ];

  // Soften checkout ok when manual is intentional
  const checkoutItem = items.find((item) => item.id === "checkout");
  if (checkoutItem) {
    checkoutItem.ok = true;
    checkoutItem.hint = `Provider: ${checkout}`
      + (isThawaniConfigured() ? " · thawani ready" : "")
      + (isOmanNetConfigured() ? " · omannet ready" : "");
  }

  const requiredPending = items.filter((item) => item.required && !item.ok).map((item) => item.id);
  const scored = items.filter((item) => item.ok).length;
  const score = Math.round((scored / items.length) * 100);
  return {
    ready: requiredPending.length === 0,
    score,
    requiredPending,
    items,
    checkoutProvider: checkout,
    rlsEnforce: isRlsEnforceEnabled(),
    productionLike: isProductionLikeRuntime(),
  };
}
