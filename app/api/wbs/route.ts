import { NextResponse } from "next/server";
import { requireSevensplitUser } from "@/lib/adminAuth";
import { fetchWbsTasks } from "@/lib/notion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSevensplitUser(request);
  if ("reason" in auth) {
    return NextResponse.json(
      { error: auth.error, reason: auth.reason },
      { status: auth.status },
    );
  }

  try {
    const { databaseTitle, tasks } = await fetchWbsTasks();
    return NextResponse.json({
      fetchedAt: new Date().toISOString(),
      databaseTitle,
      tasks,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "노션 조회에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
