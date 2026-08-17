export const TRANSACTION_PAGE_SIZES = [5, 10, 50, 100] as const;
export const TRANSACTION_PAGE_MAX = 100;

export function pageTransactions<T>(rows: T[], page: number, pageSize: number, max = TRANSACTION_PAGE_MAX) {
  const size = TRANSACTION_PAGE_SIZES.includes(pageSize as (typeof TRANSACTION_PAGE_SIZES)[number])
    ? pageSize
    : 5;
  const capped = rows.slice(0, max);
  const pages = Math.max(1, Math.ceil(capped.length / size) || 1);
  const current = Math.min(Math.max(1, page), pages);
  return {
    rows: capped.slice((current - 1) * size, current * size),
    page: current,
    pages,
    size,
    total: capped.length,
    truncated: rows.length > max,
  };
}
