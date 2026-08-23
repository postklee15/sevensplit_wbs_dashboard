const SLACK_API = "https://slack.com/api";

export function slackBotToken(): string {
  return (process.env.SLACK_BOT_TOKEN ?? "").trim();
}

async function slackCall<T>(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T & { ok: boolean; error?: string }> {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const json = (await res.json()) as T & { ok: boolean; error?: string };
  if (!res.ok) {
    throw new Error(`Slack ${method} HTTP ${res.status}`);
  }
  return json;
}

export async function lookupSlackUserId(token: string, email: string): Promise<string | null> {
  const res = await fetch(
    `${SLACK_API}/users.lookupByEmail?email=${encodeURIComponent(email)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    },
  );
  const json = (await res.json()) as {
    ok: boolean;
    error?: string;
    user?: { id?: string };
  };
  if (!json.ok) {
    if (json.error === "users_not_found" || json.error === "users_not_found") return null;
    if (json.error === "missing_scope") {
      throw new Error(
        "Slack 앱에 users:read.email 스코프가 없습니다. 스코프를 넣은 뒤 워크스페이스에 다시 설치하세요.",
      );
    }
    if (json.error === "invalid_auth" || json.error === "not_authed") {
      throw new Error("Slack 봇 토큰이 올바르지 않습니다. Bot User OAuth Token(xoxb-)인지 확인하세요.");
    }
    throw new Error(`Slack 이메일 조회 실패 (${json.error ?? "unknown"})`);
  }
  return json.user?.id ?? null;
}

export async function resolveSlackMemberId(raw: string): Promise<string> {
  const value = raw.trim();
  if (!value) return "";
  if (/^U[A-Z0-9]+$/i.test(value)) return value.slice(0, 31);
  if (!value.includes("@") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value)) {
    throw new Error("Slack 멤버 ID는 U로 시작하거나, 조회할 이메일 주소여야 합니다.");
  }
  const token = slackBotToken();
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN이 없어 이메일로 Slack 멤버를 찾지 못합니다.");
  }
  const id = await lookupSlackUserId(token, value);
  if (!id) {
    throw new Error(
      `Slack에서 ${value} 사용자를 찾지 못했습니다. Slack 프로필 이메일이 같은지 확인하세요.`,
    );
  }
  return id.slice(0, 31);
}

export async function sendSlackDm(token: string, slackUserId: string, text: string): Promise<void> {
  const opened = await slackCall<{ channel?: { id?: string } }>(token, "conversations.open", {
    users: slackUserId,
  });
  if (!opened.ok || !opened.channel?.id) {
    throw new Error(`Slack DM 채널을 열지 못했습니다 (${opened.error ?? "unknown"})`);
  }
  const posted = await slackCall(token, "chat.postMessage", {
    channel: opened.channel.id,
    text,
    unfurl_links: false,
    unfurl_media: false,
  });
  if (!posted.ok) {
    throw new Error(`Slack 메시지 전송 실패 (${posted.error ?? "unknown"})`);
  }
}
