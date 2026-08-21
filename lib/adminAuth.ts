import { createRemoteJWKSet, jwtVerify } from "jose";
import { isAllowedEmail } from "./allowedEmail";

export type AuthFailure = {
  status: 401 | 403;
  error: string;
  reason: "missing_token" | "invalid_token" | "forbidden_domain";
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
): Promise<{ email: string } | AuthFailure> {
  const token = readToken(request);
  if (!token) {
    return {
      status: 401,
      reason: "missing_token",
      error: "로그인 토큰이 전달되지 않았습니다. 다시 로그인해 주세요.",
    };
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    });
    const email = typeof payload.email === "string" ? payload.email : "";
    if (!isAllowedEmail(email)) {
      return {
        status: 403,
        reason: "forbidden_domain",
        error: "@sevensplit.com Google 계정만 사용할 수 있습니다.",
      };
    }
    return { email };
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
