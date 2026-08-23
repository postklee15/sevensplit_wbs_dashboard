import { NextResponse } from "next/server";
import { isSuperAdminEmail } from "@/lib/acl";
import { listProfiles } from "@/lib/aclStore";
import { jsonAuthError, requireSevensplitUser } from "@/lib/adminAuth";
import { runAlertJob } from "@/lib/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function forbid() {
  return NextResponse.json(
    { error: "슈퍼 관리자만 알림을 실행할 수 있습니다.", reason: "forbidden_page" },
    { status: 403 },
  );
}

export async function POST(request: Request) {
  const auth = await requireSevensplitUser(request);
  if ("reason" in auth) {
    return NextResponse.json(jsonAuthError(auth), { status: auth.status });
  }
  if (!isSuperAdminEmail(auth.email)) return forbid();

  const body = (await request.json().catch(() => ({}))) as {
    dryRun?: boolean;
    force?: boolean;
  };

  try {
    const users = await listProfiles(auth.token);
    const result = await runAlertJob({
      firestoreToken: auth.token,
      users,
      dryRun: Boolean(body.dryRun),
      force: Boolean(body.force),
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "알림 작업을 실행하지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
