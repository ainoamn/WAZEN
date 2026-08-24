/** In-app workspace alerts for treasurers (dues, balance, period, billing grace). */

export type WorkspaceAlert = {
  id: string;
  severity: "info" | "warning" | "danger";
  href?: string;
  ar: string;
  en: string;
};

type SpaceLike = {
  id: string;
  name_ar: string;
  name_en: string;
  type: string;
  balance_minor: number;
  grace_until?: string | null;
  status?: string | null;
};

type MemberLike = {
  id: string;
  space_id: string;
  display_name: string;
  due_minor: number;
  paid_minor: number;
  status?: string | null;
};

type PeriodLike = {
  space_id: string;
  status: string;
  label: string;
};

export function computeWorkspaceAlerts(input: {
  spaces: SpaceLike[];
  members: MemberLike[];
  periods?: PeriodLike[];
  planStatus?: string | null;
  graceEndsAt?: string | null;
}): WorkspaceAlert[] {
  const alerts: WorkspaceAlert[] = [];
  const now = Date.now();

  if (input.graceEndsAt) {
    const ends = new Date(input.graceEndsAt).getTime();
    if (Number.isFinite(ends) && ends > now) {
      const days = Math.max(1, Math.ceil((ends - now) / 86_400_000));
      alerts.push({
        id: "plan-grace",
        severity: "warning",
        href: "/pricing",
        ar: `باقتك في فترة سماح — متبقٍ حوالي ${days} يوم. رقِّ الباقة لتفادي تقييد المحافظ.`,
        en: `Your plan is in a grace period — about ${days} day(s) left. Upgrade to keep wallets unlocked.`,
      });
    }
  } else if (input.planStatus && ["past_due", "paused", "canceled", "expired"].includes(input.planStatus)) {
    alerts.push({
      id: "plan-status",
      severity: "danger",
      href: "/billing",
      ar: "الاشتراك يحتاج تسوية أو تجديد من صفحة الفوترة.",
      en: "Your subscription needs settlement or renewal on the billing page.",
    });
  }

  for (const space of input.spaces) {
    if (space.grace_until) {
      const ends = new Date(space.grace_until).getTime();
      if (Number.isFinite(ends) && ends > now) {
        alerts.push({
          id: `space-grace:${space.id}`,
          severity: "warning",
          href: "/pricing",
          ar: `المحفظة «${space.name_ar}» في فترة سماح حتى انتهاء المهلة.`,
          en: `Wallet “${space.name_en}” is in a grace period until the deadline.`,
        });
      }
    }
    if (["society", "group"].includes(space.type) && Number(space.balance_minor) < 0) {
      alerts.push({
        id: `deficit:${space.id}`,
        severity: "danger",
        ar: `رصيد «${space.name_ar}» سالب — راجع السحوبات والمساهمات.`,
        en: `“${space.name_en}” balance is negative — review withdrawals and contributions.`,
      });
    }
  }

  const overdue = input.members.filter((member) => {
    if (member.status && member.status !== "active") return false;
    return Number(member.due_minor) - Number(member.paid_minor) > 0;
  });
  if (overdue.length > 0) {
    const sample = overdue.slice(0, 3).map((member) => member.display_name).join(overdue.length > 3 ? "، " : "، ");
    alerts.push({
      id: "dues-overdue",
      severity: "warning",
      ar: `${overdue.length} عضو عليهم مستحقات (مثل: ${sample}${overdue.length > 3 ? "…" : ""}).`,
      en: `${overdue.length} member(s) have outstanding dues (e.g. ${sample}${overdue.length > 3 ? "…" : ""}).`,
    });
  }

  const openPeriods = (input.periods ?? []).filter((period) => period.status === "open");
  const closedRecently = (input.periods ?? []).filter((period) => period.status === "closed");
  if (openPeriods.length === 0 && closedRecently.length > 0) {
    alerts.push({
      id: "no-open-period",
      severity: "info",
      ar: "لا توجد فترة محاسبية مفتوحة — افتح فترة جديدة من قسم الفترات.",
      en: "No open accounting period — open a new period from the periods section.",
    });
  }

  return alerts.slice(0, 8);
}
