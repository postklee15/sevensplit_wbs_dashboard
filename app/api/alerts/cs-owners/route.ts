import { NextResponse } from "next/server";
import { canManageAccess } from "@/lib/acl";
import { jsonAuthError, requireSevensplitUser } from "@/lib/adminAuth";
import { heartbeatUser } from "@/lib/aclStore";
import { listCsOwners, parseCsOwnerKind, upsertCsOwner } from "@/lib/alertStore";
import { NO_CS_SERVICE, servicesOfCs } from "@/lib/cs";
import { fetchCsItems } from "@/lib/csNotion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function forbid() {
  return NextResponse.json(
    { error: "본부장 또는 슈퍼관리자만 CS 담당을 설정할 수 있습니다.", reason: "forbidden_page" },
    { status: 403 },
  );
}

async function requireManager(request: Request) {
  const auth = await requireSevensplitUser(request);
  if ("reason" in auth) return { error: NextResponse.json(jsonAuthError(auth), { status: auth.status }) };
  const profile = await heartbeatUser({
    token: auth.token,
    uid: auth.uid,
    email: auth.email,
    displayName: auth.name || auth.email,
  });
  if (!canManageAccess(profile)) return { error: forbid() };
  return { auth };
}

export async function GET(request: Request) {
  const loaded = await requireManager(request);
  if ("error" in loaded) return loaded.error;

  try {
    const owners = await listCsOwners(loaded.auth.token);
    const services = new Set(owners.map((row) => row.service));
    try {
      const { items } = await fetchCsItems();
      for (const name of servicesOfCs(items)) services.add(name);
      if (items.some((item) => !item.service)) services.add(NO_CS_SERVICE);
    } catch {
      /* 저장된 담당 목록은 그대로 반환 */
    }
    return NextResponse.json({
      owners,
      services: [...services].sort((a, b) => a.localeCompare(b, "ko")),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CS 담당 목록을 읽지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const loaded = await requireManager(request);
  if ("error" in loaded) return loaded.error;

  const body = (await request.json()) as {
    service?: string;
    ownerKind?: string;
    ownerId?: string;
  };
  if (!body.service?.trim()) {
    return NextResponse.json({ error: "서비스 이름이 필요합니다." }, { status: 400 });
  }

  try {
    const owner = await upsertCsOwner(
      loaded.auth.token,
      {
        service: body.service,
        ownerKind: parseCsOwnerKind(body.ownerKind ?? "user"),
        ownerId: body.ownerId ?? "",
      },
      loaded.auth.email,
    );
    return NextResponse.json({ owner });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CS 담당을 저장하지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
