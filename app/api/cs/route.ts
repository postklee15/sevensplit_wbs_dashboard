import { NextResponse } from "next/server";
import { canUseCs } from "@/lib/acl";
import { jsonAuthError, requireSevensplitUser } from "@/lib/adminAuth";
import { heartbeatUser } from "@/lib/aclStore";
import { fetchCsItems } from "@/lib/csNotion";

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
    if (!canUseCs(profile)) {
      return NextResponse.json(
        { error: "CS 대시보드 접근 권한이 없습니다.", reason: "forbidden_page" },
        { status: 403 },
      );
    }
    const { databaseTitle, items, schema } = await fetchCsItems();
    return NextResponse.json({
      fetchedAt: new Date().toISOString(),
      databaseTitle,
      items,
      schema,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "노션 CS 조회에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
