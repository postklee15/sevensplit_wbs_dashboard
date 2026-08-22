import type { PersonRow, Task, TaskStatus } from "./types";

export const WEEK_COUNT = 8;
export const WEEKLY_CAPACITY = 5;
export const UNASSIGNED = "(미지정)";

export function todayKst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

export function parseYmd(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

export function formatYmd(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function mondayOf(ymd: string): Date {
  const date = parseYmd(ymd);
  const weekday = date.getDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return addDays(date, offset);
}

export function weekStarts(today = todayKst(), count = WEEK_COUNT): string[] {
  const monday = mondayOf(today);
  return Array.from({ length: count }, (_, i) => formatYmd(addDays(monday, i * 7)));
}

export function progressRatio(task: Task): number {
  if (task.progress == null) return 0;
  if (task.progress <= 1) return task.progress;
  return Math.min(task.progress, 100) / 100;
}

/** 투입률. 없으면 1(100%). 0–1이면 비율, 그보다 크면 퍼센트. */
export function allocationRatio(task: Task): number {
  if (task.allocation == null) return 1;
  if (task.allocation <= 1) return Math.max(0, task.allocation);
  return Math.min(Math.max(0, task.allocation), 100) / 100;
}

export function remainingEffort(task: Task): number {
  const ratio = progressRatio(task);
  let effort = task.effortDays;
  if (effort == null) {
    if (!task.start) return 0;
    const start = parseYmd(task.start);
    const end = parseYmd(task.end ?? task.start);
    effort = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  }
  return Math.max(0, effort * (1 - ratio) * allocationRatio(task));
}

export function taskStatus(task: Task, today = todayKst()): TaskStatus {
  if (progressRatio(task) >= 1) return "완료";
  if (!task.start) return "일정없음";
  const end = task.end ?? task.start;
  if (end < today) return "기한초과";
  if (task.start > today) return "예정";
  return "진행중";
}

export function eachDate(start: string, end: string): string[] {
  const dates: string[] = [];
  let cursor = parseYmd(start);
  const last = parseYmd(end);
  while (cursor.getTime() <= last.getTime()) {
    dates.push(formatYmd(cursor));
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function weekIndex(ymd: string, weeks: string[]): number {
  const date = parseYmd(ymd);
  for (let i = 0; i < weeks.length; i += 1) {
    const start = parseYmd(weeks[i]);
    const end = addDays(start, 6);
    if (date.getTime() >= start.getTime() && date.getTime() <= end.getTime()) {
      return i;
    }
  }
  return -1;
}

export function filterTasks(
  tasks: Task[],
  opts: {
    leafOnly: boolean;
    service: string | null;
    person: string | null;
    hideDone: boolean;
    query: string;
    today?: string;
  },
): Task[] {
  const q = opts.query.trim().toLowerCase();
  return tasks.filter((task) => {
    if (opts.leafOnly && !task.isLeaf) return false;
    if (opts.service && task.service !== opts.service) return false;
    if (opts.hideDone && taskStatus(task, opts.today) === "완료") return false;
    if (opts.person) {
      if (opts.person === UNASSIGNED) {
        if (task.assignees.length > 0) return false;
      } else if (!task.assignees.includes(opts.person)) {
        return false;
      }
    }
    if (q) {
      const hay = `${task.title} ${task.service ?? ""} ${task.attribute ?? ""} ${task.issue}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function servicesOf(tasks: Task[]): string[] {
  const set = new Set<string>();
  for (const task of tasks) {
    if (task.service) set.add(task.service);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ko"));
}

export function buildPersonRows(
  tasks: Task[],
  today = todayKst(),
  weeks = weekStarts(today),
): PersonRow[] {
  const map = new Map<string, PersonRow>();

  const ensure = (name: string): PersonRow => {
    let row = map.get(name);
    if (!row) {
      row = {
        name,
        taskCount: 0,
        open: 0,
        done: 0,
        inProgress: 0,
        upcoming: 0,
        overdue: 0,
        noDate: 0,
        remainingDays: 0,
        weeklyLoad: Array(weeks.length).fill(0),
        unscheduledDays: 0,
      };
      map.set(name, row);
    }
    return row;
  };

  for (const task of tasks) {
    const names = task.assignees.length > 0 ? task.assignees : [UNASSIGNED];
    const share = 1 / names.length;
    const remain = remainingEffort(task) * share;
    const status = taskStatus(task, today);

    for (const name of names) {
      const row = ensure(name);
      row.taskCount += 1;
      row.remainingDays += remain;
      if (status === "완료") row.done += 1;
      else {
        row.open += 1;
        if (status === "진행중") row.inProgress += 1;
        else if (status === "예정") row.upcoming += 1;
        else if (status === "기한초과") row.overdue += 1;
        else row.noDate += 1;
      }
    }

    if (status === "완료" || remain <= 0) continue;

    if (!task.start) {
      for (const name of names) ensure(name).unscheduledDays += remain;
      continue;
    }

    const end = task.end ?? task.start;
    if (end < today) {
      for (const name of names) ensure(name).weeklyLoad[0] += remain;
      continue;
    }

    const rangeStart = task.start > today ? task.start : today;
    const days = eachDate(rangeStart, end);
    const weekdays = days.filter((d) => {
      const wd = parseYmd(d).getDay();
      return wd !== 0 && wd !== 6;
    });
    const alloc = weekdays.length > 0 ? weekdays : days;
    const perDay = remain / alloc.length;
    for (const day of alloc) {
      const idx = weekIndex(day, weeks);
      if (idx < 0) continue;
      for (const name of names) ensure(name).weeklyLoad[idx] += perDay;
    }
  }

  return [...map.values()].sort((a, b) => {
    const loadDelta = b.weeklyLoad[0] - a.weeklyLoad[0];
    if (Math.abs(loadDelta) > 0.01) return loadDelta;
    return b.remainingDays - a.remainingDays;
  });
}

export function loadBand(days: number): "idle" | "ok" | "busy" | "over" {
  if (days <= 0.05) return "idle";
  if (days < WEEKLY_CAPACITY * 0.7) return "ok";
  if (days <= WEEKLY_CAPACITY * 1.1) return "busy";
  return "over";
}

export function summary(rows: PersonRow[]) {
  const people = rows.filter((row) => row.name !== UNASSIGNED);
  return {
    people: people.length,
    open: people.reduce((sum, row) => sum + row.open, 0),
    overdue: people.reduce((sum, row) => sum + row.overdue, 0),
    remaining: people.reduce((sum, row) => sum + row.remainingDays, 0),
    thisWeekOver: people.filter((row) => loadBand(row.weeklyLoad[0]) === "over").length,
    unassignedOpen: rows.find((row) => row.name === UNASSIGNED)?.open ?? 0,
  };
}
