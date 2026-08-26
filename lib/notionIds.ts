export function normalizeNotionId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

export function isNotionPageId(id: string): boolean {
  return /^[0-9a-f]{32}$/i.test(normalizeNotionId(id));
}
