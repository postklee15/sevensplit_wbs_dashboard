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

/** 그룹을 쪼개지 않고 페이지에 담는다. `size`는 작업 건수. 한 그룹이 size보다 크면 그 페이지만 쓴다. */
export function pageGroups<T extends { tasks: unknown[] }>(
  groups: T[],
  page: number,
  size: number,
) {
  const packed: T[][] = [];
  let bucket: T[] = [];
  let count = 0;
  for (const group of groups) {
    const n = group.tasks.length;
    if (bucket.length > 0 && count + n > size) {
      packed.push(bucket);
      bucket = [];
      count = 0;
    }
    bucket.push(group);
    count += n;
  }
  if (bucket.length) packed.push(bucket);

  const total = groups.reduce((sum, group) => sum + group.tasks.length, 0);
  const pages = Math.max(1, packed.length);
  const current = Math.min(Math.max(1, page), pages);
  const slice = packed[current - 1] ?? [];
  const before = packed
    .slice(0, current - 1)
    .reduce((sum, pack) => sum + pack.reduce((inner, group) => inner + group.tasks.length, 0), 0);
  const sliceCount = slice.reduce((sum, group) => sum + group.tasks.length, 0);
  return {
    groups: slice,
    page: current,
    pages,
    total,
    from: total === 0 ? 0 : before + 1,
    to: before + sliceCount,
  };
}
