import { CHANGELOG as GENERATED } from "./changelog.generated";

export type ChangeLogEntry = {
  title: string;
  body: string;
};

export type ChangeLogDay = {
  date: string;
  entries: ChangeLogEntry[];
};

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** 최신 날짜가 앞. `scripts/generate-changelog.mjs`가 git log로 채운다. */
export const CHANGELOG = GENERATED as ChangeLogDay[];

export function changelogDates(days: ChangeLogDay[] = CHANGELOG): string[] {
  return days.map((day) => day.date);
}

export function changelogDaysFor(
  date: string | null,
  days: ChangeLogDay[] = CHANGELOG,
): ChangeLogDay[] {
  if (!date) return days;
  return days.filter((day) => day.date === date);
}

export function formatChangelogDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}월 ${Number(day)}일 (${weekdayKo(date)})`;
}

export function changelogChipLabel(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)} (${weekdayKo(date)})`;
}

function weekdayKo(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return WEEKDAY[weekday];
}
