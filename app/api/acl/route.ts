import { NextResponse } from "next/server";
import { canAssignRole, canManageAccess, isSuperAdminEmail, profilesVisibleTo } from "@/lib/acl";
import { jsonAuthError, requireSevensplitUser } from "@/lib/adminAuth";
import { heartbeatUser, listProfiles, updateAccess } from "@/lib/aclStore";
import { listOrgUnits } from "@/lib/orgStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function forbid(message = "본부장 또는 슈퍼관리자만 권한을 변경할 수 있습니다.") {
  return NextResponse.json({ error: message, reason: "forbidden_page" }, { status: 403 });
}

async function actorOf(request: Request) {
  const auth = await requireSevensplitUser(request);
  if ("reason" in auth) return { error: NextResponse.json(jsonAuthError(auth), { status: auth.status }) };
  const profile = await heartbeatUser({
    token: auth.token,
    uid: auth.uid,
    email: auth.email,
    displayName: auth.name || auth.email,
  });
  if (!canManageAccess(profile)) return { error: forbid() };
  return { auth, profile };
}

export async function GET(request: Request) {
  const loaded = await actorOf(request);
  if ("error" in loaded) return loaded.error;
  try {
    const users = profilesVisibleTo(loaded.profile, await listProfiles(loaded.auth.token));
    return NextResponse.json({ users });
  } catch (error) {
    const message = error instanceof Error ? error.message : "사용자 목록을 읽지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const loaded = await actorOf(request);
  if ("error" in loaded) return loaded.error;

  const body = (await request.json()) as {
    uid?: string;
    canDashboard?: boolean;
    canPerformance?: boolean;
    slackMemberId?: string;
    workName?: string;
    role?: "director" | "lead" | "member";
    divisionId?: string;
    teamId?: string;
  };
  if (!body.uid) {
    return NextResponse.json({ error: "uid가 필요합니다." }, { status: 400 });
  }
  if (body.role && !canAssignRole(loaded.profile, body.role)) {
    return NextResponse.json({ error: "이 역할은 지정할 수 없습니다." }, { status: 403 });
  }

  try {
    const users = await listProfiles(loaded.auth.token);
    const target = users.find((user) => user.uid === body.uid);
    if (!target) {
      return NextResponse.json({ error: "해당 사용자를 찾을 수 없습니다." }, { status: 404 });
    }
    if (target.isSuperAdmin && !isSuperAdminEmail(loaded.profile.email)) {
      return NextResponse.json({ error: "슈퍼관리자 계정은 바꿀 수 없습니다." }, { status: 403 });
    }
    if (
      !loaded.profile.isSuperAdmin &&
      target.role === "director" &&
      body.role &&
      body.role !== "director"
    ) {
      return NextResponse.json({ error: "본부장 역할은 슈퍼관리자만 바꿀 수 있습니다." }, { status: 403 });
    }

    const units = await listOrgUnits(loaded.auth.token);
    let divisionId = body.divisionId;
    let teamId = body.teamId;
    if (!loaded.profile.isSuperAdmin) {
      const home = loaded.profile.divisionId;
      if (!home) {
        return NextResponse.json({ error: "본부장에게 본부가 배정되어 있지 않습니다." }, { status: 403 });
      }
      if (target.divisionId && target.divisionId !== home) {
        return NextResponse.json({ error: "다른 본부 인원은 수정할 수 없습니다." }, { status: 403 });
      }
      if (divisionId !== undefined && divisionId && divisionId !== home) {
        return NextResponse.json({ error: "다른 본부로 옮길 수 없습니다." }, { status: 403 });
      }
      if (divisionId === undefined && !target.divisionId) divisionId = home;
      else if (divisionId === "") divisionId = home;
    }
    const nextDivision = (divisionId ?? target.divisionId).trim();
    const nextTeam = (teamId ?? target.teamId).trim();
    if (nextTeam) {
      const team = units.find((unit) => unit.id === nextTeam && unit.kind === "team");
      if (!team) return NextResponse.json({ error: "팀을 찾지 못했습니다." }, { status: 400 });
      if (nextDivision && team.parentId !== nextDivision) {
        return NextResponse.json({ error: "팀은 선택한 본부 아래여야 합니다." }, { status: 400 });
      }
    }
    if (nextDivision) {
      const division = units.find((unit) => unit.id === nextDivision && unit.kind === "division");
      if (!division) return NextResponse.json({ error: "본부를 찾지 못했습니다." }, { status: 400 });
    }

    const profile = await updateAccess(loaded.auth.token, body.uid, {
      canDashboard: body.canDashboard,
      canPerformance: body.canPerformance,
      slackMemberId: body.slackMemberId,
      workName: body.workName,
      role: body.role,
      divisionId,
      teamId,
    });
    return NextResponse.json({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : "권한을 저장하지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
