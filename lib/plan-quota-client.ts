import { apiFetch } from "./client-api";

export type PlanQuotaKind = "print" | "download";

const QUOTA_ERRORS: Record<string, [string, string]> = {
  PLAN_PRINT_LIMIT: ["وصلت إلى حد المطبوعات في باقتك هذا الشهر.", "You reached this month’s print limit on your plan."],
  PLAN_FEATURE_REQUIRED: ["هذه الميزة تحتاج ترقية الباقة.", "This feature needs a plan upgrade."],
  PLAN_DAILY_TRANSACTION_LIMIT: ["وصلت إلى حد المعاملات اليومية في باقتك.", "You reached the daily transaction limit on your plan."],
  PLAN_MONTHLY_TRANSACTION_LIMIT: ["وصلت إلى حد المعاملات الشهرية في باقتك.", "You reached the monthly transaction limit on your plan."],
  PLAN_TRANSACTION_LIMIT: ["وصلت إلى حد المعاملات في باقتك.", "You reached the transaction limit on your plan."],
};

export function planQuotaError(code: string, locale: "ar" | "en") {
  const pair = QUOTA_ERRORS[code];
  if (!pair) return code;
  return locale === "ar" ? pair[0] : pair[1];
}

export async function consumePlanQuota(
  kind: PlanQuotaKind,
  locale: "ar" | "en",
  spaceId?: string,
): Promise<{ ok: true; entitlements?: Record<string, unknown> } | { ok: false; error: string; code?: string }> {
  const response = await apiFetch("/api/dashboard", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "consumeQuota",
      kind,
      spaceId,
      idempotencyKey: crypto.randomUUID(),
    }),
  });
  const result = await response.json() as { error?: string; entitlements?: Record<string, unknown> };
  if (!response.ok) {
    const code = result.error ?? "FAILED";
    const error = planQuotaError(code, locale);
    window.alert(error);
    if (code === "PLAN_FEATURE_REQUIRED" || code === "PLAN_PRINT_LIMIT") {
      window.location.assign("/pricing");
    }
    return { ok: false, error, code };
  }
  return { ok: true, entitlements: result.entitlements };
}
