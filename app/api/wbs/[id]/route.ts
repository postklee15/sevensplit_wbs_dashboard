import { NextResponse } from "next/server";
import { canEditWbsTask, canOpenPage, canReadWbsTask } from "@/lib/acl";
import { jsonAuthError, requireSevensplitUser } from "@/lib/adminAuth";
import { heartbeatUser } from "@/lib/aclStore";
import { fetchWbsPage } from "@/lib/notion";
import { fetchWbsSchema, PatchError, patchWbsPage } from "@/lib/notionWrite";
import type { TaskPatch } from "@/lib/types";

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
  if (!canOpenPage(profile, "dashboard") && !canOpenPage(profile, "performance")) {
    return {
      error: NextResponse.json(
        { error: "이 작업을 볼 권한이 없습니다.", reason: "forbidden_page" },
        { status: 403 },
      ),
    };
  }
  return { profile };
}

export async function GET(request: Request, ctx: RouteCtx) {
  const loaded = await loadProfile(request);
  if ("error" in loaded) return loaded.error;

  try {
    const { id } = await ctx.params;
    const { task, inDatabase } = await fetchWbsPage(id);
    if (!inDatabase) {
      return NextResponse.json({ error: "노션 페이지를 찾지 못했습니다." }, { status: 404 });
    }
    if (!canReadWbsTask(loaded.profile, task.assignees)) {
      return NextResponse.json({ error: "이 작업을 볼 권한이 없습니다." }, { status: 403 });
    }
    return NextResponse.json({ task });
  } catch (error) {
    const message = error instanceof Error ? error.message : "노션 페이지를 읽지 못했습니다.";
    const status = message.includes("찾지 못") || message.includes("올바르지") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request, ctx: RouteCtx) {
  const loaded = await loadProfile(request);
  if ("error" in loaded) return loaded.error;

  let patch: TaskPatch;
  try {
    patch = (await request.json()) as TaskPatch;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  try {
    const { id } = await ctx.params;
    const { task, inDatabase } = await fetchWbsPage(id);
    if (!inDatabase) {
      return NextResponse.json({ error: "노션 페이지를 찾지 못했습니다." }, { status: 404 });
    }
    if (!canEditWbsTask(loaded.profile, task.assignees)) {
      return NextResponse.json(
        { error: "이 작업을 수정할 권한이 없습니다. 팀원은 본인 담당 작업만 저장할 수 있습니다." },
        { status: 403 },
      );
    }
    const schema = await fetchWbsSchema(task.assigneePeople);
    const next = await patchWbsPage(id, patch, schema, task);
    return NextResponse.json({ task: next });
  } catch (error) {
    if (error instanceof PatchError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "노션 저장에 실패했습니다.";
    const status = message.includes("찾지 못") || message.includes("올바르지") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
