export const SUPER_ADMIN_EMAILS = ["shlim@sevensplit.com"] as const;

export type PageKey = "dashboard" | "performance";

/** 슈퍼관리자는 이메일로 고정. 나머지 계정은 Firestore `role`. */
export type OrgRole = "superAdmin" | "lead" | "member";

export const ROLE_LABEL: Record<OrgRole, string> = {
  superAdmin: "슈퍼관리자",
  lead: "팀장",
  member: "팀원",
};

export type AccessProfile = {
  uid: string;
  email: string;
  displayName: string;
  /** 노션 담당자 이름. 내 업무 필터에 사용. 하트비트가 덮어쓰지 않음. */
  workName: string;
  canDashboard: boolean;
  canPerformance: boolean;
  /** Slack 멤버 ID(`U…`). 비어 있으면 발송 시 로그인 이메일로 조회. 권한 화면에서 이메일로 채워 저장할 수 있음. 하트비트가 덮어쓰지 않음. */
  slackMemberId: string;
  role: OrgRole;
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

export function parseRole(raw: string, isSuper: boolean): OrgRole {
  if (isSuper) return "superAdmin";
  if (raw === "lead") return "lead";
  return "member";
}

export function applySuperAdmin(profile: AccessProfile): AccessProfile {
  if (!profile.isSuperAdmin) return profile;
  return { ...profile, role: "superAdmin", canDashboard: true, canPerformance: true };
}

export function canOpenPage(profile: AccessProfile, page: PageKey): boolean {
  const resolved = applySuperAdmin(profile);
  if (page === "dashboard") return resolved.canDashboard;
  return resolved.canPerformance;
}

/** 슈퍼관리자·팀장은 부하에서 전 인원을 본다. 팀원은 본인만. */
export function canViewAllLoad(profile: AccessProfile): boolean {
  const role = applySuperAdmin(profile).role;
  return role === "superAdmin" || role === "lead";
}
