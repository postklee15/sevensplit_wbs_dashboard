import type { CsItem } from "./types";

export const UNRESOLVED_STATUS = "미해결";
export const UNRESOLVED_ALIASES = ["미해결", "미처리"] as const;
export const NO_CS_SERVICE = "서비스없음";

export function isUnresolvedCs(status: string | null | undefined): boolean {
  const name = (status ?? "").trim();
  if (!name) return false;
  if ((UNRESOLVED_ALIASES as readonly string[]).includes(name)) return true;
  return name.includes("미해결");
}

export function servicesOfCs(items: CsItem[]): string[] {
  const set = new Set<string>();
  for (const item of items) {
    if (item.service) set.add(item.service);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ko"));
}

export function statusesOfCs(items: CsItem[]): string[] {
  const set = new Set<string>();
  for (const item of items) {
    const status = item.status?.trim();
    if (status) set.add(status);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ko"));
}

export function unresolvedCount(items: CsItem[]): number {
  return items.filter((item) => isUnresolvedCs(item.status)).length;
}
