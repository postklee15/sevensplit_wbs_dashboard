import { NextResponse } from "next/server";
import { canOpenPage } from "@/lib/acl";
import { jsonAuthError, requireSevensplitUser } from "@/lib/adminAuth";
import { heartbeatUser } from "@/lib/aclStore";
import { fetchWbsSchema } from "@/lib/notionWrite";

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
    if (!canOpenPage(profile, "dashboard") && !canOpenPage(profile, "performance")) {
      return NextResponse.json(
        { error: "스키마를 볼 권한이 없습니다.", reason: "forbidden_page" },
        { status: 403 },
      );
    }
    const schema = await fetchWbsSchema();
    return NextResponse.json({ schema });
  } catch (error) {
    const message = error instanceof Error ? error.message : "노션 스키마를 읽지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
