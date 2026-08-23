"use client";

import { useCallback, useEffect, useState } from "react";
import type { AccessProfile } from "@/lib/acl";

export function AccessAdmin({ token, me }: { token: string; me: AccessProfile }) {
  const [users, setUsers] = useState<AccessProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/acl", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body = (await res.json()) as { users?: AccessProfile[]; error?: string };
      if (!res.ok) throw new Error(body.error || `조회 실패 (${res.status})`);
      setUsers(body.users ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "사용자 목록을 불러오지 못했습니다.");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(user: AccessProfile, patch: Partial<Pick<AccessProfile, "canDashboard" | "canPerformance">>) {
    setBusy(user.uid);
    setError(null);
    try {
      const res = await fetch("/api/acl", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uid: user.uid, ...patch }),
      });
      const body = (await res.json()) as { profile?: AccessProfile; error?: string };
      if (!res.ok || !body.profile) throw new Error(body.error || "저장 실패");
      setUsers((prev) => prev.map((row) => (row.uid === user.uid ? body.profile! : row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "권한을 저장하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="shell wide">
      <header className="top">
        <div>
          <p className="kicker">Split Invest · 접근 권한</p>
          <h1>사용자 권한</h1>
          <p className="sub">
            {me.email} 슈퍼 관리자. 한 번 로그인한 구성원이 목록에 나타납니다. 성과 페이지는 허용된 사람만 볼 수 있습니다.
          </p>
        </div>
        <div className="controls">
          <button className="btn" type="button" onClick={() => void load()}>
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
    </main>
  );
}
