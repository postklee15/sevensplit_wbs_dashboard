import { NextResponse } from "next/server";
import { canUseCs } from "@/lib/acl";
import { jsonAuthError, requireSevensplitUser } from "@/lib/adminAuth";
import { heartbeatUser } from "@/lib/aclStore";
import { fetchCsDatabase, fetchCsPage, patchCsStatus } from "@/lib/csNotion";
import { PatchError } from "@/lib/notionWrite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

async function loadProfile(request: Request) {
  const auth = await requireSevensplitUser(request);
  if ("reason" in auth) return { error: NextResponse.json(jsonAuthError(auth), { status: auth.status }) };
  const profile = await heartbeatUser({
    token: auth.token,
    uid: auth.uid,
    email: auth.email,
    displayName: auth.name || auth.email,
  });
  if (!canUseCs(profile)) {
    return {
      error: NextResponse.json(
        { error: "CS를 수정할 권한이 없습니다.", reason: "forbidden_page" },
        { status: 403 },
      ),
    };
  }
  return { profile };
}

export async function PATCH(request: Request, ctx: RouteCtx) {
  const loaded = await loadProfile(request);
  if ("error" in loaded) return loaded.error;

  let status: string | undefined;
  try {
    const body = (await request.json()) as { status?: unknown };
    if (typeof body.status === "string") status = body.status;
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }
  if (status == null) {
    return NextResponse.json({ error: "상태가 필요합니다." }, { status: 400 });
  }

  try {
    const { id } = await ctx.params;
    const { inDatabase } = await fetchCsPage(id);
    if (!inDatabase) {
      return NextResponse.json({ error: "노션 페이지를 찾지 못했습니다." }, { status: 404 });
    }
    const { schema } = await fetchCsDatabase();
    const item = await patchCsStatus(id, status, schema);
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof PatchError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "노션 저장에 실패했습니다.";
    const statusCode = message.includes("찾지 못") || message.includes("올바르지") ? 404 : 500;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
