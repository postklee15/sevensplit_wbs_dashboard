import {
  applyDirectorDefaults,
  isSuperAdminEmail,
  isTestLoginEmail,
  TEST_LOGIN_UID,
  normalizeEmail,
  parseRole,
  testReviewerProfile,
  type AccessProfile,
  type OrgRole,
} from "./acl";
import { boolField, getDocument, listDocuments, patchDocument, strField } from "./firestoreRest";
import { isUnassignedRow } from "./metrics";
import { resolveSlackMemberId } from "./slack";

const COLLECTION = "users";

function toProfile(
  uid: string,
  fields: Parameters<typeof strField>[0],
  emailFallback: string,
): AccessProfile {
  const email = normalizeEmail(strField(fields, "email") || emailFallback);
  const superAdmin = isSuperAdminEmail(email);
  return applyDirectorDefaults({
    uid,
    email,
    displayName: strField(fields, "displayName"),
    workName: strField(fields, "workName").trim(),
    canDashboard: boolField(fields, "canDashboard", true),
    canPerformance: boolField(fields, "canPerformance", false),
    slackMemberId: strField(fields, "slackMemberId").trim(),
    role: parseRole(strField(fields, "role"), superAdmin),
    isSuperAdmin: superAdmin,
    divisionId: strField(fields, "divisionId").trim(),
    teamId: strField(fields, "teamId").trim(),
    createdAt: strField(fields, "createdAt") || null,
    lastSeenAt: strField(fields, "lastSeenAt") || null,
  });
}

export async function heartbeatUser(opts: {
  token: string;
  uid: string;
  email: string;
  displayName: string;
}): Promise<AccessProfile> {
  if (isTestLoginEmail(opts.email)) {
    return testReviewerProfile({
      displayName: opts.displayName.trim() || "WBS 테스트",
      lastSeenAt: new Date().toISOString(),
    });
  }
  const now = new Date().toISOString();
  const existing = await getDocument(opts.token, COLLECTION, opts.uid);
  const email = normalizeEmail(opts.email);
  const superAdmin = isSuperAdminEmail(email);
  if (!existing) {
    await patchDocument(
      opts.token,
      COLLECTION,
      opts.uid,
      {
        email,
        displayName: opts.displayName,
        workName: "",
        canDashboard: true,
        canPerformance: superAdmin,
        slackMemberId: "",
        role: "member",
        divisionId: "",
        teamId: "",
        createdAt: now,
        lastSeenAt: now,
      },
      [
        "email",
        "displayName",
        "workName",
        "canDashboard",
        "canPerformance",
        "slackMemberId",
        "role",
        "divisionId",
        "teamId",
        "createdAt",
        "lastSeenAt",
      ],
    );
    return applyDirectorDefaults({
      uid: opts.uid,
      email,
      displayName: opts.displayName,
      workName: "",
      canDashboard: true,
      canPerformance: superAdmin,
      slackMemberId: "",
      role: parseRole("member", superAdmin),
      isSuperAdmin: superAdmin,
      divisionId: "",
      teamId: "",
      createdAt: now,
      lastSeenAt: now,
    });
  }

  const displayName = opts.displayName || strField(existing.fields, "displayName");
  await patchDocument(
    opts.token,
    COLLECTION,
    opts.uid,
    { displayName, lastSeenAt: now },
    ["displayName", "lastSeenAt"],
  );
  return toProfile(opts.uid, existing.fields, email);
}

export async function listProfiles(token: string): Promise<AccessProfile[]> {
  const docs = await listDocuments(token, COLLECTION);
  return docs
    .map((doc) => toProfile(doc.id, doc.fields, ""))
    .filter((profile) => Boolean(profile.email))
    .sort((a, b) => {
      const rank = (role: AccessProfile["role"]) =>
        role === "superAdmin" ? 0 : role === "director" ? 1 : role === "lead" ? 2 : 3;
      const delta = rank(a.role) - rank(b.role);
      if (delta !== 0) return delta;
      return a.email.localeCompare(b.email);
    });
}

function normalizeWorkName(value: string): string {
  const next = value.trim().slice(0, 79);
  if (next && isUnassignedRow(next)) {
    throw new Error("미지정 행 이름은 업무 이름으로 쓸 수 없습니다.");
  }
  return next;
}

export async function updateAccess(
  token: string,
  uid: string,
  patch: {
    canDashboard?: boolean;
    canPerformance?: boolean;
    slackMemberId?: string;
    workName?: string;
    role?: OrgRole;
    divisionId?: string;
    teamId?: string;
  },
): Promise<AccessProfile> {
  const existing = await getDocument(token, COLLECTION, uid);
  if (!existing) {
    throw new Error("해당 사용자를 찾을 수 없습니다. 상대방이 한 번 로그인한 뒤에 권한을 줄 수 있습니다.");
  }
  const current = toProfile(uid, existing.fields, "");
  const slackMemberId =
    patch.slackMemberId !== undefined
      ? await resolveSlackMemberId(patch.slackMemberId)
      : current.slackMemberId;
  const workName =
    patch.workName !== undefined ? normalizeWorkName(patch.workName) : current.workName;
  if (current.isSuperAdmin) {
    const fields: { slackMemberId?: string; workName?: string } = {};
    const mask: string[] = [];
    if (patch.slackMemberId !== undefined) {
      fields.slackMemberId = slackMemberId;
      mask.push("slackMemberId");
    }
    if (patch.workName !== undefined) {
      fields.workName = workName;
      mask.push("workName");
    }
    if (mask.length === 0) return current;
    await patchDocument(token, COLLECTION, uid, fields, mask);
    return { ...current, ...fields };
  }

  let role: OrgRole = current.role === "director" || current.role === "lead" ? current.role : "member";
  if (patch.role === "director" || patch.role === "lead" || patch.role === "member") {
    role = patch.role;
  }
  let divisionId = patch.divisionId !== undefined ? patch.divisionId.trim() : current.divisionId;
  let teamId = patch.teamId !== undefined ? patch.teamId.trim() : current.teamId;
  if (role === "director") teamId = "";
  const next = {
    canDashboard: role === "lead" || role === "director" ? true : (patch.canDashboard ?? current.canDashboard),
    canPerformance: role === "director" ? true : (patch.canPerformance ?? current.canPerformance),
    slackMemberId,
    workName,
    role,
    divisionId,
    teamId,
  };
  const mask = ["canDashboard", "canPerformance", "role", "divisionId", "teamId"];
  if (patch.slackMemberId !== undefined) mask.push("slackMemberId");
  if (patch.workName !== undefined) mask.push("workName");
  await patchDocument(token, COLLECTION, uid, next, mask);
  return { ...current, ...next };
}

export async function clearOrgMembership(
  token: string,
  profiles: AccessProfile[],
  removedIds: string[],
): Promise<void> {
  const removed = new Set(removedIds);
  for (const profile of profiles) {
    if (profile.isSuperAdmin) continue;
    const dropDivision = removed.has(profile.divisionId);
    const dropTeam = removed.has(profile.teamId);
    if (!dropDivision && !dropTeam) continue;
    await updateAccess(token, profile.uid, {
      divisionId: dropDivision ? "" : profile.divisionId,
      teamId: dropDivision || dropTeam ? "" : profile.teamId,
    });
  }
}

export async function updateWorkName(
  token: string,
  uid: string,
  workName: string,
): Promise<AccessProfile> {
  if (uid === TEST_LOGIN_UID) {
    return testReviewerProfile({ workName: normalizeWorkName(workName) });
  }
  const existing = await getDocument(token, COLLECTION, uid);
  if (!existing) {
    throw new Error("프로필이 없습니다. 한 번 로그아웃 후 다시 로그인해 주세요.");
  }
  const current = toProfile(uid, existing.fields, "");
  const next = normalizeWorkName(workName);
  await patchDocument(token, COLLECTION, uid, { workName: next }, ["workName"]);
  return { ...current, workName: next };
}
