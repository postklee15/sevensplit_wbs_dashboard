import { NextResponse } from "next/server";
import { canManageAccess } from "@/lib/acl";
import { heartbeatUser, listProfiles } from "@/lib/aclStore";
import { jsonAuthError, requireSevensplitUser } from "@/lib/adminAuth";
import { runCsAlertJob } from "@/lib/csAlerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function forbid() {
  return NextResponse.json(
    { error: "본부장 또는 슈퍼관리자만 CS 알림을 실행할 수 있습니다.", reason: "forbidden_page" },
    { status: 403 },
  );
}

export async function POST(request: Request) {
  const auth = await requireSevensplitUser(request);
  if ("reason" in auth) {
    return NextResponse.json(jsonAuthError(auth), { status: auth.status });
  }
  const profile = await heartbeatUser({
    token: auth.token,
    uid: auth.uid,
    email: auth.email,
    displayName: auth.name || auth.email,
  });
  if (!canManageAccess(profile)) return forbid();

  const body = (await request.json().catch(() => ({}))) as {
    dryRun?: boolean;
    force?: boolean;
  };

  try {
    const users = await listProfiles(auth.token);
    const result = await runCsAlertJob({
      firestoreToken: auth.token,
      users,
      dryRun: Boolean(body.dryRun),
      force: Boolean(body.force),
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "CS 알림 작업을 실행하지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
