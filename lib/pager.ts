export const PAGE_SIZES = [10, 20, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export function isPageSize(value: number): value is PageSize {
  return (PAGE_SIZES as readonly number[]).includes(value);
}

export function pageSlice<T>(items: T[], page: number, size: number) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size) || 1);
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * size;
  const end = Math.min(start + size, total);
  return {
    items: items.slice(start, end),
    page: current,
    pages,
    total,
    from: total === 0 ? 0 : start + 1,
    to: end,
  };
}
