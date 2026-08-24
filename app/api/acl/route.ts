import { NextResponse } from "next/server";
import { isSuperAdminEmail } from "@/lib/acl";
import { jsonAuthError, requireSevensplitUser } from "@/lib/adminAuth";
import { listProfiles, updateAccess } from "@/lib/aclStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function forbid() {
  return NextResponse.json(
    { error: "슈퍼 관리자만 권한을 변경할 수 있습니다.", reason: "forbidden_page" },
    { status: 403 },
  );
}

export async function GET(request: Request) {
  const auth = await requireSevensplitUser(request);
  if ("reason" in auth) {
    return NextResponse.json(jsonAuthError(auth), { status: auth.status });
  }
  if (!isSuperAdminEmail(auth.email)) return forbid();

  try {
    const users = await listProfiles(auth.token);
    return NextResponse.json({ users });
  } catch (error) {
    const message = error instanceof Error ? error.message : "사용자 목록을 읽지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireSevensplitUser(request);
  if ("reason" in auth) {
    return NextResponse.json(jsonAuthError(auth), { status: auth.status });
  }
  if (!isSuperAdminEmail(auth.email)) return forbid();

  const body = (await request.json()) as {
    uid?: string;
    canDashboard?: boolean;
    canPerformance?: boolean;
    slackMemberId?: string;
    workName?: string;
  };
  if (!body.uid) {
    return NextResponse.json({ error: "uid가 필요합니다." }, { status: 400 });
  }

  try {
    const profile = await updateAccess(auth.token, body.uid, {
      canDashboard: body.canDashboard,
      canPerformance: body.canPerformance,
      slackMemberId: body.slackMemberId,
      workName: body.workName,
    });
    return NextResponse.json({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : "권한을 저장하지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
