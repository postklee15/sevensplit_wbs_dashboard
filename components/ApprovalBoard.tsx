"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DashboardPayload, Task } from "@/lib/types";
import {
  UNASSIGNED,
  filterTasks,
  remainingEffort,
  servicesOf,
  STATUS_SORT,
  taskStatus,
  todayKst,
} from "@/lib/metrics";
import {
  SCHEDULE_APPROVALS,
  countByScheduleApproval,
  scheduleApprovalOf,
  type ScheduleApproval,
} from "@/lib/scheduleApproval";
import { TaskTitle } from "@/components/TaskTitle";
import { Pager, PageSizeSelect } from "@/components/Pager";
import { pageSlice } from "@/lib/pager";
import { useWbsDataRefresh } from "@/components/useWbsDataRefresh";

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

export function ApprovalBoard({ token }: { token: string }) {
  const today = todayKst();
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [leafOnly, setLeafOnly] = useState(true);
  const [hideDone, setHideDone] = useState(true);
  const [service, setService] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [approval, setApproval] = useState<ScheduleApproval | null>(null);
  const [pageSize, setPageSize] = useState(20);
  const [pageByKey, setPageByKey] = useState<Partial<Record<ScheduleApproval, number>>>({});

  const load = useCallback(async () => {
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
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useWbsDataRefresh(load);

  const scoped = useMemo(() => {
    if (!payload) return [];
    return filterTasks(payload.tasks, {
      leafOnly,
      service,
      person: null,
      hideDone,
      query,
      today,
    }).sort((a, b) => {
      const d = STATUS_SORT[taskStatus(a, today)] - STATUS_SORT[taskStatus(b, today)];
      if (d !== 0) return d;
      return (a.start ?? "9999").localeCompare(b.start ?? "9999");
    });
  }, [payload, leafOnly, service, hideDone, query, today]);

  const counts = useMemo(() => countByScheduleApproval(scoped), [scoped]);
  const services = useMemo(() => (payload ? servicesOf(payload.tasks) : []), [payload]);
  const groups = useMemo(
    () =>
      SCHEDULE_APPROVALS.map((key) => ({
        key,
        tasks: scoped.filter((task) => scheduleApprovalOf(task) === key),
      })).filter((group) => (approval ? group.key === approval : group.tasks.length > 0)),
    [scoped, approval],
  );

  useEffect(() => {
    setPageByKey({});
  }, [leafOnly, hideDone, service, query, approval, pageSize]);

  const fetched = payload
    ? new Date(payload.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : "";

  return (
    <main className="shell wide">
      <header className="top">
        <div>
          <p className="kicker">Split Invest · {payload?.databaseTitle ?? "WBS"}</p>
          <h1>일정 승인</h1>
          <p className="sub">
            노션 일정승인 기준으로 나눕니다. 값이 없으면 미지정입니다.
            {fetched ? ` · ${fetched} 동기화` : ""}
          </p>
        </div>
        <div className="controls">
          <input
            placeholder="상위 작업, 작업명, 업무속성, 중요도, 이슈 검색"
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

      <section className="kpis" aria-label="일정승인">
        {SCHEDULE_APPROVALS.map((key) => (
          <button
            key={key}
            type="button"
            className={`kpi tap ${approval === key ? "on" : ""} ${key === "반려" && counts[key] ? "warn" : ""}`}
            onClick={() => setApproval(approval === key ? null : key)}
          >
            <div className="label">{key}</div>
            <div className="value">{counts[key]}</div>
          </button>
        ))}
      </section>

      {approval ? (
        <p className="hint" style={{ marginTop: -12, marginBottom: 20 }}>
          <button className="chip" type="button" onClick={() => setApproval(null)}>
            {approval}만 보기 해제
          </button>
        </p>
      ) : (
        <p className="hint" style={{ marginTop: -12, marginBottom: 20 }}>
          카드를 누르면 해당 상태만 봅니다. 다시 누르면 전체입니다.
        </p>
      )}

      {!payload && loading ? <p className="empty">노션에서 작업을 불러오는 중입니다.</p> : null}

      {payload && scoped.length === 0 ? (
        <p className="empty">조건에 맞는 작업이 없습니다.</p>
      ) : null}

      {groups.map((group) => {
        const paged = pageSlice(group.tasks, pageByKey[group.key] ?? 1, pageSize);
        return (
        <section key={group.key} className="panel tasks-panel approval-panel">
          <div className="panel-head">
            <h2>
              {group.key}
              {` · ${group.tasks.length}건`}
            </h2>
            {group.tasks.length > 0 ? (
              <PageSizeSelect value={pageSize} onChange={setPageSize} />
            ) : null}
          </div>
          <div className="table-wrap">
            {group.tasks.length === 0 ? (
              <p className="empty">이 상태의 작업이 없습니다.</p>
            ) : (
              <table className="tasks">
                <thead>
                  <tr>
                    <th className="col-approval">일정승인</th>
                    <th className="col-status">상태</th>
                    <th className="col-service">서비스</th>
                    <th>업무속성</th>
                    <th>중요도</th>
                    <th>작업</th>
                    <th>담당</th>
                    <th>일정</th>
                    <th>진척</th>
                    <th>잔여</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.items.map((task) => {
                    const status = taskStatus(task, today);
                    const ap = scheduleApprovalOf(task);
                    const unassigned = task.assignees.length === 0;
                    return (
                      <tr key={task.id} className={unassigned ? "unassigned-task" : undefined}>
                        <td className="col-approval">
                          <span className={`badge ap-${ap}`}>{ap}</span>
                        </td>
                        <td className="col-status">
                          <span className={`badge ${status}`}>{status}</span>
                        </td>
                        <td className="col-service">{task.service ?? "—"}</td>
                        <td>{task.attribute ?? "—"}</td>
                        <td>{task.importance ?? "—"}</td>
                        <td>
                          <TaskTitle task={task} />
                        </td>
                        <td>
                          {unassigned ? (
                            <span className="badge 미지정">미지정</span>
                          ) : (
                            task.assignees.join(", ") || UNASSIGNED
                          )}
                        </td>
                        <td>{dateRange(task)}</td>
                        <td>
                          {task.progress == null ? "—" : `${Math.round(progressRatioPct(task))}%`}
                        </td>
                        <td>
                          {task.start ? fmt(remainingEffort(task)) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {group.tasks.length > 0 ? (
            <Pager
              page={paged.page}
              pages={paged.pages}
              total={paged.total}
              from={paged.from}
              to={paged.to}
              onPage={(page) =>
                setPageByKey((prev) => ({ ...prev, [group.key]: page }))
              }
            />
          ) : null}
        </section>
        );
      })}
    </main>
  );
}
