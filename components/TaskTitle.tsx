"use client";

import type { Task } from "@/lib/types";
import { useTaskDetail, type TaskView } from "@/components/TaskDetail";

export function TaskTitle({
  task,
  showIssue = true,
  issueMax = 120,
}: {
  task: TaskView;
  showIssue?: boolean;
  issueMax?: number;
}) {
  const { open } = useTaskDetail();
  const path = (task.ancestorTitles ?? []).filter(Boolean);
  const issue = (task.issue ?? "").trim();
  return (
    <>
      {path.length > 0 ? <div className="title-path">{path.join(" / ")}</div> : null}
      <button className="title-link" type="button" onClick={() => open(task)}>
        {task.title}
      </button>
      {showIssue && issue ? <div className="issue">{issue.slice(0, issueMax)}</div> : null}
    </>
  );
}

export function compactTaskLabel(task: Task): string {
  const parent = (task.ancestorTitles ?? []).at(-1);
  return parent ? `${parent} / ${task.title}` : task.title;
}
