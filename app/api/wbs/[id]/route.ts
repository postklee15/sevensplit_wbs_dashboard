import { NextResponse } from "next/server";
import { canCascadeWbsDelay, canEditWbsTask, canOpenPage, canReadWbsTask } from "@/lib/acl";
import { jsonAuthError, requireSevensplitUser } from "@/lib/adminAuth";
import { heartbeatUser } from "@/lib/aclStore";
import { fetchWbsPage, fetchWbsTasks } from "@/lib/notion";
import { normalizeNotionId } from "@/lib/notionIds";
import { fetchWbsSchema, PatchError, patchWbsPage } from "@/lib/notionWrite";
import { assertCanCascadeDelay, cascadeDelayToDescendants, rootLooksDelayed } from "@/lib/wbsDelayCascade";
import type { TaskWriteBody } from "@/lib/types";

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

  let body: TaskWriteBody;
  try {
    body = (await request.json()) as TaskWriteBody;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  const cascadeDelay = Boolean(body.cascadeDelay);
  const { cascadeDelay: _cascadeDelay, ...patch } = body;

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
    if (cascadeDelay && !canCascadeWbsDelay(loaded.profile)) {
      return NextResponse.json(
        { error: "하위 일괄 지연은 팀장·슈퍼관리자만 할 수 있습니다." },
        { status: 403 },
      );
    }
    const schema = await fetchWbsSchema(task.assigneePeople);
    const next = await patchWbsPage(id, patch, schema, task);
    let cascaded = 0;
    let cascadeFailed = 0;
    if (cascadeDelay && rootLooksDelayed(next)) {
      const { tasks } = await fetchWbsTasks();
      assertCanCascadeDelay(id, tasks);
      const treeRoot = tasks.find((row) => normalizeNotionId(row.id) === normalizeNotionId(id));
      const result = await cascadeDelayToDescendants({
        rootId: id,
        root: {
          ...next,
          parentId: treeRoot?.parentId ?? next.parentId,
        },
        tasks,
        schema,
      });
      cascaded = result.cascaded;
      cascadeFailed = result.cascadeFailed;
    }
    return NextResponse.json({ task: next, cascaded, cascadeFailed });
  } catch (error) {
    if (error instanceof PatchError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "노션 저장에 실패했습니다.";
    const status = message.includes("찾지 못") || message.includes("올바르지") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
