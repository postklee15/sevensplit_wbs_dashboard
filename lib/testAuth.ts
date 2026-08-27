import { createHash, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { TEST_LOGIN_EMAIL, TEST_LOGIN_UID } from "./acl";

export const TEST_TOKEN_ISS = "wbs-test:sevensplit-wbs-dashboard";
export const TEST_TOKEN_AUD = "sevensplit-wbs-dashboard";

export function testPasswordConfigured(): boolean {
  return Boolean(process.env.WBS_TEST_PASSWORD?.trim());
}

function secretKey() {
  const password = process.env.WBS_TEST_PASSWORD?.trim() ?? "";
  return new TextEncoder().encode(`wbs-test:${password}`);
}

export function testPasswordMatches(input: string): boolean {
  const expected = process.env.WBS_TEST_PASSWORD?.trim() ?? "";
  if (!expected || !input) return false;
  const left = createHash("sha256").update(input).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export async function mintTestToken(): Promise<string> {
  if (!testPasswordConfigured()) {
    throw new Error("테스트 로그인이 꺼져 있습니다.");
  }
  return new SignJWT({
    email: TEST_LOGIN_EMAIL,
    user_id: TEST_LOGIN_UID,
    name: "WBS 테스트",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(TEST_TOKEN_ISS)
    .setAudience(TEST_TOKEN_AUD)
    .setSubject(TEST_LOGIN_UID)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secretKey());
}

export async function verifyTestToken(token: string): Promise<{
  email: string;
  uid: string;
  name: string;
  token: string;
} | null> {
  if (!testPasswordConfigured()) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: TEST_TOKEN_ISS,
      audience: TEST_TOKEN_AUD,
    });
    const email = typeof payload.email === "string" ? payload.email : "";
    const uid =
      typeof payload.user_id === "string"
        ? payload.user_id
        : typeof payload.sub === "string"
          ? payload.sub
          : "";
    if (email !== TEST_LOGIN_EMAIL || uid !== TEST_LOGIN_UID) return null;
    return { email, uid, name: "WBS 테스트", token };
  } catch {
    return null;
  }
}
