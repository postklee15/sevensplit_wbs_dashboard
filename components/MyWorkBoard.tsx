"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { AccessProfile } from "@/lib/acl";
import type { DashboardPayload, Task } from "@/lib/types";
import {
  WEEKLY_CAPACITY,
  assigneesOf,
  filterTasks,
  remainingEffort,
  servicesOf,
  taskStatus,
  todayKst,
} from "@/lib/metrics";
import { scheduleApprovalOf } from "@/lib/scheduleApproval";
import { TaskTitle } from "@/components/TaskTitle";
import { WbsCalendar } from "@/components/WbsCalendar";

type MyView = "list" | "month" | "week";

function fmt(n: number, digits = 1): string {
  return n.toLocaleString("ko-KR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: n < 10 && digits > 0 ? 1 : 0,
  });
}

function dateRange(task: Task): string {
  if (!task.start) return "—";
  if (!task.end || task.end === task.start) return task.start.slice(5).replace("-", "/");
  return `${task.start.slice(5).replace("-", "/")}–${task.end.slice(5).replace("-", "/")}`;
}

function progressRatioPct(task: Task): number {
  if (task.progress == null) return 0;
  if (task.progress <= 1) return task.progress * 100;
  return Math.min(task.progress, 100);
}

export function ProfileSettings({
  token,
  profile,
  onProfileChange,
}: {
  token: string;
  profile: AccessProfile;
  onProfileChange?: (profile: AccessProfile) => void;
}) {
  const [workName, setWorkName] = useState(profile.workName);
  const [names, setNames] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile.canDashboard) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/wbs", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          credentials: "include",
        });
        if (!res.ok) return;
        const body = (await res.json()) as DashboardPayload;
        if (!cancelled) setNames(assigneesOf(body.tasks));
      } catch {
        // 목록은 선택. 직접 입력 가능.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile.canDashboard, token]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workName }),
      });
      const body = (await res.json()) as { profile?: AccessProfile; error?: string };
      if (!res.ok || !body.profile) throw new Error(body.error || "저장에 실패했습니다.");
      setWorkName(body.profile.workName);
      setSaved(true);
      onProfileChange?.(body.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const known = names.includes(workName.trim());

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="kicker">Split Invest · 프로필</p>
          <h1>프로필 설정</h1>
          <p className="sub">
            내 업무는 노션 담당자 이름으로 찾습니다. 구글 계정 이름과 다를 수 있으니 노션에 보이는 이름을
            그대로 넣으세요.
          </p>
        </div>
      </header>

      <form className="form-card" onSubmit={(e) => void onSubmit(e)}>
        <p className="hint" style={{ marginTop: 0 }}>
          로그인 계정 {profile.email}
          {profile.displayName ? ` · 구글 이름 ${profile.displayName}` : ""}
        </p>
        <label>
          노션 담당자 이름
          <input
            type="text"
            list="assignee-names"
            maxLength={79}
            value={workName}
            onChange={(e) => {
              setWorkName(e.target.value);
              setSaved(false);
            }}
            placeholder="예: 임성훈"
            autoComplete="name"
          />
        </label>
        <datalist id="assignee-names">
          {names.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {workName.trim() && names.length > 0 && !known ? (
          <p className="hint">
            지금 노션 담당자 목록에 없는 이름입니다. 철자가 같은지 확인해 주세요.
          </p>
        ) : null}
        {error ? <p className="auth-error">{error}</p> : null}
        {saved ? <p className="hint">저장했습니다. 내 업무에서 이 이름으로 필터합니다.</p> : null}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "저장 중" : "저장"}
          </button>
          <Link className="chip" href="/my">
            내 업무로
          </Link>
        </div>
      </form>
    </main>
  );
}

export function MyWorkBoard({
  token,
  profile,
}: {
  token: string;
  profile: AccessProfile;
}) {
  const today = todayKst();
  const workName = profile.workName.trim();
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(workName));
  const [leafOnly, setLeafOnly] = useState(true);
  const [hideDone, setHideDone] = useState(true);
  const [service, setService] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<MyView>("list");

  const load = useCallback(async () => {
    if (!workName) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/wbs", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        credentials: "include",
      });
      const body = (await res.json()) as DashboardPayload & { error?: string };
      if (!res.ok) throw new Error(body.error || `조회 실패 (${res.status})`);
      setPayload(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "노션 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [token, workName]);

  useEffect(() => {
    void load();
  }, [load]);

  const mine = useMemo(() => {
    if (!payload || !workName) return [];
    return filterTasks(payload.tasks, {
      leafOnly,
      service,
      person: workName,
      hideDone,
      query,
      today,
    }).sort((a, b) => {
      const order = { 기한초과: 0, 진행중: 1, 예정: 2, 일정없음: 3, 완료: 4 };
      const d = order[taskStatus(a, today)] - order[taskStatus(b, today)];
      if (d !== 0) return d;
      return (a.start ?? "9999").localeCompare(b.start ?? "9999");
    });
  }, [payload, workName, leafOnly, service, hideDone, query, today]);

  const services = useMemo(() => (payload ? servicesOf(payload.tasks) : []), [payload]);
  const open = mine.filter((task) => taskStatus(task, today) !== "완료").length;
  const overdue = mine.filter((task) => taskStatus(task, today) === "기한초과").length;
  const remaining = mine.reduce((sum, task) => sum + remainingEffort(task), 0);
  const fetched = payload
    ? new Date(payload.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : "";

  if (!workName) {
    return (
      <main className="shell">
        <header className="top">
          <div>
            <p className="kicker">Split Invest · 내 업무</p>
            <h1>내 업무</h1>
            <p className="sub">노션 담당자 이름을 프로필에 저장해야 내 작업만 골라 보여 줍니다.</p>
          </div>
        </header>
        <p className="empty">
          아직 업무 이름이 없습니다.{" "}
          <Link href="/profile">프로필 설정</Link>에서 노션에 보이는 담당자 이름을 넣어 주세요.
        </p>
      </main>
    );
  }

  return (
    <main className="shell wide">
      <header className="top">
        <div>
          <p className="kicker">Split Invest · {payload?.databaseTitle ?? "WBS"}</p>
          <h1>내 업무 · {workName}</h1>
          <p className="sub">
            노션 담당자가 {workName}인 작업만 표시합니다. 목록·월력·주력으로 볼 수 있습니다.
            {fetched ? ` · ${fetched} 동기화` : ""}{" "}
            <Link href="/profile">이름 바꾸기</Link>
          </p>
        </div>
        <div className="controls">
          <div className="view-switch" role="tablist" aria-label="보기">
            <button
              className={`chip ${view === "list" ? "on" : ""}`}
              type="button"
              onClick={() => setView("list")}
            >
              목록
            </button>
            <button
              className={`chip ${view === "month" ? "on" : ""}`}
              type="button"
              onClick={() => setView("month")}
            >
              월력
            </button>
            <button
              className={`chip ${view === "week" ? "on" : ""}`}
              type="button"
              onClick={() => setView("week")}
            >
              주력
            </button>
          </div>
          <input
            placeholder="상위 작업, 작업명, 속성, 이슈 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            className={`chip ${leafOnly ? "on" : ""}`}
            type="button"
            onClick={() => setLeafOnly((v) => !v)}
          >
            하위 작업만
          </button>
          <button
            className={`chip ${hideDone ? "on" : ""}`}
            type="button"
            onClick={() => setHideDone((v) => !v)}
          >
            완료 숨김
          </button>
          <button className="btn" type="button" disabled={loading} onClick={() => void load()}>
            {loading ? "새로고침 중" : "노션 다시 읽기"}
          </button>
        </div>
      </header>

      {error ? <p className="auth-error">{error}</p> : null}

      <section className="chips" aria-label="서비스 필터">
        <button
          className={`chip ${service === null ? "on" : ""}`}
          type="button"
          onClick={() => setService(null)}
        >
          전체 서비스
        </button>
        {services.map((name) => (
          <button
            key={name}
            className={`chip ${service === name ? "on" : ""}`}
            type="button"
            onClick={() => setService(name === service ? null : name)}
          >
            {name}
          </button>
        ))}
      </section>

      <section className="kpis cols-4">
        <article className="kpi">
          <div className="label">미완료</div>
          <div className="value">{open}</div>
        </article>
        <article className={`kpi ${overdue ? "warn" : ""}`}>
          <div className="label">기한 초과</div>
          <div className="value">{overdue}</div>
        </article>
        <article className="kpi">
          <div className="label">잔여 공수 (인일)</div>
          <div className="value">{fmt(remaining)}</div>
        </article>
        <article className="kpi">
          <div className="label">주 용량</div>
          <div className="value">{WEEKLY_CAPACITY}</div>
        </article>
      </section>

      {loading && !payload ? (
        <p className="empty">노션에서 작업을 불러오는 중입니다.</p>
      ) : mine.length === 0 ? (
        <p className="empty">
          이 이름으로 연결된 작업이 없습니다. 노션 담당자 철자가{" "}
          <Link href="/profile">프로필</Link>과 같은지 확인해 주세요.
        </p>
      ) : view === "list" ? (
        <section className="panel tasks-panel">
          <h2>작업 · {mine.length}건</h2>
          <div className="table-wrap">
            <table className="tasks">
              <thead>
                <tr>
                  <th>상태</th>
                  <th>일정승인</th>
                  <th>서비스</th>
                  <th>속성</th>
                  <th>작업</th>
                  <th>일정</th>
                  <th>진척</th>
                  <th>잔여</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((task) => {
                  const status = taskStatus(task, today);
                  const approval = scheduleApprovalOf(task);
                  return (
                    <tr key={task.id}>
                      <td>
                        <span className={`badge ${status}`}>{status}</span>
                      </td>
                      <td>
                        <span className={`badge ap-${approval}`}>{approval}</span>
                      </td>
                      <td>{task.service ?? "—"}</td>
                      <td>{task.attribute ?? "—"}</td>
                      <td>
                        <TaskTitle task={task} />
                      </td>
                      <td>{dateRange(task)}</td>
                      <td>
                        {task.progress == null ? "—" : `${Math.round(progressRatioPct(task))}%`}
                      </td>
                      <td>
                        {task.effortDays == null && !task.start ? "—" : fmt(remainingEffort(task))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <WbsCalendar
          tasks={mine}
          today={today}
          mode={view}
          person={workName}
          lockPerson
        />
      )}
    </main>
  );
}
