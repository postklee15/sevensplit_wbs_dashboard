"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Task } from "@/lib/types";
import { UNASSIGNED, effectiveEnd, extraScheduleDays, plannedEffortDays, remainingEffort, taskStatus, todayKst } from "@/lib/metrics";
import { scheduleApprovalOf } from "@/lib/scheduleApproval";

export type TaskView = Pick<Task, "id" | "title"> & Partial<Omit<Task, "id" | "title">>;

type TaskDetailContextValue = {
  open: (task: TaskView) => void;
  close: () => void;
};

const TaskDetailContext = createContext<TaskDetailContextValue | null>(null);

export function useTaskDetail(): TaskDetailContextValue {
  const value = useContext(TaskDetailContext);
  if (!value) {
    throw new Error("TaskDetailProvider가 필요합니다.");
  }
  return value;
}

function toTask(view: TaskView): Task {
  return {
    id: view.id,
    title: view.title,
    url: view.url ?? "",
    ancestorTitles: view.ancestorTitles ?? [],
    assignees: view.assignees ?? [],
    service: view.service ?? null,
    attribute: view.attribute ?? null,
    importance: view.importance ?? null,
    progress: view.progress ?? null,
    allocation: view.allocation ?? null,
    effortDays: view.effortDays ?? null,
    extraDays: view.extraDays ?? null,
    start: view.start ?? null,
    end: view.end ?? null,
    scheduleApproval: view.scheduleApproval ?? null,
    deployApproval: view.deployApproval ?? null,
    issue: view.issue ?? "",
    delayReason: view.delayReason ?? null,
    isLeaf: view.isLeaf ?? true,
  };
}

function hasField(view: TaskView, key: keyof Task): boolean {
  return Object.prototype.hasOwnProperty.call(view, key);
}

function fmt(n: number, digits = 1): string {
  return n.toLocaleString("ko-KR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: n < 10 && digits > 0 ? 1 : 0,
  });
}

function pct(value: number | null): string {
  if (value == null) return "—";
  const n = value <= 1 ? value * 100 : value;
  return `${Math.round(Math.min(Math.max(n, 0), 100))}%`;
}

function dateRange(task: Task): string {
  if (!task.start) return "—";
  if (!task.end || task.end === task.start) return task.start;
  return `${task.start} – ${task.end}`;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="task-detail-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function TaskDetailProvider({ children }: { children: ReactNode }) {
  const [task, setTask] = useState<TaskView | null>(null);
  const open = useCallback((next: TaskView) => setTask(next), []);
  const close = useCallback(() => setTask(null), []);
  const value = useMemo(() => ({ open, close }), [open, close]);

  useEffect(() => {
    if (!task) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [task, close]);

  return (
    <TaskDetailContext.Provider value={value}>
      {children}
      {task ? <TaskDetailPanel task={task} onClose={close} /> : null}
    </TaskDetailContext.Provider>
  );
}

function TaskDetailPanel({ task: view, onClose }: { task: TaskView; onClose: () => void }) {
  const task = toTask(view);
  const today = todayKst();
  const status = taskStatus(task, today);
  const path = task.ancestorTitles.filter(Boolean);
  const issue = task.issue.trim();
  const delayReason = (task.delayReason ?? "").trim();
  const assignees = task.assignees.length ? task.assignees.join(", ") : UNASSIGNED;
  const extra = extraScheduleDays(task);
  const extendedEnd = extra > 0 ? effectiveEnd(task) : null;
  const planned = plannedEffortDays(task);
  const showRemaining = Boolean(task.start);
  const showEffort = planned != null || hasField(view, "effortDays");
  const effortLabel =
    planned != null
      ? `${fmt(planned)}인일`
      : task.effortDays == null
        ? "—"
        : `${fmt(task.effortDays)}인일`;

  return (
    <div className="task-detail-root">
      <button className="task-detail-backdrop" type="button" aria-label="닫기" onClick={onClose} />
      <aside className="task-detail-panel" role="dialog" aria-modal="true" aria-labelledby="task-detail-title">
        <header className="task-detail-head">
          <p className="kicker">업무 상세</p>
          <div className="task-detail-actions">
            {task.url ? (
              <a
                className="chip on"
                href={task.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                노션에서 수정하기
              </a>
            ) : null}
            <button className="chip" type="button" onClick={onClose}>
              닫기
            </button>
          </div>
        </header>
        {path.length > 0 ? <p className="title-path">{path.join(" / ")}</p> : null}
        <h2 id="task-detail-title">{task.title}</h2>
        <div className="task-detail-badges">
          <span className={`badge ${status}`}>{status}</span>
          {hasField(view, "scheduleApproval") ? (
            <span className={`badge ap-${scheduleApprovalOf(task)}`}>{scheduleApprovalOf(task)}</span>
          ) : null}
        </div>
        <dl className="task-detail-grid">
          <Field label="서비스">{task.service ?? "—"}</Field>
          <Field label="속성">{task.attribute ?? "—"}</Field>
          <Field label="중요도">{task.importance ?? "—"}</Field>
          <Field label="담당">{assignees}</Field>
          <Field label="일정">{dateRange(task)}</Field>
          <Field label="추가 일정">
            {extra <= 0
              ? "—"
              : `${extra}일${extendedEnd ? ` · 연장 종료 ${extendedEnd}` : ""}`}
          </Field>
          {hasField(view, "deployApproval") ? (
            <Field label="배포승인">{task.deployApproval?.trim() || "—"}</Field>
          ) : null}
          {hasField(view, "progress") ? <Field label="진척">{pct(task.progress)}</Field> : null}
          {hasField(view, "allocation") ? <Field label="투입률">{pct(task.allocation)}</Field> : null}
          {showEffort ? <Field label="소요일">{effortLabel}</Field> : null}
          {showRemaining ? (
            <Field label="잔여">{fmt(remainingEffort(task))}인일</Field>
          ) : null}
        </dl>
        <section className="task-detail-issue">
          <h3>지연사유</h3>
          {delayReason ? <p>{delayReason}</p> : <p className="muted">적힌 내용이 없습니다.</p>}
        </section>
        <section className="task-detail-issue">
          <h3>내용 / 이슈</h3>
          {issue ? <p>{issue}</p> : <p className="muted">적힌 내용이 없습니다.</p>}
        </section>
        <p className="task-detail-note muted">
          이 화면은 읽기만 됩니다. 수정은 「노션에서 수정하기」로 해당 페이지를 엽니다.
        </p>
      </aside>
    </div>
  );
}
