"use client";

import { useEffect, useMemo, useState } from "react";
import { Pager, PageSizeSelect } from "@/components/Pager";
import { pageSlice } from "@/lib/pager";
import type { AccessProfile } from "@/lib/acl";
import { canViewAllLoad } from "@/lib/acl";
import type { DashboardPayload, Task } from "@/lib/types";
import { WbsCalendar } from "@/components/WbsCalendar";
import { TaskTitle } from "@/components/TaskTitle";
import {
  DAILY_CAPACITY,
  NO_SERVICE,
  UNASSIGNED,
  WEEKDAY_LABELS,
  WEEKLY_CAPACITY,
  addDays,
  buildPersonRows,
  filterTasks,
  isUnassignedRow,
  loadBand,
  parseYmd,
  remainingEffort,
  servicesOf,
  summary,
  STATUS_SORT,
  taskStatus,
  todayKst,
  unassignedDisplayName,
  unassignedServiceOf,
  weekStarts,
  weekdaysOf,
} from "@/lib/metrics";

type ViewMode = "load" | "month" | "week";
type LoadWeekIndex = 0 | 1 | 2;
type HeatGrain = "week" | "day";

const LOAD_WEEK_TABS: { index: LoadWeekIndex; label: string }[] = [
  { index: 0, label: "이번주" },
  { index: 1, label: "다음주" },
  { index: 2, label: "다다음주" },
];

function fmt(n: number, digits = 1): string {
  return n.toLocaleString("ko-KR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: n < 10 && digits > 0 ? 1 : 0,
  });
}

function shortWeek(start: string): string {
  const [, m, d] = start.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function weekSpan(monday: string): string {
  const start = parseYmd(monday);
  const end = addDays(start, 4);
  return `${start.getMonth() + 1}/${start.getDate()}–${end.getMonth() + 1}/${end.getDate()}`;
}

function dateRange(task: Task): string {
  if (!task.start) return "—";
  if (!task.end || task.end === task.start) return task.start.slice(5).replace("-", "/");
  return `${task.start.slice(5).replace("-", "/")}–${task.end.slice(5).replace("-", "/")}`;
}

export function Dashboard({
  payload,
  profile,
  onRefresh,
  refreshing = false,
}: {
  payload: DashboardPayload;
  profile: AccessProfile;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const today = todayKst();
  const weeks = useMemo(() => weekStarts(today), [today]);
  const viewAll = canViewAllLoad(profile);
  const ownName = profile.workName.trim();
  const [leafOnly, setLeafOnly] = useState(true);
  const [hideDone, setHideDone] = useState(true);
  const [service, setService] = useState<string | null>(null);
  const [person, setPerson] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("load");
  const [loadWeek, setLoadWeek] = useState<LoadWeekIndex>(0);
  const [heatGrain, setHeatGrain] = useState<HeatGrain>("week");
  const [heatWeek, setHeatWeek] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [unassignedPage, setUnassignedPage] = useState(1);
  const [assignedPage, setAssignedPage] = useState(1);

  useEffect(() => {
    if (!viewAll) setPerson(ownName || null);
  }, [viewAll, ownName]);

  function pickPerson(name: string | null) {
    if (!viewAll) return;
    setPerson(name);
  }

  const scoped = useMemo(() => {
    if (!viewAll && !ownName) return [];
    return filterTasks(payload.tasks, {
      leafOnly,
      service,
      person: viewAll ? null : ownName,
      hideDone: false,
      query: "",
      today,
    });
  }, [payload.tasks, leafOnly, service, today, viewAll, ownName]);

  const rows = useMemo(() => {
    const built = buildPersonRows(scoped, today, weeks);
    if (viewAll) return built;
    return built.filter((row) => row.name === ownName);
  }, [scoped, today, weeks, viewAll, ownName]);
  const totals = useMemo(() => summary(rows), [rows]);
  const services = useMemo(() => servicesOf(payload.tasks), [payload.tasks]);

  const peopleLoad = useMemo(() => {
    return rows
      .filter((row) => !isUnassignedRow(row.name))
      .map((row) => ({ row, load: row.weeklyLoad[loadWeek] ?? 0 }))
      .sort((a, b) => {
        const delta = b.load - a.load;
        if (Math.abs(delta) > 0.01) return delta;
        return b.row.remainingDays - a.row.remainingDays;
      });
  }, [rows, loadWeek]);
  const weekOverCount = peopleLoad.filter((item) => loadBand(item.load) === "over").length;
  const heatDays = useMemo(
    () => weekdaysOf(weeks[heatWeek] ?? weeks[0] ?? today),
    [weeks, heatWeek, today],
  );
  const heatCapacity = heatGrain === "day" ? DAILY_CAPACITY : WEEKLY_CAPACITY;
  const heatWeekTabs = useMemo(
    () =>
      weeks.map((monday, i) => ({
        index: i,
        label:
          i === 0 ? "이번주" : i === 1 ? "다음주" : i === 2 ? "다다음주" : `${shortWeek(monday)}주`,
      })),
    [weeks],
  );

  const openDailyWeek = (index: number) => {
    setHeatWeek(index);
    setHeatGrain("day");
  };

  const visibleTasks = useMemo(
    () =>
      filterTasks(payload.tasks, {
        leafOnly,
        service,
        person,
        hideDone,
        query,
        today,
      }).sort((a, b) => {
        const d = STATUS_SORT[taskStatus(a, today)] - STATUS_SORT[taskStatus(b, today)];
        if (d !== 0) return d;
        return (a.start ?? "9999").localeCompare(b.start ?? "9999");
      }),
    [payload.tasks, leafOnly, service, person, hideDone, query, today],
  );
  const assignedTasks = useMemo(
    () => visibleTasks.filter((task) => task.assignees.length > 0),
    [visibleTasks],
  );
  const unassignedTasks = useMemo(
    () => visibleTasks.filter((task) => task.assignees.length === 0),
    [visibleTasks],
  );

  useEffect(() => {
    setUnassignedPage(1);
    setAssignedPage(1);
  }, [leafOnly, hideDone, service, person, query, pageSize]);

  const pagedUnassigned = useMemo(
    () => pageSlice(unassignedTasks, unassignedPage, pageSize),
    [unassignedTasks, unassignedPage, pageSize],
  );
  const pagedAssigned = useMemo(
    () => pageSlice(assignedTasks, assignedPage, pageSize),
    [assignedTasks, assignedPage, pageSize],
  );

  const fetched = new Date(payload.fetchedAt).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
  });

  return (
    <main className="shell wide">
      <header className="top">
        <div>
          <p className="kicker">Split Invest · {payload.databaseTitle}</p>
          <h1>{viewAll ? "담당자별 리소스 현황" : `내 부하 · ${ownName || "이름 없음"}`}</h1>
      <p className="sub">
            {viewAll
              ? `하위 작업 공수 기준 · 주 용량 ${WEEKLY_CAPACITY}인일 · ${today} 기준 · ${fetched} 동기화`
              : ownName
                ? `팀원은 본인 담당 작업만 봅니다. 주 용량 ${WEEKLY_CAPACITY}인일 · ${today} 기준 · ${fetched} 동기화`
                : "프로필에 노션 담당자 이름을 저장해야 내 부하를 표시합니다."}
          </p>
        </div>
        <div className="controls">
          <div className="view-switch" role="tablist" aria-label="보기">
            <button
              className={`chip ${view === "load" ? "on" : ""}`}
              type="button"
              onClick={() => setView("load")}
            >
              부하
            </button>
            <button
              className={`chip ${view === "month" ? "on" : ""}`}
              type="button"
              onClick={() => setView("month")}
            >
              월력
            </button>
            <button
              className={`chip ${view === "week" ? "on" : ""}`}
              type="button"
              onClick={() => setView("week")}
            >
              주력
            </button>
          </div>
          <input
            placeholder="상위 작업, 작업명, 업무속성, 중요도, 이슈 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            className={`chip ${leafOnly ? "on" : ""}`}
            onClick={() => setLeafOnly((v) => !v)}
            type="button"
          >
            하위 작업만
          </button>
          <button
            className={`chip ${hideDone ? "on" : ""}`}
            onClick={() => setHideDone((v) => !v)}
            type="button"
          >
            완료 숨김
          </button>
          <button
            className="btn"
            type="button"
            disabled={refreshing}
            onClick={() => onRefresh?.()}
          >
            {refreshing ? "새로고침 중" : "노션 다시 읽기"}
          </button>
        </div>
      </header>

      <section className="chips" aria-label="서비스 필터">
        <button
          className={`chip ${service === null ? "on" : ""}`}
          type="button"
          onClick={() => setService(null)}
        >
          전체 서비스
        </button>
        {services.map((name) => (
          <button
            key={name}
            className={`chip ${service === name ? "on" : ""}`}
            type="button"
            onClick={() => setService(name === service ? null : name)}
          >
            {name}
          </button>
        ))}
        {person && viewAll ? (
          <button className="chip on" type="button" onClick={() => pickPerson(null)}>
            담당자 {isUnassignedRow(person) ? unassignedDisplayName(person) : person} ×
          </button>
        ) : null}
      </section>

      <section className="kpis">
        <article className="kpi">
          <div className="label">담당자</div>
          <div className="value">{totals.people}</div>
        </article>
        <article className="kpi">
          <div className="label">미완료 작업</div>
          <div className="value">{totals.open}</div>
        </article>
        <article className={`kpi ${totals.overdue ? "warn" : ""}`}>
          <div className="label">기한 초과</div>
          <div className="value">{totals.overdue}</div>
        </article>
        <article className="kpi">
          <div className="label">잔여 공수 (인일)</div>
          <div className="value">{fmt(totals.remaining)}</div>
        </article>
        <article className={`kpi ${totals.thisWeekOver ? "warn" : ""}`}>
          <div className="label">이번 주 과부하</div>
          <div className="value">{totals.thisWeekOver}명</div>
        </article>
      </section>

      {totals.unassignedOpen > 0 && view === "load" && viewAll ? (
        <p className="hint" style={{ marginTop: -12, marginBottom: 20 }}>
          담당자가 없는 미완료 작업 {totals.unassignedOpen}건이 있습니다. 히트맵의 미지정 행을 누르면
          서비스별로 목록을 볼 수 있습니다.
        </p>
      ) : null}

      {view !== "load" ? (
        <WbsCalendar
          tasks={visibleTasks}
          today={today}
          mode={view}
          person={person}
          onSelectPerson={viewAll ? (name) => pickPerson(person === name ? null : name) : undefined}
          lockPerson={!viewAll}
        />
      ) : null}

      {view === "load" ? (
        <>
      <div className="section-head">
        <div className="section-head-lead">
          <h2>{heatGrain === "day" ? "일간 부하 히트맵" : "주간 부하 히트맵"}</h2>
          <div className="view-switch" role="tablist" aria-label="히트맵 단위">
            <button
              className={`chip ${heatGrain === "week" ? "on" : ""}`}
              type="button"
              role="tab"
              aria-selected={heatGrain === "week"}
              onClick={() => setHeatGrain("week")}
            >
              주간
            </button>
            <button
              className={`chip ${heatGrain === "day" ? "on" : ""}`}
              type="button"
              role="tab"
              aria-selected={heatGrain === "day"}
              onClick={() => setHeatGrain("day")}
            >
              일간
            </button>
          </div>
        </div>
        <div className="legend">
          <span>
            <i className="swatch" style={{ background: "#f3eee4" }} /> 여유
          </span>
          <span>
            <i className="swatch" style={{ background: "#dbe8c8" }} /> 적정
          </span>
          <span>
            <i className="swatch" style={{ background: "#f3d2a4" }} /> 빠듯
          </span>
          <span>
            <i className="swatch" style={{ background: "#f3c1b8" }} /> {heatCapacity}인일 초과
          </span>
        </div>
      </div>
      <p className="hint heat-hint">
        미완료 잔여 공수를 남은 평일에 균등 배분했습니다. 기한 초과분은 이번 주에 몰아 표시합니다.
        잔여는 일정 기간(추가 일정이 있으면 연장 종료일까지) × (1−진척) × 투입률입니다. 일정이 없으면 미정으로 보고 부하에서 제외합니다.
        소요일은 산정에 쓰지 않습니다. 투입률이 없으면 100%로 봅니다.
        {heatGrain === "week"
          ? " 주 머리글이나 칸을 누르면 그 주의 일간(월–금)을 봅니다."
          : ` ${weekSpan(weeks[heatWeek] ?? weeks[0])} 평일 배분입니다. 색은 하루 ${DAILY_CAPACITY}인일 기준입니다.`}
      </p>
      {heatGrain === "day" ? (
        <div className="chips heat-weeks" aria-label="히트맵 주">
          {heatWeekTabs.map((tab) => (
            <button
              key={tab.index}
              className={`chip ${heatWeek === tab.index ? "on" : ""}`}
              type="button"
              onClick={() => setHeatWeek(tab.index)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="heat-wrap">
        <table className="heat">
          <thead>
            <tr>
              <th className="name">담당자</th>
              {heatGrain === "week"
                ? weeks.map((week, i) => (
                    <th key={week}>
                      <button
                        type="button"
                        className="heat-week"
                        onClick={() => openDailyWeek(i)}
                        title="이 주 일간 보기"
                      >
                        {shortWeek(week)}주
                      </button>
                    </th>
                  ))
                : heatDays.map((day, i) => (
                    <th key={day} className={day === today ? "today" : undefined}>
                      {shortWeek(day)} {WEEKDAY_LABELS[i]}
                    </th>
                  ))}
              <th>잔여</th>
              <th>미일정</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.name}
                className={`${person === row.name ? "selected" : ""} ${isUnassignedRow(row.name) ? "unassigned" : ""}`.trim()}
              >
                <td className="name">
                  <button type="button" onClick={() => pickPerson(person === row.name ? null : row.name)}>
                    {heatNameLabel(row.name)}
                  </button>
                </td>
                {heatGrain === "week"
                  ? row.weeklyLoad.map((load, i) => {
                      const band = loadBand(load, WEEKLY_CAPACITY);
                      return (
                        <td key={weeks[i]}>
                          <button
                            type="button"
                            className="heat-cell-btn"
                            onClick={() => openDailyWeek(i)}
                            title="이 주 일간 보기"
                          >
                            <span className={`cell ${band}`}>{load < 0.05 ? "—" : fmt(load)}</span>
                          </button>
                        </td>
                      );
                    })
                  : (row.dailyLoad[heatWeek] ?? []).map((load, i) => {
                      const day = heatDays[i];
                      const band = loadBand(load, DAILY_CAPACITY);
                      return (
                        <td key={day} className={day === today ? "today" : undefined}>
                          <span className={`cell ${band}`}>{load < 0.05 ? "—" : fmt(load)}</span>
                        </td>
                      );
                    })}
                <td>{fmt(row.remainingDays)}</td>
                <td>{row.unscheduledDays < 0.05 ? "—" : fmt(row.unscheduledDays)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="load-stack">
        <div className="panel tasks-panel">
          <div className="panel-head">
            <h2>
              작업 목록
              {person ? ` · ${isUnassignedRow(person) ? unassignedDisplayName(person) : person}` : ""}
              {unassignedTasks.length > 0 ? ` · 미지정 ${unassignedTasks.length}` : ""}
              {assignedTasks.length > 0 ? ` · 지정 ${assignedTasks.length}` : ""}
              {visibleTasks.length === 0 ? " · 0건" : ""}
            </h2>
            {visibleTasks.length > 0 ? (
              <PageSizeSelect value={pageSize} onChange={setPageSize} />
            ) : null}
          </div>
          {person && viewAll ? (
            <p className="hint" style={{ padding: "8px 16px 0" }}>
              <button className="chip" type="button" onClick={() => pickPerson(null)}>
                담당자 필터 해제
              </button>
            </p>
          ) : null}
          {visibleTasks.length === 0 ? (
            <p className="empty">조건에 맞는 작업이 없습니다.</p>
          ) : (
            <>
              {unassignedTasks.length > 0 ? (
                <>
                  <div className="table-wrap">
                    <TaskTable
                      heading={`미지정 · ${unassignedTasks.length}건`}
                      tasks={pagedUnassigned.items}
                      today={today}
                    />
                  </div>
                  <Pager
                    page={pagedUnassigned.page}
                    pages={pagedUnassigned.pages}
                    total={pagedUnassigned.total}
                    from={pagedUnassigned.from}
                    to={pagedUnassigned.to}
                    onPage={setUnassignedPage}
                  />
                </>
              ) : null}
              {assignedTasks.length > 0 ? (
                <>
                  <div className="table-wrap">
                    <TaskTable
                      heading={`담당 지정 · ${assignedTasks.length}건`}
                      tasks={pagedAssigned.items}
                      today={today}
                    />
                  </div>
                  <Pager
                    page={pagedAssigned.page}
                    pages={pagedAssigned.pages}
                    total={pagedAssigned.total}
                    from={pagedAssigned.from}
                    to={pagedAssigned.to}
                    onPage={setAssignedPage}
                  />
                </>
              ) : null}
            </>
          )}
        </div>

        <div className="panel rank-panel">
          <div className="panel-head">
            <h2>인원별 부하 현황 · 용량 {WEEKLY_CAPACITY}인일</h2>
            <div className="view-switch" role="tablist" aria-label="주간">
              {LOAD_WEEK_TABS.map((tab) => (
                <button
                  key={tab.index}
                  className={`chip ${loadWeek === tab.index ? "on" : ""}`}
                  type="button"
                  role="tab"
                  aria-selected={loadWeek === tab.index}
                  onClick={() => setLoadWeek(tab.index)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <p className="hint" style={{ padding: "8px 16px 0" }}>
            {weekSpan(weeks[loadWeek] ?? weeks[0])} · 선택한 주에 배분된 공수 · 과부하 {weekOverCount}명
          </p>
          <div className="person-list">
            {peopleLoad.map(({ row, load }) => {
              const band = loadBand(load);
              return (
                <button
                  key={row.name}
                  type="button"
                  className={`person ${person === row.name ? "on" : ""}`}
                  onClick={() => pickPerson(person === row.name ? null : row.name)}
                >
                  <div>
                    <b>{row.name}</b>
                    <div className="meta">
                      미완료 {row.open} · 초과 {row.overdue}
                    </div>
                  </div>
                  <div className={`bar ${band}`}>
                    <i style={{ width: `${Math.min(100, (load / WEEKLY_CAPACITY) * 100)}%` }} />
                  </div>
                  <div className="num">{load < 0.05 ? "—" : fmt(load)}</div>
                </button>
              );
            })}
          </div>
        </div>
      </section>
        </>
      ) : null}
    </main>
  );
}

function progressRatioPct(task: Task): number {
  if (task.progress == null) return 0;
  if (task.progress <= 1) return task.progress * 100;
  return Math.min(task.progress, 100);
}

function TaskTable({
  heading,
  tasks,
  today,
}: {
  heading: string;
  tasks: Task[];
  today: string;
}) {
  return (
    <table className="tasks">
      <thead>
        <tr>
          <th className="col-status">상태</th>
          <th className="col-service">서비스</th>
          <th className="col-attribute">업무속성</th>
          <th className="col-importance">중요도</th>
          <th>작업</th>
          <th className="col-assignee">담당</th>
          <th>일정</th>
          <th>진척</th>
          <th>잔여</th>
        </tr>
      </thead>
      <tbody>
        <tr className="task-group">
          <th colSpan={9}>{heading}</th>
        </tr>
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} today={today} />
        ))}
      </tbody>
    </table>
  );
}

function TaskRow({ task, today }: { task: Task; today: string }) {
  const status = taskStatus(task, today);
  const unassigned = task.assignees.length === 0;
  return (
    <tr className={unassigned ? "unassigned-task" : undefined}>
      <td className="col-status">
        <span className={`badge ${status}`}>{status}</span>
      </td>
      <td className="col-service">{task.service ?? "—"}</td>
      <td className="col-attribute">{task.attribute ?? "—"}</td>
      <td className="col-importance">{task.importance ?? "—"}</td>
      <td>
        <TaskTitle task={task} />
      </td>
      <td className="col-assignee">
        {unassigned ? <span className="badge 미지정">미지정</span> : task.assignees.join(", ")}
      </td>
      <td>{dateRange(task)}</td>
      <td>{task.progress == null ? "—" : `${Math.round(progressRatioPct(task))}%`}</td>
      <td>{task.start ? fmt(remainingEffort(task)) : "—"}</td>
    </tr>
  );
}

function heatNameLabel(name: string) {
  if (!isUnassignedRow(name) || name === UNASSIGNED) return name;
  return (
    <>
      미지정
      <span className="name-sub">{unassignedServiceOf(name) ?? NO_SERVICE}</span>
    </>
  );
}
