import type { Task } from "@/lib/types";

export function TaskTitle({
  task,
  showIssue = true,
  issueMax = 120,
}: {
  task: Pick<Task, "title" | "url" | "ancestorTitles" | "issue">;
  showIssue?: boolean;
  issueMax?: number;
}) {
  const path = (task.ancestorTitles ?? []).filter(Boolean);
  const issue = (task.issue ?? "").trim();
  return (
    <>
      {path.length > 0 ? <div className="title-path">{path.join(" / ")}</div> : null}
      <a className="title-link" href={task.url} target="_blank" rel="noreferrer">
        {task.title}
      </a>
      {showIssue && issue ? <div className="issue">{issue.slice(0, issueMax)}</div> : null}
    </>
  );
}

export function compactTaskLabel(task: Task): string {
  const parent = (task.ancestorTitles ?? []).at(-1);
  return parent ? `${parent} / ${task.title}` : task.title;
}
