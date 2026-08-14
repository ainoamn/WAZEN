export type AccountingPeriodLike = {
  id: string;
  space_id: string;
  starts_at: string;
  ends_at?: string | null;
  closed_at?: string | null;
  status: string;
};

function time(value?: string | null) {
  if (!value) return Number.NaN;
  const parsed = new Date(value).getTime();
  return parsed;
}

/** Period whose date range contains the movement. Closed periods lock edits until reopened. */
export function coveringPeriod(periods: AccountingPeriodLike[], occurredAt: string): AccountingPeriodLike | null {
  const at = time(occurredAt);
  if (Number.isNaN(at)) return null;
  const matches = periods.filter((period) => {
    const start = time(period.starts_at);
    if (Number.isNaN(start) || start > at) return false;
    if (period.status === "open") {
      const end = time(period.ends_at);
      return Number.isNaN(end) || end >= at;
    }
    const end = time(period.ends_at || period.closed_at);
    return !Number.isNaN(end) && end >= at;
  });
  const rank = (status: string) => (status === "closed" ? 0 : status === "reopened" ? 1 : 2);
  matches.sort((left, right) => rank(left.status) - rank(right.status));
  return matches[0] ?? null;
}

export function isPeriodLocked(periods: AccountingPeriodLike[], occurredAt: string) {
  return coveringPeriod(periods, occurredAt)?.status === "closed";
}
