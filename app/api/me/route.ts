import { NextResponse } from "next/server";
import { jsonAuthError, requireSevensplitUser } from "@/lib/adminAuth";
import { heartbeatUser } from "@/lib/aclStore";

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
