import type { Task } from "./types";
import { addDays, formatYmd, mondayOf, parseYmd } from "./metrics";

export const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"] as const;

export type LaneItem = {
  task: Task;
  startCol: number;
  span: number;
  lane: number;
};

export function minYmd(a: string, b: string): string {
  return a < b ? a : b;
}

export function maxYmd(a: string, b: string): string {
  return a > b ? a : b;
}

export function rangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  return startA <= endB && endA >= startB;
}

export function taskRange(task: Task): { start: string; end: string } | null {
  if (!task.start) return null;
  return { start: task.start, end: task.end ?? task.start };
}

export function taskOverlapsRange(task: Task, start: string, end: string): boolean {
  const range = taskRange(task);
  if (!range) return false;
  return rangesOverlap(range.start, range.end, start, end);
}

export function dayIndex(weekStart: string, ymd: string): number {
  const delta = Math.round(
    (parseYmd(ymd).getTime() - parseYmd(weekStart).getTime()) / 86400000,
  );
  return Math.min(6, Math.max(0, delta));
}

export function weekEndOf(weekStart: string): string {
  return formatYmd(addDays(parseYmd(weekStart), 6));
}

export function monthWeeks(year: number, month: number): string[][] {
  const first = formatYmd(new Date(year, month - 1, 1));
  let cursor = mondayOf(first);
  const last = new Date(year, month, 0);
  const weeks: string[][] = [];

  while (true) {
    const week: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      week.push(formatYmd(cursor));
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
    if (parseYmd(week[6]).getTime() >= last.getTime()) break;
    if (weeks.length >= 6) break;
  }
  return weeks;
}

export function layoutWeekLanes(tasks: Task[], weekStart: string): LaneItem[] {
  const weekEnd = weekEndOf(weekStart);
  const overlapping = tasks
    .filter((task) => taskOverlapsRange(task, weekStart, weekEnd))
    .sort((a, b) => {
      const aStart = maxYmd(a.start ?? weekStart, weekStart);
      const bStart = maxYmd(b.start ?? weekStart, weekStart);
      if (aStart !== bStart) return aStart.localeCompare(bStart);
      const aEnd = minYmd(a.end ?? a.start ?? weekEnd, weekEnd);
      const bEnd = minYmd(b.end ?? b.start ?? weekEnd, weekEnd);
      return bEnd.localeCompare(aEnd);
    });

  const laneEnds: number[] = [];
  const items: LaneItem[] = [];

  for (const task of overlapping) {
    const start = maxYmd(task.start ?? weekStart, weekStart);
    const end = minYmd(task.end ?? task.start ?? weekEnd, weekEnd);
    const startCol = dayIndex(weekStart, start);
    const endCol = dayIndex(weekStart, end);
    const span = Math.max(1, endCol - startCol + 1);
    let lane = laneEnds.findIndex((occupied) => occupied < startCol);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(endCol);
    } else {
      laneEnds[lane] = endCol;
    }
    items.push({ task, startCol, span, lane });
  }

  return items;
}

export function hiddenCountForDay(
  items: LaneItem[],
  weekStart: string,
  ymd: string,
  maxLanes: number,
): number {
  const col = dayIndex(weekStart, ymd);
  return items.filter((item) => {
    if (item.lane < maxLanes) return false;
    const endCol = item.startCol + item.span - 1;
    return col >= item.startCol && col <= endCol;
  }).length;
}

export function shiftMonth(year: number, month: number, delta: number): {
  year: number;
  month: number;
} {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function monthLabel(year: number, month: number): string {
  return `${year}년 ${month}월`;
}

export function weekLabel(weekStart: string): string {
  const end = weekEndOf(weekStart);
  const startDate = parseYmd(weekStart);
  const endDate = parseYmd(end);
  const sameMonth = startDate.getMonth() === endDate.getMonth();
  if (sameMonth) {
    return `${startDate.getFullYear()}년 ${startDate.getMonth() + 1}월 ${startDate.getDate()}일 – ${endDate.getDate()}일`;
  }
  return `${startDate.getMonth() + 1}월 ${startDate.getDate()}일 – ${endDate.getMonth() + 1}월 ${endDate.getDate()}일`;
}

export function tasksOnDay(tasks: Task[], ymd: string): Task[] {
  return tasks.filter((task) => taskOverlapsRange(task, ymd, ymd));
}

export function unscheduledTasks(tasks: Task[]): Task[] {
  return tasks.filter((task) => !task.start);
}
