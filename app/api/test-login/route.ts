import { NextResponse } from "next/server";
import { normalizeEmail, TEST_LOGIN_EMAIL } from "@/lib/acl";
import { mintTestToken, testPasswordConfigured, testPasswordMatches } from "@/lib/testAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ enabled: testPasswordConfigured() });
}

export async function POST(request: Request) {
  if (!testPasswordConfigured()) {
    return NextResponse.json({ error: "테스트 로그인이 꺼져 있습니다." }, { status: 404 });
  }

  let email = "";
  let password = "";
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown };
    email = typeof body.email === "string" ? body.email : "";
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "요청이 올바르지 않습니다." }, { status: 400 });
  }

  if (normalizeEmail(email) !== TEST_LOGIN_EMAIL || !testPasswordMatches(password)) {
    return NextResponse.json({ error: "테스트 계정 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const token = await mintTestToken();
  return NextResponse.json({ token, email: TEST_LOGIN_EMAIL });
}
