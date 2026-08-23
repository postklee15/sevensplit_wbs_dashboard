"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AccessProfile } from "@/lib/acl";
import type { ProjectPm } from "@/lib/alertStore";

type PreviewRow = {
  kind: "unassigned" | "overdue";
  recipientUid: string;
  recipientName: string;
  service: string;
  taskCount: number;
  skip: string;
  sampleTitles: string[];
};

type RunResult = {
  dateKst: string;
  dryRun: boolean;
  preview: PreviewRow[];
  sent: number;
  skipped: number;
  errors: string[];
};

const SKIP_LABEL: Record<string, string> = {
  "no-pm": "PM 없음",
  "pm-not-found": "PM 계정 없음",
  "no-slack": "Slack ID 없음",
  "already-sent": "오늘 이미 보냄",
  "no-assignee": "담당자 없음",
  "assignee-not-found": "업무 이름 불일치",
  "dry-run": "미리보기",
  sent: "전송됨",
  "send-failed": "전송 실패",
};

function userLabel(user: AccessProfile): string {
  return user.workName ? `${user.workName} (${user.email})` : user.email;
}

export function AccessAdmin({ token, me }: { token: string; me: AccessProfile }) {
  const [users, setUsers] = useState<AccessProfile[]>([]);
  const [pms, setPms] = useState<ProjectPm[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [preview, setPreview] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [force, setForce] = useState(false);

  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }),
    [token],
  );

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/acl", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const body = (await res.json()) as { users?: AccessProfile[]; error?: string };
    if (!res.ok) throw new Error(body.error || `조회 실패 (${res.status})`);
    setUsers(body.users ?? []);
  }, [token]);

  const loadPms = useCallback(async () => {
    const res = await fetch("/api/alerts/pms", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const body = (await res.json()) as { pms?: ProjectPm[]; services?: string[]; error?: string };
    if (!res.ok) throw new Error(body.error || `PM 조회 실패 (${res.status})`);
    setPms(body.pms ?? []);
    setServices(body.services ?? []);
  }, [token]);

  const load = useCallback(async () => {
    setError(null);
    try {
      await Promise.all([loadUsers(), loadPms()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "목록을 불러오지 못했습니다.");
    }
  }, [loadUsers, loadPms]);

  useEffect(() => {
    void load();
  }, [load]);

  async function applyPatch(
    user: AccessProfile,
    patch: Partial<Pick<AccessProfile, "canDashboard" | "canPerformance" | "slackMemberId">>,
  ) {
    const res = await fetch("/api/acl", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ uid: user.uid, ...patch }),
    });
    const body = (await res.json()) as { profile?: AccessProfile; error?: string };
    if (!res.ok || !body.profile) throw new Error(body.error || "저장 실패");
    setUsers((prev) => prev.map((row) => (row.uid === user.uid ? body.profile! : row)));
  }

  async function save(
    user: AccessProfile,
    patch: Partial<Pick<AccessProfile, "canDashboard" | "canPerformance" | "slackMemberId">>,
  ) {
    setBusy(user.uid);
    setError(null);
    try {
      await applyPatch(user, patch);
    } catch (err) {
      setError(err instanceof Error ? err.message : "권한을 저장하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function fillEmptySlackIds() {
    const missing = users.filter((user) => !user.slackMemberId.trim());
    if (missing.length === 0) {
      setError("채울 Slack ID가 없습니다. 이미 모두 들어 있습니다.");
      return;
    }
    setBusy("slack-fill");
    setError(null);
    const failed: string[] = [];
    try {
      for (const user of missing) {
        try {
          await applyPatch(user, { slackMemberId: user.email });
        } catch (err) {
          failed.push(`${user.email}: ${err instanceof Error ? err.message : "실패"}`);
        }
      }
      if (failed.length > 0) setError(failed.join(" · "));
    } finally {
      setBusy(null);
    }
  }

  async function savePm(service: string, pmUid: string) {
    setBusy(`pm:${service}`);
    setError(null);
    try {
      const res = await fetch("/api/alerts/pms", {
        method: "PUT",
        headers,
        body: JSON.stringify({ service, pmUid }),
      });
      const body = (await res.json()) as { pm?: ProjectPm; error?: string };
      if (!res.ok || !body.pm) throw new Error(body.error || "PM 저장 실패");
      setPms((prev) => {
        const next = prev.filter((row) => row.service !== service);
        next.push(body.pm!);
        return next.sort((a, b) => a.service.localeCompare(b.service, "ko"));
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "PM을 저장하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function runAlerts(dryRun: boolean) {
    setBusy(dryRun ? "preview" : "send");
    setError(null);
    try {
      const res = await fetch("/api/alerts/run", {
        method: "POST",
        headers,
        body: JSON.stringify({ dryRun, force }),
      });
      const body = (await res.json()) as RunResult & { error?: string };
      if (!res.ok) throw new Error(body.error || "실행 실패");
      setPreview(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알림 작업을 실행하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  const pmByService = useMemo(() => new Map(pms.map((row) => [row.service, row.pmUid])), [pms]);

  return (
    <main className="shell wide">
      <header className="top">
        <div>
          <p className="kicker">Split Invest · 접근 권한</p>
          <h1>사용자 권한</h1>
          <p className="sub">
            {me.email} 슈퍼 관리자. Slack 칸에 이메일을 넣거나 「이메일로 찾기」를 누르면 멤버 ID를 채웁니다. 칸을 비워 두면
            보낼 때 로그인 이메일로 찾습니다. 서비스 PM은 미지정 작업 DM을 받습니다.
          </p>
        </div>
        <div className="controls">
          <button className="btn" type="button" onClick={() => void fillEmptySlackIds()} disabled={busy !== null}>
            {busy === "slack-fill" ? "Slack ID 채우는 중…" : "빈 Slack ID 채우기"}
          </button>
          <button className="btn" type="button" onClick={() => void load()} disabled={busy !== null}>
            목록 새로고침
          </button>
        </div>
      </header>
      {error ? <p className="auth-error">{error}</p> : null}

      <div className="panel">
        <h2>가입 계정 · {users.length}명</h2>
        <div className="table-wrap">
          <table className="tasks">
            <thead>
              <tr>
                <th>이메일</th>
                <th>이름</th>
                <th>업무 이름</th>
                <th>역할</th>
                <th>Slack 멤버 ID</th>
                <th>부하 대시보드</th>
                <th>성과 페이지</th>
                <th>최근 로그인</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.uid}>
                  <td>{user.email}</td>
                  <td>{user.displayName || "—"}</td>
                  <td>{user.workName || "—"}</td>
                  <td>{user.isSuperAdmin ? "슈퍼 관리자" : "구성원"}</td>
                  <td>
                    <div className="slack-id-cell">
                      <input
                        key={`${user.uid}:${user.slackMemberId}`}
                        className="cell-input"
                        defaultValue={user.slackMemberId}
                        placeholder="U… 또는 이메일"
                        disabled={busy === user.uid || busy === "slack-fill"}
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (next === user.slackMemberId) return;
                          void save(user, { slackMemberId: next });
                        }}
                      />
                      <button
                        className="btn compact"
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void save(user, { slackMemberId: user.email })}
                      >
                        이메일로 찾기
                      </button>
                    </div>
                  </td>
                  <td>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={user.canDashboard}
                        disabled={user.isSuperAdmin || busy === user.uid}
                        onChange={(e) => void save(user, { canDashboard: e.target.checked })}
                      />
                      허용
                    </label>
                  </td>
                  <td>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={user.canPerformance}
                        disabled={user.isSuperAdmin || busy === user.uid}
                        onChange={(e) => void save(user, { canPerformance: e.target.checked })}
                      />
                      허용
                    </label>
                  </td>
                  <td>
                    {user.lastSeenAt
                      ? new Date(user.lastSeenAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 ? <p className="empty">아직 로그인한 구성원이 없습니다.</p> : null}
        </div>
      </div>

      <div className="panel">
        <h2>서비스 PM</h2>
        <p className="sub">미지정·일정 없는 리프 작업은 해당 서비스 PM에게 Slack DM으로 갑니다.</p>
        <div className="table-wrap">
          <table className="tasks">
            <thead>
              <tr>
                <th>서비스</th>
                <th>PM</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service}>
                  <td>{service}</td>
                  <td>
                    <select
                      className="cell-input"
                      value={pmByService.get(service) ?? ""}
                      disabled={busy === `pm:${service}`}
                      onChange={(e) => void savePm(service, e.target.value)}
                    >
                      <option value="">(없음)</option>
                      {users.map((user) => (
                        <option key={user.uid} value={user.uid}>
                          {userLabel(user)}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {services.length === 0 ? <p className="empty">표시할 서비스가 없습니다. WBS를 한 번 불러온 뒤 다시 열어 주세요.</p> : null}
        </div>
      </div>

      <div className="panel">
        <h2>Slack 알림</h2>
        <p className="sub">평일 09:00 KST에 GitHub Actions가 자동 발송합니다. 여기서 미리보기하거나 지금 보낼 수 있습니다.</p>
        <div className="controls">
          <label className="toggle">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            오늘 이미 보낸 것도 다시
          </label>
          <button className="btn" type="button" disabled={busy !== null} onClick={() => void runAlerts(true)}>
            {busy === "preview" ? "미리보는 중…" : "미리보기"}
          </button>
          <button className="btn" type="button" disabled={busy !== null} onClick={() => void runAlerts(false)}>
            {busy === "send" ? "보내는 중…" : "지금 보내기"}
          </button>
        </div>
        {preview ? (
          <>
            <p className="sub">
              {preview.dateKst} · 전송 {preview.sent} · 건너뜀 {preview.skipped}
              {preview.dryRun ? " · 미리보기" : ""}
              {preview.errors.length ? ` · 오류 ${preview.errors.length}` : ""}
            </p>
            {preview.errors.length ? (
              <ul className="sub">
                {preview.errors.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            <div className="table-wrap">
              <table className="tasks">
                <thead>
                  <tr>
                    <th>종류</th>
                    <th>수신</th>
                    <th>서비스</th>
                    <th>건수</th>
                    <th>결과</th>
                    <th>예시</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((row, index) => (
                    <tr key={`${row.kind}-${row.recipientUid}-${row.service}-${index}`}>
                      <td>{row.kind === "unassigned" ? "미지정" : "기한초과"}</td>
                      <td>{row.recipientName || row.recipientUid || "—"}</td>
                      <td>{row.service}</td>
                      <td>{row.taskCount}</td>
                      <td>{SKIP_LABEL[row.skip] ?? row.skip}</td>
                      <td>{row.sampleTitles.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
