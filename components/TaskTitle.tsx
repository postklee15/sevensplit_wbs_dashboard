"use client";

import type { Task } from "@/lib/types";
import { useTaskDetail, type TaskView } from "@/components/TaskDetail";
import { RootBadge } from "@/components/RootBadge";
import { isRootTask } from "@/lib/taskTree";

export function TaskTitle({
  task,
  showIssue = true,
  issueMax = 120,
  grouped = false,
}: {
  task: TaskView;
  showIssue?: boolean;
  issueMax?: number;
  /** 그룹 헤더에 최상위가 있으면 경로에서 루트 제목을 뺀다. */
  grouped?: boolean;
}) {
  const { open } = useTaskDetail();
  const path = (task.ancestorTitles ?? []).filter(Boolean);
  const shownPath = grouped ? path.slice(1) : path;
  const issue = (task.issue ?? "").trim();
  const root = isRootTask({
    parentId: task.parentId ?? null,
    ancestorTitles: task.ancestorTitles ?? [],
  });
  return (
    <>
      {shownPath.length > 0 ? <div className="title-path">{shownPath.join(" / ")}</div> : null}
      <button className="title-link" type="button" onClick={() => open(task)}>
        {root ? <RootBadge /> : null}
        {task.title}
      </button>
      {showIssue && issue ? <div className="issue">{issue.slice(0, issueMax)}</div> : null}
    </>
  );
}

export function compactTaskLabel(task: Task): string {
  if (isRootTask(task)) return `최상위 / ${task.title}`;
  const parent = (task.ancestorTitles ?? []).at(-1);
  return parent ? `${parent} / ${task.title}` : task.title;
}
