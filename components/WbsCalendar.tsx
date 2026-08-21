"use client";

import { useEffect, useMemo, useState } from "react";
import type { Task } from "@/lib/types";
import {
  UNASSIGNED,
  addDays,
  formatYmd,
  mondayOf,
  parseYmd,
  remainingEffort,
  taskStatus,
} from "@/lib/metrics";
import {
  WEEKDAYS,
  hiddenCountForDay,
  layoutWeekLanes,
  monthLabel,
  monthWeeks,
  shiftMonth,
  tasksOnDay,
  unscheduledTasks,
  weekEndOf,
  weekLabel,
} from "@/lib/calendar";

const MONTH_LANES = 3;
const WEEK_LANES = 10;

function dayNum(ymd: string): number {
  return Number(ymd.slice(8, 10));
}

function eventClass(task: Task, today: string): string {
  return `cal-event ${taskStatus(task, today)}`;
}

function eventLabel(task: Task): string {
  const project = task.service?.trim() || "—";
  const who = task.assignees.length > 0 ? task.assignees.join(", ") : UNASSIGNED;
  return `${task.title} / ${project} / ${who}`;
}

export function WbsCalendar({
  tasks,
  today,
  mode,
  person,
  onSelectPerson,
}: {
  tasks: Task[];
  today: string;
  mode: "month" | "week";
  person: string | null;
  onSelectPerson: (name: string | null) => void;
}) {
  const todayDate = parseYmd(today);
  const [cursor, setCursor] = useState({
    year: todayDate.getFullYear(),
    month: todayDate.getMonth() + 1,
  });
  const [weekStart, setWeekStart] = useState(() => formatYmd(mondayOf(today)));
  const [selectedDay, setSelectedDay] = useState<string | null>(today);

  useEffect(() => {
    if (!selectedDay) return;
    const date = parseYmd(selectedDay);
    if (mode === "week") {
      setWeekStart(formatYmd(mondayOf(selectedDay)));
    } else {
      setCursor({ year: date.getFullYear(), month: date.getMonth() + 1 });
    }
  }, [mode, selectedDay]);

  const scheduled = useMemo(() => tasks.filter((task) => task.start), [tasks]);
  const missing = useMemo(() => unscheduledTasks(tasks), [tasks]);

  const weeks = useMemo(
    () => monthWeeks(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  );

  const selectedTasks = selectedDay ? tasksOnDay(scheduled, selectedDay) : [];

  function goToday() {
    setCursor({ year: todayDate.getFullYear(), month: todayDate.getMonth() + 1 });
    setWeekStart(formatYmd(mondayOf(today)));
    setSelectedDay(today);
  }

  function gotoMonth(delta: number) {
    const next = shiftMonth(cursor.year, cursor.month, delta);
    setCursor(next);
    const prefix = `${next.year}-${String(next.month).padStart(2, "0")}`;
    if (!selectedDay?.startsWith(prefix)) {
      setSelectedDay(today.startsWith(prefix) ? today : `${prefix}-01`);
    }
  }

  function gotoWeek(delta: number) {
    const next = formatYmd(addDays(parseYmd(weekStart), delta * 7));
    setWeekStart(next);
    const end = weekEndOf(next);
    if (!selectedDay || selectedDay < next || selectedDay > end) {
      setSelectedDay(today >= next && today <= end ? today : next);
    }
  }

  return (
    <section className="calendar-block">
      <div className="section-head">
        <h2>{mode === "month" ? monthLabel(cursor.year, cursor.month) : weekLabel(weekStart)}</h2>
        <div className="cal-nav">
          <button
            className="btn"
            type="button"
            onClick={() => {
              if (mode === "month") gotoMonth(-1);
              else gotoWeek(-1);
            }}
          >
            이전
          </button>
          <button className="btn" type="button" onClick={goToday}>
            오늘
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              if (mode === "month") gotoMonth(1);
              else gotoWeek(1);
            }}
          >
            다음
          </button>
        </div>
      </div>
      <p className="hint">
        일정이 있는 WBS만 달력에 표시합니다. 막대를 누르면 노션 작업으로 이동합니다.
        {person ? ` 현재 담당자 필터: ${person}.` : ""}
      </p>

      {mode === "month" ? (
        <MonthGrid
          weeks={weeks}
          month={cursor.month}
          tasks={scheduled}
          today={today}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
        />
      ) : (
        <WeekGrid
          weekStart={weekStart}
          tasks={scheduled}
          today={today}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
        />
      )}

      <div className="cal-side">
        <div className="panel">
          <h2>
            {selectedDay
              ? `${selectedDay.slice(5).replace("-", "/")} 작업 · ${selectedTasks.length}건`
              : "날짜를 선택하세요"}
          </h2>
          <DayTaskList
            tasks={selectedTasks}
            today={today}
            onSelectPerson={onSelectPerson}
          />
        </div>
        <div className="panel">
          <h2>일정 없는 작업 · {missing.length}건</h2>
          <DayTaskList tasks={missing} today={today} onSelectPerson={onSelectPerson} />
        </div>
      </div>
    </section>
  );
}

function MonthGrid({
  weeks,
  month,
  tasks,
  today,
  selectedDay,
  onSelectDay,
}: {
  weeks: string[][];
  month: number;
  tasks: Task[];
  today: string;
  selectedDay: string | null;
  onSelectDay: (ymd: string) => void;
}) {
  return (
    <div className="cal-board">
      <div className="cal-weekdays">
        {WEEKDAYS.map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>
      {weeks.map((week) => {
        const layout = layoutWeekLanes(tasks, week[0]);
        const visible = layout.filter((item) => item.lane < MONTH_LANES);
        const laneCount = Math.max(
          1,
          ...visible.map((item) => item.lane + 1),
          0,
        );
        return (
          <div key={week[0]} className="cal-week">
            <div className="cal-daynums">
              {week.map((ymd) => {
                const inMonth = Number(ymd.slice(5, 7)) === month;
                const hidden = hiddenCountForDay(layout, week[0], ymd, MONTH_LANES);
                return (
                  <button
                    key={ymd}
                    type="button"
                    className={`cal-daynum ${ymd === today ? "today" : ""} ${
                      ymd === selectedDay ? "selected" : ""
                    } ${inMonth ? "" : "out"}`}
                    onClick={() => onSelectDay(ymd)}
                  >
                    <span>{dayNum(ymd)}</span>
                    {hidden > 0 ? <em>+{hidden}</em> : null}
                  </button>
                );
              })}
            </div>
            <div
              className="cal-lanes"
              style={{ gridTemplateRows: `repeat(${laneCount}, 22px)` }}
            >
              {visible.map((item) => (
                <a
                  key={`${item.task.id}-${item.startCol}`}
                  className={eventClass(item.task, today)}
                  href={item.task.url}
                  target="_blank"
                  rel="noreferrer"
                  title={eventLabel(item.task)}
                  style={{
                    gridColumn: `${item.startCol + 1} / span ${item.span}`,
                    gridRow: item.lane + 1,
                  }}
                >
                  {eventLabel(item.task)}
                </a>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekGrid({
  weekStart,
  tasks,
  today,
  selectedDay,
  onSelectDay,
}: {
  weekStart: string;
  tasks: Task[];
  today: string;
  selectedDay: string | null;
  onSelectDay: (ymd: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) =>
    formatYmd(addDays(parseYmd(weekStart), i)),
  );
  const layout = layoutWeekLanes(tasks, weekStart);
  const visible = layout.filter((item) => item.lane < WEEK_LANES);
  const laneCount = Math.max(3, ...visible.map((item) => item.lane + 1), 0);
  const weekEnd = weekEndOf(weekStart);

  return (
    <div className="cal-board week">
      <div className="cal-weekdays">
        {days.map((ymd, i) => {
          const hidden = hiddenCountForDay(layout, weekStart, ymd, WEEK_LANES);
          return (
          <button
            key={ymd}
            type="button"
            className={`cal-weekhead ${ymd === today ? "today" : ""} ${
              ymd === selectedDay ? "selected" : ""
            }`}
            onClick={() => onSelectDay(ymd)}
          >
            <span>{WEEKDAYS[i]}</span>
            <strong>{dayNum(ymd)}</strong>
            {hidden > 0 ? <em>+{hidden}</em> : null}
          </button>
          );
        })}
      </div>
      <div
        className="cal-lanes week-lanes"
        style={{ gridTemplateRows: `repeat(${laneCount}, 36px)` }}
      >
        {visible.map((item) => (
          <a
            key={`${item.task.id}-${item.startCol}`}
            className={eventClass(item.task, today)}
            href={item.task.url}
            target="_blank"
            rel="noreferrer"
            title={eventLabel(item.task)}
            style={{
              gridColumn: `${item.startCol + 1} / span ${item.span}`,
              gridRow: item.lane + 1,
            }}
          >
            {eventLabel(item.task)}
          </a>
        ))}
      </div>
      {layout.length === 0 ? (
        <p className="empty">{weekStart} ~ {weekEnd}에 일정이 있는 작업이 없습니다.</p>
      ) : null}
    </div>
  );
}

function DayTaskList({
  tasks,
  today,
  onSelectPerson,
}: {
  tasks: Task[];
  today: string;
  onSelectPerson: (name: string | null) => void;
}) {
  if (tasks.length === 0) {
    return <p className="empty">표시할 작업이 없습니다.</p>;
  }

  return (
    <ul className="cal-tasklist">
      {tasks.map((task) => {
        const status = taskStatus(task, today);
        const who = task.assignees.join(", ") || UNASSIGNED;
        return (
          <li key={task.id}>
            <span className={`badge ${status}`}>{status}</span>
            <div>
              <a className="title-link" href={task.url} target="_blank" rel="noreferrer">
                {task.title}
              </a>
              <div className="issue">
                <button
                  type="button"
                  className="inline-person"
                  onClick={() => onSelectPerson(task.assignees[0] ?? UNASSIGNED)}
                >
                  {who}
                </button>
                {task.service ? ` · ${task.service}` : ""}
                {task.effortDays == null && !task.start
                  ? " · 일정·소요일 미정"
                  : ` · 잔여 ${remainingEffort(task).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}인일`}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
