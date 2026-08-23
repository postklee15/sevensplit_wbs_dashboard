import { NextResponse } from "next/server";
import { jsonAuthError, requireSevensplitUser } from "@/lib/adminAuth";
import { heartbeatUser, updateWorkName } from "@/lib/aclStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireSevensplitUser(request);
  if ("reason" in auth) {
    return NextResponse.json(jsonAuthError(auth), { status: auth.status });
  }

  let displayName = auth.name;
  try {
    const body = (await request.json()) as { displayName?: string };
    if (typeof body.displayName === "string" && body.displayName.trim()) {
      displayName = body.displayName.trim();
    }
  } catch {
    // no body
  }

  try {
    const profile = await heartbeatUser({
      token: auth.token,
      uid: auth.uid,
      email: auth.email,
      displayName: displayName || auth.email,
    });
    return NextResponse.json({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : "권한 정보를 저장하지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireSevensplitUser(request);
  if ("reason" in auth) {
    return NextResponse.json(jsonAuthError(auth), { status: auth.status });
  }

  let workName: string;
  try {
    const body = (await request.json()) as { workName?: unknown };
    if (typeof body.workName !== "string") {
      return NextResponse.json({ error: "업무 이름을 문자열로 보내 주세요." }, { status: 400 });
    }
    workName = body.workName;
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  try {
    const profile = await updateWorkName(auth.token, auth.uid, workName);
    return NextResponse.json({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : "프로필을 저장하지 못했습니다.";
    const status = message.includes("프로필이 없습니다") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
