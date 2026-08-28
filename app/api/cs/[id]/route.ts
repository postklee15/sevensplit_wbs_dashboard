import { NextResponse } from "next/server";
import { canUseCs } from "@/lib/acl";
import { jsonAuthError, requireSevensplitUser } from "@/lib/adminAuth";
import { heartbeatUser } from "@/lib/aclStore";
import { fetchCsDatabase, fetchCsPage, patchCsItem } from "@/lib/csNotion";
import { PatchError } from "@/lib/notionWrite";
import type { CsPatch } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

const TEXT_LABELS = { answer: "답변", note: "비고", feedback: "피드백" } as const;

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
        { error: "CS를 볼 권한이 없습니다.", reason: "forbidden_page" },
        { status: 403 },
      ),
    };
  }
  return { profile };
}

function parseCsPatch(raw: unknown): { ok: true; patch: CsPatch } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "요청 본문이 올바르지 않습니다." };
  }
  const body = raw as Record<string, unknown>;
  const patch: CsPatch = {};
  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    if (typeof body.status !== "string") return { ok: false, error: "상태가 올바르지 않습니다." };
    patch.status = body.status;
  }
  for (const key of ["answer", "note", "feedback"] as const) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    const value = body[key];
    if (value == null) patch[key] = null;
    else if (typeof value === "string") patch[key] = value;
    else return { ok: false, error: `${TEXT_LABELS[key]}이(가) 올바르지 않습니다.` };
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "바꿀 항목이 없습니다." };
  }
  return { ok: true, patch };
}

export async function GET(request: Request, ctx: RouteCtx) {
  const loaded = await loadProfile(request);
  if ("error" in loaded) return loaded.error;

  try {
    const { id } = await ctx.params;
    const { item, inDatabase } = await fetchCsPage(id);
    if (!inDatabase) {
      return NextResponse.json({ error: "노션 페이지를 찾지 못했습니다." }, { status: 404 });
    }
    const { schema } = await fetchCsDatabase();
    return NextResponse.json({ item, schema });
  } catch (error) {
    const message = error instanceof Error ? error.message : "노션 페이지를 읽지 못했습니다.";
    const status = message.includes("찾지 못") || message.includes("올바르지") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request, ctx: RouteCtx) {
  const loaded = await loadProfile(request);
  if ("error" in loaded) return loaded.error;

  let parsed: ReturnType<typeof parseCsPatch>;
  try {
    parsed = parseCsPatch(await request.json());
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const { id } = await ctx.params;
    const { inDatabase } = await fetchCsPage(id);
    if (!inDatabase) {
      return NextResponse.json({ error: "노션 페이지를 찾지 못했습니다." }, { status: 404 });
    }
    const { schema } = await fetchCsDatabase();
    const item = await patchCsItem(id, parsed.patch, schema);
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
