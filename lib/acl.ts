export const SUPER_ADMIN_EMAILS = ["shlim@sevensplit.com"] as const;

/** Firebase 이메일 로그인이 꺼져 있어 앱이 발급한 테스트 JWT. 비밀번호는 env `WBS_TEST_PASSWORD`. */
export const TEST_LOGIN_EMAIL = "wbs-test@sevensplit.com";
export const TEST_LOGIN_UID = "wbs-test";

export type PageKey = "dashboard" | "performance";

/** 이메일 슈퍼관리자는 고정. 나머지는 Firestore `role`. */
export type OrgRole = "superAdmin" | "director" | "lead" | "member";

export const ROLE_LABEL: Record<OrgRole, string> = {
  superAdmin: "슈퍼관리자",
  director: "본부장",
  lead: "팀장",
  member: "팀원",
};

export const ASSIGNABLE_ROLES: OrgRole[] = ["director", "lead", "member"];

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
  /** 본부 `orgUnits` id. 본부장·팀장·팀원 소속. */
  divisionId: string;
  /** 팀 `orgUnits` id. 본부장은 비움. */
  teamId: string;
  createdAt: string | null;
  lastSeenAt: string | null;
};

export type WbsAccessScope =
  | { kind: "company" }
  | { kind: "division"; workNames: Set<string> }
  | { kind: "self"; workNames: Set<string> };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isTestLoginEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return normalizeEmail(email) === TEST_LOGIN_EMAIL;
}

export function testReviewerProfile(partial?: Partial<AccessProfile>): AccessProfile {
  const now = new Date().toISOString();
  return {
    uid: TEST_LOGIN_UID,
    email: TEST_LOGIN_EMAIL,
    displayName: partial?.displayName?.trim() || "WBS 테스트",
    workName: partial?.workName?.trim() || "WBS테스트",
    canDashboard: true,
    canPerformance: true,
    slackMemberId: "",
    role: "lead",
    isSuperAdmin: false,
    divisionId: "",
    teamId: "",
    createdAt: partial?.createdAt ?? "2026-08-27T00:00:00.000Z",
    lastSeenAt: partial?.lastSeenAt ?? now,
  };
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.includes(normalizeEmail(email) as (typeof SUPER_ADMIN_EMAILS)[number]);
}

export function parseRole(raw: string, isSuper: boolean): OrgRole {
  if (isSuper) return "superAdmin";
  if (raw === "director") return "director";
  if (raw === "lead") return "lead";
  return "member";
}

export function applySuperAdmin(profile: AccessProfile): AccessProfile {
  if (!profile.isSuperAdmin) return profile;
  return {
    ...profile,
    role: "superAdmin",
    canDashboard: true,
    canPerformance: true,
  };
}

export function applyDirectorDefaults(profile: AccessProfile): AccessProfile {
  const resolved = applySuperAdmin(profile);
  if (resolved.role !== "director") return resolved;
  return { ...resolved, canDashboard: true, canPerformance: true };
}

export function canOpenPage(profile: AccessProfile, page: PageKey): boolean {
  const resolved = applyDirectorDefaults(profile);
  if (page === "dashboard") return resolved.canDashboard;
  return resolved.canPerformance;
}

/** 권한·조직 화면. 이메일 슈퍼관리자·본부장. */
export function canManageAccess(profile: AccessProfile): boolean {
  const resolved = applyDirectorDefaults(profile);
  return resolved.isSuperAdmin || resolved.role === "director";
}

/** 본부 단위로 타인 부하를 본다. 팀원은 본인만. 본부 미배정이면 본인만. */
export function canViewAllLoad(profile: AccessProfile): boolean {
  const resolved = applyDirectorDefaults(profile);
  if (resolved.role === "superAdmin") return true;
  if (resolved.role === "director" || resolved.role === "lead") return Boolean(resolved.divisionId);
  return false;
}

export function wbsScopeFromMembers(profile: AccessProfile, members: AccessProfile[]): WbsAccessScope {
  const resolved = applyDirectorDefaults(profile);
  if (resolved.role === "superAdmin") return { kind: "company" };
  if ((resolved.role === "director" || resolved.role === "lead") && resolved.divisionId) {
    const names = new Set<string>();
    const own = resolved.workName.trim();
    if (own) names.add(own);
    for (const member of members) {
      if (member.divisionId !== resolved.divisionId) continue;
      const name = member.workName.trim();
      if (name) names.add(name);
    }
    return { kind: "division", workNames: names };
  }
  const self = resolved.workName.trim();
  return { kind: "self", workNames: new Set(self ? [self] : []) };
}

export function assigneesInScope(assignees: string[], scope: WbsAccessScope): boolean {
  if (scope.kind === "company") return true;
  if (assignees.length === 0) return scope.kind === "division";
  return assignees.some((name) => scope.workNames.has(name));
}

/** 서버는 scope를 넘긴다. 클라이언트는 생략하고 역할만 본다. */
export function canEditWbsTask(
  profile: AccessProfile,
  assignees: string[],
  scope?: WbsAccessScope,
): boolean {
  const resolved = applyDirectorDefaults(profile);
  if (scope) {
    if (scope.kind === "self") {
      const workName = resolved.workName.trim();
      if (!workName) return false;
      return assignees.some((name) => name === workName);
    }
    return assigneesInScope(assignees, scope);
  }
  if (resolved.role === "superAdmin" || resolved.role === "director" || resolved.role === "lead") {
    return true;
  }
  const workName = resolved.workName.trim();
  if (!workName) return false;
  return assignees.some((name) => name === workName);
}

export function canCascadeWbsDelay(profile: AccessProfile, scope?: WbsAccessScope): boolean {
  if (scope) return scope.kind === "company" || scope.kind === "division";
  return canViewAllLoad(profile);
}

export function canReadWbsTask(
  profile: AccessProfile,
  assignees: string[],
  scope?: WbsAccessScope,
): boolean {
  const resolved = applyDirectorDefaults(profile);
  if (!canOpenPage(resolved, "dashboard") && !canOpenPage(resolved, "performance")) {
    return false;
  }
  if (canOpenPage(resolved, "performance") && !scope) return true;
  return canEditWbsTask(resolved, assignees, scope);
}

export function canAssignRole(actor: AccessProfile, role: OrgRole): boolean {
  const resolved = applyDirectorDefaults(actor);
  if (role === "superAdmin") return false;
  if (resolved.isSuperAdmin) return role === "director" || role === "lead" || role === "member";
  if (resolved.role === "director") return role === "lead" || role === "member";
  return false;
}

/** 권한 화면 목록. 슈퍼관리자는 전원, 본부장은 미배정+자기 본부. */
export function profilesVisibleTo(actor: AccessProfile, users: AccessProfile[]): AccessProfile[] {
  const resolved = applyDirectorDefaults(actor);
  if (resolved.isSuperAdmin) return users;
  const home = resolved.divisionId;
  return users.filter((user) => !user.divisionId || user.divisionId === home);
}
