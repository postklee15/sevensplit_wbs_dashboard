import { NextResponse } from "next/server";
import { canManageAccess } from "@/lib/acl";
import { jsonAuthError, requireSevensplitUser } from "@/lib/adminAuth";
import { heartbeatUser } from "@/lib/aclStore";
import { listProjectPms, upsertProjectPm } from "@/lib/alertStore";
import { NO_SERVICE, servicesOf } from "@/lib/metrics";
import { fetchWbsTasks } from "@/lib/notion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function forbid() {
  return NextResponse.json(
    { error: "본부장 또는 슈퍼관리자만 알림을 설정할 수 있습니다.", reason: "forbidden_page" },
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
    const pms = await listProjectPms(loaded.auth.token);
    const services = new Set(pms.map((row) => row.service));
    try {
      const { tasks } = await fetchWbsTasks();
      for (const name of servicesOf(tasks)) services.add(name);
      if (tasks.some((task) => !task.service)) services.add(NO_SERVICE);
    } catch {
      /* 저장된 PM 목록은 그대로 반환 */
    }
    return NextResponse.json({
      pms,
      services: [...services].sort((a, b) => a.localeCompare(b, "ko")),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PM 목록을 읽지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const loaded = await requireManager(request);
  if ("error" in loaded) return loaded.error;

  const body = (await request.json()) as { service?: string; pmUid?: string };
  if (!body.service?.trim()) {
    return NextResponse.json({ error: "서비스 이름이 필요합니다." }, { status: 400 });
  }

  try {
    const pm = await upsertProjectPm(
      loaded.auth.token,
      { service: body.service, pmUid: body.pmUid ?? "" },
      loaded.auth.email,
    );
    return NextResponse.json({ pm });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PM을 저장하지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
