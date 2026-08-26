"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DashboardPayload, Task } from "@/lib/types";
import {
  UNASSIGNED,
  compareTasksByStatusThenStart,
  filterTasks,
  remainingEffort,
  servicesOf,
  taskStatus,
  todayKst,
  type TaskScope,
} from "@/lib/metrics";
import {
  SCHEDULE_APPROVALS,
  countByScheduleApproval,
  scheduleApprovalOf,
  type ScheduleApproval,
} from "@/lib/scheduleApproval";
import { TaskTitle } from "@/components/TaskTitle";
import { TaskScopeChips } from "@/components/TaskScopeChips";
import { TaskFamilyBody } from "@/components/TaskFamilyBody";
import { Pager, PageSizeSelect } from "@/components/Pager";
import { pageGroups } from "@/lib/pager";
import { groupTasksByRoot, treeDepthOf } from "@/lib/taskGroups";
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
  const [taskScope, setTaskScope] = useState<TaskScope>("leaf");
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
      taskScope,
      service,
      person: null,
      hideDone,
      query,
      today,
    });
  }, [payload, taskScope, service, hideDone, query, today]);

  const counts = useMemo(() => countByScheduleApproval(scoped), [scoped]);
  const services = useMemo(() => (payload ? servicesOf(payload.tasks) : []), [payload]);
  const groups = useMemo(
    () =>
      SCHEDULE_APPROVALS.map((key) => ({
        key,
        families: groupTasksByRoot(
          scoped.filter((task) => scheduleApprovalOf(task) === key),
          payload?.tasks ?? [],
          compareTasksByStatusThenStart(today),
        ),
      }))
        .map((group) => ({
          ...group,
          count: group.families.reduce((sum, family) => sum + family.tasks.length, 0),
        }))
        .filter((group) => (approval ? group.key === approval : group.count > 0)),
    [scoped, approval, payload, today],
  );

  useEffect(() => {
    setPageByKey({});
  }, [taskScope, hideDone, service, query, approval, pageSize]);

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
          <TaskScopeChips value={taskScope} onChange={setTaskScope} />
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
        const paged = pageGroups(group.families, pageByKey[group.key] ?? 1, pageSize);
        return (
        <section key={group.key} className="panel tasks-panel approval-panel">
          <div className="panel-head">
            <h2>
              {group.key}
              {` · ${group.count}건`}
            </h2>
            {group.count > 0 ? (
              <PageSizeSelect value={pageSize} onChange={setPageSize} />
            ) : null}
          </div>
          <div className="table-wrap">
            {group.count === 0 ? (
              <p className="empty">이 상태의 작업이 없습니다.</p>
            ) : (
              <table className="tasks">
                <thead>
                  <tr>
                    <th className="col-approval">일정승인</th>
                    <th className="col-status">상태</th>
                    <th className="col-service">서비스</th>
                    <th className="col-attribute">업무속성</th>
                    <th className="col-importance">중요도</th>
                    <th>작업</th>
                    <th className="col-assignee">담당</th>
                    <th>일정</th>
                    <th>진척</th>
                    <th>잔여</th>
                  </tr>
                </thead>
                <TaskFamilyBody
                  families={paged.groups}
                  colCount={10}
                  renderRow={(task, meta) => {
                    const status = taskStatus(task, today);
                    const ap = scheduleApprovalOf(task);
                    const unassigned = task.assignees.length === 0;
                    const depth = meta.inFamily && !meta.isFamilyRoot ? treeDepthOf(task) : 0;
                    const classes = [
                      unassigned ? "unassigned-task" : "",
                      meta.isFamilyRoot ? "task-family-root" : "",
                      meta.inFamily && !meta.isFamilyRoot ? "task-family-child" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <tr key={task.id} className={classes || undefined}>
                        <td className="col-approval">
                          <span className={`badge ap-${ap}`}>{ap}</span>
                        </td>
                        <td className="col-status">
                          <span className={`badge ${status}`}>{status}</span>
                        </td>
                        <td className="col-service">{task.service ?? "—"}</td>
                        <td className="col-attribute">{task.attribute ?? "—"}</td>
                        <td className="col-importance">{task.importance ?? "—"}</td>
                        <td>
                          <div
                            className="task-title-cell"
                            style={{ ["--tree-depth" as string]: depth }}
                          >
                            <TaskTitle task={task} grouped={meta.inFamily && !meta.isFamilyRoot} />
                          </div>
                        </td>
                        <td className="col-assignee">
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
                  }}
                />
              </table>
            )}
          </div>
          {group.count > 0 ? (
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
