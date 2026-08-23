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
    if (json.error === "users_not_found") return null;
    throw new Error(`Slack 이메일 조회 실패 (${json.error ?? "unknown"})`);
  }
  return json.user?.id ?? null;
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
