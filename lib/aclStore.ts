import {
  applySuperAdmin,
  isSuperAdminEmail,
  normalizeEmail,
  type AccessProfile,
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
  return applySuperAdmin({
    uid,
    email,
    displayName: strField(fields, "displayName"),
    workName: strField(fields, "workName").trim(),
    canDashboard: boolField(fields, "canDashboard", true),
    canPerformance: boolField(fields, "canPerformance", false),
    slackMemberId: strField(fields, "slackMemberId").trim(),
    isSuperAdmin: isSuperAdminEmail(email),
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
        "createdAt",
        "lastSeenAt",
      ],
    );
    return applySuperAdmin({
      uid: opts.uid,
      email,
      displayName: opts.displayName,
      workName: "",
      canDashboard: true,
      canPerformance: superAdmin,
      slackMemberId: "",
      isSuperAdmin: superAdmin,
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
      if (a.isSuperAdmin !== b.isSuperAdmin) return a.isSuperAdmin ? -1 : 1;
      return a.email.localeCompare(b.email);
    });
}

export async function updateAccess(
  token: string,
  uid: string,
  patch: { canDashboard?: boolean; canPerformance?: boolean; slackMemberId?: string },
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
  if (current.isSuperAdmin) {
    if (patch.slackMemberId === undefined) return current;
    await patchDocument(token, COLLECTION, uid, { slackMemberId }, ["slackMemberId"]);
    return { ...current, slackMemberId };
  }
  const next = {
    canDashboard: patch.canDashboard ?? current.canDashboard,
    canPerformance: patch.canPerformance ?? current.canPerformance,
    slackMemberId,
  };
  const mask = ["canDashboard", "canPerformance"];
  if (patch.slackMemberId !== undefined) mask.push("slackMemberId");
  await patchDocument(token, COLLECTION, uid, next, mask);
  return { ...current, ...next };
}

export async function updateWorkName(
  token: string,
  uid: string,
  workName: string,
): Promise<AccessProfile> {
  const existing = await getDocument(token, COLLECTION, uid);
  if (!existing) {
    throw new Error("프로필이 없습니다. 한 번 로그아웃 후 다시 로그인해 주세요.");
  }
  const current = toProfile(uid, existing.fields, "");
  const next = workName.trim().slice(0, 79);
  if (isUnassignedRow(next)) {
    throw new Error("미지정 행 이름은 업무 이름으로 쓸 수 없습니다.");
  }
  await patchDocument(token, COLLECTION, uid, { workName: next }, ["workName"]);
  return { ...current, workName: next };
}
