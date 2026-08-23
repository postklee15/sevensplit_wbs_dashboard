import type { PersonRow, Task, TaskStatus } from "./types";

export const WEEK_COUNT = 8;
export const WEEKLY_CAPACITY = 5;
export const DAILY_CAPACITY = 1;
export const WEEKDAY_COUNT = 5;
export const WEEKDAY_LABELS = ["월", "화", "수", "목", "금"] as const;
export const UNASSIGNED = "(미지정)";
export const NO_SERVICE = "서비스없음";
const UNASSIGNED_PREFIX = `${UNASSIGNED} · `;

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

/** 월=0 … 금=4. 주말이면 -1. */
export function weekdayIndex(ymd: string): number {
  const wd = parseYmd(ymd).getDay();
  if (wd === 0 || wd === 6) return -1;
  return wd - 1;
}

export function weekdaysOf(monday: string): string[] {
  return Array.from({ length: WEEKDAY_COUNT }, (_, i) => formatYmd(addDays(parseYmd(monday), i)));
}

function emptyDaily(weekCount: number): number[][] {
  return Array.from({ length: weekCount }, () => Array(WEEKDAY_COUNT).fill(0));
}

/** 기한 초과 잔여를 넣을 평일. 오늘이 이번 주 평일이면 오늘, 아니면 이번 주 금요일. */
export function overdueBucketDay(today: string, week0Monday: string): string {
  const todayDate = parseYmd(today);
  const monday = parseYmd(week0Monday);
  const friday = addDays(monday, 4);
  const wd = todayDate.getDay();
  if (
    wd >= 1 &&
    wd <= 5 &&
    todayDate.getTime() >= monday.getTime() &&
    todayDate.getTime() <= friday.getTime()
  ) {
    return today;
  }
  return formatYmd(friday);
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
      if (!matchesPerson(task, opts.person)) return false;
    }
    if (q) {
      const path = (task.ancestorTitles ?? []).join(" ");
      const hay = `${path} ${task.title} ${task.service ?? ""} ${task.attribute ?? ""} ${task.issue}`.toLowerCase();
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

export function assigneesOf(tasks: Task[]): string[] {
  const set = new Set<string>();
  for (const task of tasks) {
    for (const name of task.assignees) {
      const trimmed = name.trim();
      if (trimmed) set.add(trimmed);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ko"));
}

export function unassignedRowName(service: string | null): string {
  return `${UNASSIGNED} · ${service?.trim() || NO_SERVICE}`;
}

export function isUnassignedRow(name: string): boolean {
  return name === UNASSIGNED || name.startsWith(UNASSIGNED_PREFIX);
}

/** `null`이면 서비스 없는 미지정. `UNASSIGNED` 단독은 쓰지 않음. */
export function unassignedServiceOf(name: string): string | null {
  const rest = name.startsWith(UNASSIGNED_PREFIX)
    ? name.slice(UNASSIGNED_PREFIX.length)
    : NO_SERVICE;
  return rest === NO_SERVICE ? null : rest;
}

export function unassignedDisplayName(name: string): string {
  if (!isUnassignedRow(name)) return name;
  if (name === UNASSIGNED) return UNASSIGNED;
  return `미지정 · ${unassignedServiceOf(name) ?? NO_SERVICE}`;
}

export function matchesPerson(task: Task, person: string): boolean {
  if (isUnassignedRow(person)) {
    if (task.assignees.length > 0) return false;
    if (person === UNASSIGNED) return true;
    const service = unassignedServiceOf(person);
    if (service == null) return !task.service?.trim();
    return task.service === service;
  }
  return task.assignees.some((name) => name.trim() === person.trim());
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
        dailyLoad: emptyDaily(weeks.length),
        unscheduledDays: 0,
      };
      map.set(name, row);
    }
    return row;
  };

  for (const task of tasks) {
    const names = task.assignees.length > 0 ? task.assignees : [unassignedRowName(task.service)];
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
      const dump = overdueBucketDay(today, weeks[0] ?? today);
      const dumpDay = weekdayIndex(dump);
      for (const name of names) {
        const row = ensure(name);
        row.weeklyLoad[0] += remain;
        row.dailyLoad[0][dumpDay >= 0 ? dumpDay : 4] += remain;
      }
      continue;
    }

    const rangeStart = task.start > today ? task.start : today;
    const days = eachDate(rangeStart, end);
    const weekdays = days.filter((d) => weekdayIndex(d) >= 0);
    const alloc = weekdays.length > 0 ? weekdays : days;
    const perDay = remain / alloc.length;
    for (const day of alloc) {
      const idx = weekIndex(day, weeks);
      if (idx < 0) continue;
      const dayIdx = weekdayIndex(day);
      for (const name of names) {
        const row = ensure(name);
        row.weeklyLoad[idx] += perDay;
        row.dailyLoad[idx][dayIdx >= 0 ? dayIdx : 4] += perDay;
      }
    }
  }

  return [...map.values()].sort((a, b) => {
    const aU = isUnassignedRow(a.name) ? 1 : 0;
    const bU = isUnassignedRow(b.name) ? 1 : 0;
    if (aU !== bU) return aU - bU;
    if (aU) return a.name.localeCompare(b.name, "ko");
    const loadDelta = b.weeklyLoad[0] - a.weeklyLoad[0];
    if (Math.abs(loadDelta) > 0.01) return loadDelta;
    return b.remainingDays - a.remainingDays;
  });
}

export function loadBand(
  days: number,
  capacity = WEEKLY_CAPACITY,
): "idle" | "ok" | "busy" | "over" {
  if (days <= 0.05) return "idle";
  if (days < capacity * 0.7) return "ok";
  if (days <= capacity * 1.1) return "busy";
  return "over";
}

export function summary(rows: PersonRow[]) {
  const people = rows.filter((row) => !isUnassignedRow(row.name));
  const unassigned = rows.filter((row) => isUnassignedRow(row.name));
  return {
    people: people.length,
    open: people.reduce((sum, row) => sum + row.open, 0),
    overdue: people.reduce((sum, row) => sum + row.overdue, 0),
    remaining: people.reduce((sum, row) => sum + row.remainingDays, 0),
    thisWeekOver: people.filter((row) => loadBand(row.weeklyLoad[0]) === "over").length,
    unassignedOpen: unassigned.reduce((sum, row) => sum + row.open, 0),
  };
}
