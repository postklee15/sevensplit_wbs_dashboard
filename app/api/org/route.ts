import { NextResponse } from "next/server";
import { canManageAccess, isSuperAdminEmail } from "@/lib/acl";
import { jsonAuthError, requireSevensplitUser } from "@/lib/adminAuth";
import { clearOrgMembership, heartbeatUser, listProfiles } from "@/lib/aclStore";
import { unitsVisibleTo } from "@/lib/org";
import { createOrgUnit, deleteOrgUnit, listOrgUnits, renameOrgUnit } from "@/lib/orgStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function forbid(message = "본부장 또는 슈퍼관리자만 조직을 바꿀 수 있습니다.") {
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
    const units = unitsVisibleTo(loaded.profile, await listOrgUnits(loaded.auth.token));
    return NextResponse.json({ units });
  } catch (error) {
    const message = error instanceof Error ? error.message : "조직을 읽지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const loaded = await actorOf(request);
  if ("error" in loaded) return loaded.error;
  const body = (await request.json()) as { name?: string; kind?: "division" | "team"; parentId?: string };
  const kind = body.kind;
  const name = body.name?.trim() ?? "";
  if (kind !== "division" && kind !== "team") {
    return NextResponse.json({ error: "본부 또는 팀만 만들 수 있습니다." }, { status: 400 });
  }
  if (kind === "division" && !isSuperAdminEmail(loaded.profile.email)) {
    return NextResponse.json({ error: "본부는 슈퍼관리자만 만들 수 있습니다." }, { status: 403 });
  }
  let parentId = (body.parentId ?? "").trim();
  if (kind === "team") {
    if (!loaded.profile.isSuperAdmin) {
      if (!loaded.profile.divisionId) return forbid("본부가 배정된 본부장만 팀을 만들 수 있습니다.");
      parentId = loaded.profile.divisionId;
    }
    if (!parentId) {
      return NextResponse.json({ error: "팀은 본부 아래에 만듭니다." }, { status: 400 });
    }
  }
  try {
    const unit = await createOrgUnit(loaded.auth.token, { name, kind, parentId });
    return NextResponse.json({ unit });
  } catch (error) {
    const message = error instanceof Error ? error.message : "조직을 만들지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const loaded = await actorOf(request);
  if ("error" in loaded) return loaded.error;
  const body = (await request.json()) as { id?: string; name?: string };
  if (!body.id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
  try {
    const units = await listOrgUnits(loaded.auth.token);
    const current = units.find((unit) => unit.id === body.id);
    if (!current) return NextResponse.json({ error: "조직을 찾지 못했습니다." }, { status: 404 });
    if (!loaded.profile.isSuperAdmin) {
      const home = loaded.profile.divisionId;
      const allowed =
        current.id === home || (current.kind === "team" && current.parentId === home);
      if (!allowed) return forbid("자기 본부만 수정할 수 있습니다.");
    }
    const unit = await renameOrgUnit(loaded.auth.token, body.id, body.name ?? "");
    return NextResponse.json({ unit });
  } catch (error) {
    const message = error instanceof Error ? error.message : "조직 이름을 바꾸지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const loaded = await actorOf(request);
  if ("error" in loaded) return loaded.error;
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
  try {
    const units = await listOrgUnits(loaded.auth.token);
    const current = units.find((unit) => unit.id === id);
    if (!current) return NextResponse.json({ error: "조직을 찾지 못했습니다." }, { status: 404 });
    if (current.kind === "division" && !isSuperAdminEmail(loaded.profile.email)) {
      return forbid("본부는 슈퍼관리자만 삭제할 수 있습니다.");
    }
    if (!loaded.profile.isSuperAdmin && current.kind === "team") {
      if (current.parentId !== loaded.profile.divisionId) {
        return forbid("자기 본부 팀만 삭제할 수 있습니다.");
      }
    }
    const removed = await deleteOrgUnit(loaded.auth.token, id);
    const users = await listProfiles(loaded.auth.token);
    await clearOrgMembership(loaded.auth.token, users, [removed.id, ...removed.childIds]);
    return NextResponse.json({ ok: true, id: removed.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "조직을 삭제하지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
