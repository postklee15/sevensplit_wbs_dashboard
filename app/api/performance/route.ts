import { NextResponse } from "next/server";
import { canOpenPage } from "@/lib/acl";
import { jsonAuthError, requireSevensplitUser } from "@/lib/adminAuth";
import { heartbeatUser } from "@/lib/aclStore";
import { fetchWbsTasks } from "@/lib/notion";
import { todayKst } from "@/lib/metrics";
import { buildPerformance } from "@/lib/performance";

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
    if (!canOpenPage(profile, "performance")) {
      return NextResponse.json(
        { error: "성과 페이지 접근 권한이 없습니다.", reason: "forbidden_page" },
        { status: 403 },
      );
    }

    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const person = url.searchParams.get("person");
    const service = url.searchParams.get("service");
    const { databaseTitle, tasks } = await fetchWbsTasks();
    const built = buildPerformance(tasks, {
      from: from || null,
      to: to || null,
      person: person || null,
      service: service || null,
      today: todayKst(),
    });
    return NextResponse.json({
      fetchedAt: new Date().toISOString(),
      databaseTitle,
      ...built,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "성과 데이터를 만들지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
