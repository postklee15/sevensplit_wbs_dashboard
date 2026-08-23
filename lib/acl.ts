export const SUPER_ADMIN_EMAILS = ["shlim@sevensplit.com"] as const;

export type PageKey = "dashboard" | "performance";

export type AccessProfile = {
  uid: string;
  email: string;
  displayName: string;
  /** 노션 담당자 이름. 내 업무 필터에 사용. 하트비트가 덮어쓰지 않음. */
  workName: string;
  canDashboard: boolean;
  canPerformance: boolean;
  isSuperAdmin: boolean;
  createdAt: string | null;
  lastSeenAt: string | null;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.includes(normalizeEmail(email) as (typeof SUPER_ADMIN_EMAILS)[number]);
}

export function applySuperAdmin(profile: AccessProfile): AccessProfile {
  if (!profile.isSuperAdmin) return profile;
  return { ...profile, canDashboard: true, canPerformance: true };
}

export function canOpenPage(profile: AccessProfile, page: PageKey): boolean {
  const resolved = applySuperAdmin(profile);
  if (page === "dashboard") return resolved.canDashboard;
  return resolved.canPerformance;
}
