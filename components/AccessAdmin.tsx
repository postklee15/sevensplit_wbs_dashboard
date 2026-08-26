"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AccessProfile, OrgRole } from "@/lib/acl";
import { ROLE_LABEL, canAssignRole, profilesVisibleTo } from "@/lib/acl";
import type { OrgUnit } from "@/lib/org";
import { divisionsOf, teamsOf } from "@/lib/org";
import { OrgTreeAdmin } from "@/components/OrgTreeAdmin";
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

function formatLastSeen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function CellStatic({ children }: { children: string }) {
  return <span className="cell-static">{children}</span>;
}

export function AccessAdmin({ token, me }: { token: string; me: AccessProfile }) {
  const [users, setUsers] = useState<AccessProfile[]>([]);
  const [units, setUnits] = useState<OrgUnit[]>([]);
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

  const loadOrg = useCallback(async () => {
    const res = await fetch("/api/org", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const body = (await res.json()) as { units?: OrgUnit[]; error?: string };
    if (!res.ok) throw new Error(body.error || `조직 조회 실패 (${res.status})`);
    setUnits(body.units ?? []);
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
      await Promise.all([loadUsers(), loadPms(), loadOrg()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "목록을 불러오지 못했습니다.");
    }
  }, [loadUsers, loadPms, loadOrg]);

  useEffect(() => {
    void load();
  }, [load]);

  async function applyPatch(
    user: AccessProfile,
    patch: Partial<Pick<AccessProfile, "canDashboard" | "canPerformance" | "slackMemberId" | "workName" | "role" | "divisionId" | "teamId">>,
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
    patch: Partial<Pick<AccessProfile, "canDashboard" | "canPerformance" | "slackMemberId" | "workName" | "role" | "divisionId" | "teamId">>,
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
  const visibleUsers = useMemo(() => profilesVisibleTo(me, users), [users, me]);
  const divisionOptions = divisionsOf(units);

  async function createUnit(input: { name: string; kind: "division" | "team"; parentId?: string }) {
    setBusy("org");
    setError(null);
    try {
      const res = await fetch("/api/org", {
        method: "POST",
        headers,
        body: JSON.stringify(input),
      });
      const body = (await res.json()) as { unit?: OrgUnit; error?: string };
      if (!res.ok || !body.unit) throw new Error(body.error || "조직 생성 실패");
      await loadOrg();
    } catch (err) {
      setError(err instanceof Error ? err.message : "조직을 만들지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function renameUnit(id: string, name: string) {
    setBusy("org");
    setError(null);
    try {
      const res = await fetch("/api/org", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ id, name }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error || "이름 변경 실패");
      await loadOrg();
    } catch (err) {
      setError(err instanceof Error ? err.message : "조직 이름을 바꾸지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteUnit(id: string) {
    setBusy("org");
    setError(null);
    try {
      const res = await fetch(`/api/org?id=${encodeURIComponent(id)}`, { method: "DELETE", headers });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error || "삭제 실패");
      await Promise.all([loadOrg(), loadUsers()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "조직을 삭제하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="shell wide access-page">
      <header className="top">
        <div>
          <p className="kicker">Split Invest · 접근 권한</p>
          <h1>사용자 권한</h1>
          <p className="sub">
            {me.email} · {ROLE_LABEL[me.role]}. 역할은 본부장 · 팀장 · 팀원입니다. 본부장은 슈퍼관리자와 같이
            권한 화면을 열고, 부하·일정승인은 자기 본부만 봅니다. 팀장은 같은 본부 일정을 승인합니다. 팀원은 본인
            부하만 봅니다. 업무 이름은 노션 담당자와 같게 넣으세요.
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

      <OrgTreeAdmin
        me={me}
        units={units}
        users={users}
        busy={busy}
        onCreate={createUnit}
        onRename={renameUnit}
        onDelete={deleteUnit}
      />

      <div className="panel">
        <h2>가입 계정 · {visibleUsers.length}명</h2>
        <div className="table-wrap">
          <table className="tasks access-table">
            <colgroup>
              <col className="col-email" />
              <col className="col-name" />
              <col className="col-work" />
              <col className="col-role" />
              <col className="col-org" />
              <col className="col-org" />
              <col className="col-slack" />
              <col className="col-flag" />
              <col className="col-flag" />
              <col className="col-seen" />
            </colgroup>
            <thead>
              <tr>
                <th>이메일</th>
                <th>이름</th>
                <th>업무 이름</th>
                <th>역할</th>
                <th>본부</th>
                <th>팀</th>
                <th>Slack</th>
                <th title="부하 대시보드">부하</th>
                <th title="성과 페이지">성과</th>
                <th title="최근 로그인">로그인</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => (
                <tr key={user.uid}>
                  <td className="cell-clip" title={user.email}>
                    {user.email}
                  </td>
                  <td className="cell-clip" title={user.displayName || undefined}>
                    {user.displayName || <CellStatic>—</CellStatic>}
                  </td>
                  <td>
                    <input
                      key={`${user.uid}:work:${user.workName}`}
                      className="cell-input"
                      defaultValue={user.workName}
                      placeholder="노션 담당자 이름"
                      disabled={busy === user.uid}
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (next === user.workName) return;
                        void save(user, { workName: next });
                      }}
                    />
                  </td>
                  <td>
                    {user.isSuperAdmin ? (
                      <CellStatic>{ROLE_LABEL.superAdmin}</CellStatic>
                    ) : user.role === "director" && !canAssignRole(me, "director") ? (
                      <CellStatic>{ROLE_LABEL.director}</CellStatic>
                    ) : (
                      <select
                        className="cell-input"
                        value={user.role === "director" || user.role === "lead" ? user.role : "member"}
                        disabled={busy === user.uid}
                        onChange={(e) => {
                          const role = e.target.value as OrgRole;
                          void save(user, {
                            role,
                            teamId: role === "director" ? "" : user.teamId,
                          });
                        }}
                      >
                        {canAssignRole(me, "director") ? (
                          <option value="director">{ROLE_LABEL.director}</option>
                        ) : null}
                        <option value="lead">{ROLE_LABEL.lead}</option>
                        <option value="member">{ROLE_LABEL.member}</option>
                      </select>
                    )}
                  </td>
                  <td>
                    {user.isSuperAdmin ? (
                      <CellStatic>—</CellStatic>
                    ) : (
                      <select
                        className="cell-input"
                        value={user.divisionId}
                        disabled={busy === user.uid || (!me.isSuperAdmin && Boolean(me.divisionId))}
                        onChange={(e) =>
                          void save(user, { divisionId: e.target.value, teamId: "" })
                        }
                      >
                        {me.isSuperAdmin || !user.divisionId ? (
                          <option value="">(미배정)</option>
                        ) : null}
                        {(me.isSuperAdmin
                          ? divisionOptions
                          : divisionOptions.filter((unit) => unit.id === me.divisionId)
                        ).map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    {user.isSuperAdmin || user.role === "director" ? (
                      <CellStatic>—</CellStatic>
                    ) : (
                      <select
                        className="cell-input"
                        value={user.teamId}
                        disabled={busy === user.uid || !user.divisionId}
                        onChange={(e) => void save(user, { teamId: e.target.value })}
                      >
                        <option value="">(미배정)</option>
                        {teamsOf(units, user.divisionId).map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
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
                        title="로그인 이메일로 Slack 멤버 ID 찾기"
                        disabled={busy !== null}
                        onClick={() => void save(user, { slackMemberId: user.email })}
                      >
                        찾기
                      </button>
                    </div>
                  </td>
                  <td className="col-flag">
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={user.canDashboard}
                        disabled={
                          user.isSuperAdmin ||
                          user.role === "lead" ||
                          user.role === "director" ||
                          busy === user.uid
                        }
                        onChange={(e) => void save(user, { canDashboard: e.target.checked })}
                      />
                      허용
                    </label>
                  </td>
                  <td className="col-flag">
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={user.canPerformance}
                        disabled={user.isSuperAdmin || user.role === "director" || busy === user.uid}
                        onChange={(e) => void save(user, { canPerformance: e.target.checked })}
                      />
                      허용
                    </label>
                  </td>
                  <td className="col-seen">
                    <CellStatic>{formatLastSeen(user.lastSeenAt)}</CellStatic>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleUsers.length === 0 ? <p className="empty">아직 로그인한 구성원이 없습니다.</p> : null}
        </div>
      </div>

      <div className="panel">
        <h2>서비스 PM</h2>
        <p className="sub">미지정·일정 없는 리프 작업은 해당 서비스 PM에게 Slack DM으로 갑니다.</p>
        <div className="table-wrap">
          <table className="tasks access-pm">
            <colgroup>
              <col className="col-service" />
              <col className="col-pm" />
            </colgroup>
            <thead>
              <tr>
                <th>서비스</th>
                <th>PM</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service}>
                  <td className="cell-clip">{service}</td>
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
        <div className="access-actions">
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
