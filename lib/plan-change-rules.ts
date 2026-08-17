/** Pure plan-change helpers (no DB imports — safe for unit tests). */

export type PlanChangeKind = "upgrade" | "downgrade" | "renew" | "same";

export function dayAfterIso(iso: string) {
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return new Date(Date.now() + 86_400_000).toISOString();
  const next = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + 1, 0, 0, 0, 0));
  return next.toISOString();
}

export function classifyPlanChange(
  current: { sort_order: number; monthly_minor: number } | null,
  next: { sort_order: number; monthly_minor: number },
) {
  if (!current) return "upgrade" as PlanChangeKind;
  if (current.sort_order === next.sort_order && current.monthly_minor === next.monthly_minor) return "same" as PlanChangeKind;
  if (next.sort_order > current.sort_order) return "upgrade" as PlanChangeKind;
  if (next.sort_order < current.sort_order) return "downgrade" as PlanChangeKind;
  if (next.monthly_minor > current.monthly_minor) return "upgrade" as PlanChangeKind;
  if (next.monthly_minor < current.monthly_minor) return "downgrade" as PlanChangeKind;
  return "renew" as PlanChangeKind;
}
