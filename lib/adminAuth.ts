import { createRemoteJWKSet, jwtVerify } from "jose";
import { isAllowedEmail } from "./allowedEmail";
import { verifyTestToken } from "./testAuth";

export type AuthFailure = {
  status: 401 | 403;
  error: string;
  reason: "missing_token" | "invalid_token" | "forbidden_domain" | "forbidden_page";
};

export type AuthUser = {
  email: string;
  uid: string;
  name: string;
  token: string;
};

const PROJECT_ID = "sevensplit-wbs-dashboard";
const JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
);

function readToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  const forwarded = request.headers.get("x-forwarded-authorization") ?? "";
  if (forwarded.toLowerCase().startsWith("bearer ")) {
    return forwarded.slice(7).trim();
  }
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)wbs_token=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

export async function requireSevensplitUser(
  request: Request,
): Promise<AuthUser | AuthFailure> {
  const token = readToken(request);
  if (!token) {
    return {
      status: 401,
      reason: "missing_token",
      error: "로그인 토큰이 전달되지 않았습니다. 다시 로그인해 주세요.",
    };
  }

  const testUser = await verifyTestToken(token);
  if (testUser) return testUser;

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    });
    const email = typeof payload.email === "string" ? payload.email : "";
    const uid =
      typeof payload.user_id === "string"
        ? payload.user_id
        : typeof payload.sub === "string"
          ? payload.sub
          : "";
    const name = typeof payload.name === "string" ? payload.name : "";
    if (!isAllowedEmail(email) || !uid) {
      return {
        status: 403,
        reason: "forbidden_domain",
        error: "@sevensplit.com Google 계정만 사용할 수 있습니다.",
      };
    }
    return { email, uid, name, token };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("id token verify failed:", message);
    return {
      status: 401,
      reason: "invalid_token",
      error: "로그인 검증에 실패했습니다. 다시 로그인해 주세요.",
    };
  }
}

export function jsonAuthError(auth: AuthFailure) {
  return { error: auth.error, reason: auth.reason };
}
