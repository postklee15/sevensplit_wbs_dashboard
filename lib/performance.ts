import type { Task } from "./types";
import { UNASSIGNED, parseYmd, progressRatio, taskStatus } from "./metrics";

export type PersonPerformance = {
  name: string;
  completedCount: number;
  effortDays: number;
  services: Record<string, number>;
};

export type PerformancePayload = {
  fetchedAt: string;
  databaseTitle: string;
  from: string | null;
  to: string | null;
  people: PersonPerformance[];
  totals: {
    people: number;
    completedCount: number;
    effortDays: number;
  };
  tasks: Array<{
    id: string;
    title: string;
    url: string;
    service: string | null;
    assignees: string[];
    start: string | null;
    end: string | null;
    effortDays: number;
  }>;
};

function completedEffort(task: Task): number {
  if (task.effortDays != null && Number.isFinite(task.effortDays)) {
    return Math.max(0, task.effortDays);
  }
  if (!task.start) return 0;
  const start = parseYmd(task.start);
  const end = parseYmd(task.end ?? task.start);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

function inRange(task: Task, from: string | null, to: string | null): boolean {
  const marker = task.end ?? task.start;
  if (!marker) return !from && !to;
  if (from && marker < from) return false;
  if (to && marker > to) return false;
  return true;
}

export function buildPerformance(
  tasks: Task[],
  opts: { from: string | null; to: string | null; person: string | null; service: string | null; today: string },
): Omit<PerformancePayload, "fetchedAt" | "databaseTitle"> {
  const completed = tasks.filter((task) => {
    if (!task.isLeaf) return false;
    if (taskStatus(task, opts.today) !== "완료" && progressRatio(task) < 1) return false;
    if (opts.service && task.service !== opts.service) return false;
    if (!inRange(task, opts.from, opts.to)) return false;
    if (opts.person) {
      if (opts.person === UNASSIGNED) {
        if (task.assignees.length > 0) return false;
      } else if (!task.assignees.includes(opts.person)) {
        return false;
      }
    }
    return true;
  });

  const people = new Map<string, PersonPerformance>();
  const ensure = (name: string) => {
    let row = people.get(name);
    if (!row) {
      row = { name, completedCount: 0, effortDays: 0, services: {} };
      people.set(name, row);
    }
    return row;
  };

  for (const task of completed) {
    const names = task.assignees.length > 0 ? task.assignees : [UNASSIGNED];
    const share = completedEffort(task) / names.length;
    const service = task.service ?? "(서비스 없음)";
    for (const name of names) {
      const row = ensure(name);
      row.completedCount += 1;
      row.effortDays += share;
      row.services[service] = (row.services[service] ?? 0) + 1;
    }
  }

  const rows = [...people.values()]
    .filter((row) => row.name !== UNASSIGNED)
    .sort((a, b) => b.effortDays - a.effortDays || b.completedCount - a.completedCount);

  return {
    from: opts.from,
    to: opts.to,
    people: rows,
    totals: {
      people: rows.length,
      completedCount: rows.reduce((sum, row) => sum + row.completedCount, 0),
      effortDays: rows.reduce((sum, row) => sum + row.effortDays, 0),
    },
    tasks: completed
      .map((task) => ({
        id: task.id,
        title: task.title,
        url: task.url,
        service: task.service,
        assignees: task.assignees,
        start: task.start,
        end: task.end,
        effortDays: completedEffort(task),
      }))
      .sort((a, b) => (b.end ?? b.start ?? "").localeCompare(a.end ?? a.start ?? "")),
  };
}
