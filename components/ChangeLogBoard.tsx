"use client";

import { useMemo, useState } from "react";
import {
  CHANGELOG,
  changelogChipLabel,
  changelogDaysFor,
  formatChangelogDate,
} from "@/lib/changelog";

export function ChangeLogBoard() {
  const [date, setDate] = useState<string | null>(null);
  const days = useMemo(() => changelogDaysFor(date), [date]);
  const totalEntries = CHANGELOG.reduce((sum, day) => sum + day.entries.length, 0);

  return (
    <main className="shell changelog-page">
      <header className="top">
        <div>
          <p className="kicker">Split Invest · WBS</p>
          <h1>변경 기록</h1>
          <p className="sub">
            대시보드에 반영된 기능을 날짜별로 모았습니다. {CHANGELOG.length}일 · {totalEntries}건.
            칩으로 하루만 고를 수 있습니다.
          </p>
        </div>
      </header>

      <section className="chips" aria-label="날짜">
        <span className="chip-group-label">날짜</span>
        <button
          className={`chip ${date === null ? "on" : ""}`}
          type="button"
          onClick={() => setDate(null)}
        >
          전체
        </button>
        {CHANGELOG.map((day) => (
          <button
            key={day.date}
            className={`chip ${date === day.date ? "on" : ""}`}
            type="button"
            onClick={() => setDate(day.date)}
          >
            {changelogChipLabel(day.date)}
          </button>
        ))}
      </section>

      {days.length === 0 ? (
        <p className="empty">이 날짜의 변경 기록이 없습니다.</p>
      ) : (
        days.map((day) => (
          <section
            key={day.date}
            className="changelog-day"
            aria-labelledby={`changelog-${day.date}`}
          >
            <h2 id={`changelog-${day.date}`}>{formatChangelogDate(day.date)}</h2>
            <ul className="changelog-list">
              {day.entries.map((entry) => (
                <li key={entry.title} className="changelog-item">
                  <h3>{entry.title}</h3>
                  <p>{entry.body}</p>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
