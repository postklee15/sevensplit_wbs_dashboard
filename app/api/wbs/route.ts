import { NextResponse } from "next/server";
import { canOpenPage } from "@/lib/acl";
import { jsonAuthError, requireSevensplitUser } from "@/lib/adminAuth";
import { heartbeatUser } from "@/lib/aclStore";
import { fetchWbsTasks } from "@/lib/notion";
import { filterTasksByScope, loadOrgContext, orgPayloadForProfile } from "@/lib/wbsOrg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSevensplitUser(request);
  if ("reason" in auth) {
    return NextResponse.json(jsonAuthError(auth), { status: auth.status });
  }

  try {
    const profile = await heartbeatUser({
      token: auth.token,
      uid: auth.uid,
      email: auth.email,
      displayName: auth.name || auth.email,
    });
    if (!canOpenPage(profile, "dashboard")) {
      return NextResponse.json(
        { error: "대시보드 접근 권한이 없습니다.", reason: "forbidden_page" },
        { status: 403 },
      );
    }
    const { databaseTitle, tasks: allTasks } = await fetchWbsTasks();
    let org: ReturnType<typeof orgPayloadForProfile> = { units: [], members: [] };
    let scope;
    try {
      const context = await loadOrgContext(auth.token, profile);
      org = orgPayloadForProfile(profile, context.members, context.units, context.scope);
      scope = context.scope;
    } catch {
      scope = { kind: "self" as const, workNames: new Set(profile.workName.trim() ? [profile.workName.trim()] : []) };
    }
    const tasks = filterTasksByScope(allTasks, profile, scope);
    return NextResponse.json({
      fetchedAt: new Date().toISOString(),
      databaseTitle,
      tasks,
      org,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "노션 조회에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
