"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AccessProfile } from "@/lib/acl";
import { TaskTitle } from "@/components/TaskTitle";
import { useWbsDataRefresh } from "@/components/useWbsDataRefresh";

function fmt(n: number, digits = 1): string {
  return n.toLocaleString("ko-KR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: n < 10 && digits > 0 ? 1 : 0,
  });
}

type PersonRow = {
  name: string;
  completedCount: number;
  effortDays: number;
  services: Record<string, number>;
};

type Payload = {
  fetchedAt: string;
  databaseTitle: string;
  from: string | null;
  to: string | null;
  people: PersonRow[];
  totals: { people: number; completedCount: number; effortDays: number };
  tasks: Array<{
    id: string;
    title: string;
    url: string;
    ancestorTitles: string[];
    issue: string;
    service: string | null;
    assignees: string[];
    start: string | null;
    end: string | null;
    extraDays: number | null;
    delayReason: string | null;
    effortDays: number;
  }>;
};

export function PerformanceBoard({ token }: { token: string; profile: AccessProfile }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [person, setPerson] = useState<string | null>(null);
  const [service, setService] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (person) params.set("person", person);
      if (service) params.set("service", service);
      const res = await fetch(`/api/performance?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body = (await res.json()) as Payload & { error?: string };
      if (!res.ok) throw new Error(body.error || `조회 실패 (${res.status})`);
      setPayload(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "성과 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [token, from, to, person, service]);

  useEffect(() => {
    void load();
  }, [load]);

  useWbsDataRefresh(load);

  const services = useMemo(() => {
    if (!payload) return [];
    const set = new Set<string>();
    for (const row of payload.people) {
      for (const name of Object.keys(row.services)) set.add(name);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ko"));
  }, [payload]);

  const selected = payload?.people.find((row) => row.name === person) ?? null;

  return (
    <main className="shell wide">
      <header className="top">
        <div>
          <p className="kicker">Split Invest · {payload?.databaseTitle ?? "WBS"}</p>
          <h1>인원별 성과</h1>
          <p className="sub">완료 처리된 하위 작업만 집계합니다. 공수는 일정 일수를 담당자 수로 나눕니다. 소요일은 쓰지 않습니다.</p>
        </div>
        <div className="controls">
          <label className="date-field">
            시작
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="date-field">
            종료
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button className="btn" type="button" disabled={loading} onClick={() => void load()}>
            {loading ? "불러오는 중" : "다시 집계"}
          </button>
        </div>
      </header>

      {error ? <p className="auth-error">{error}</p> : null}

      {payload ? (
        <>
          <section className="kpis">
            <article className="kpi">
              <div className="label">성과 인원</div>
              <div className="value">{payload.totals.people}</div>
            </article>
            <article className="kpi">
              <div className="label">완료 작업</div>
              <div className="value">{payload.totals.completedCount}</div>
            </article>
            <article className="kpi">
              <div className="label">완료 공수 (인일)</div>
              <div className="value">{fmt(payload.totals.effortDays)}</div>
            </article>
            <article className="kpi">
              <div className="label">기간</div>
              <div className="value" style={{ fontSize: 18 }}>
                {from || to ? `${from || "처음"} – ${to || "지금"}` : "전체"}
              </div>
            </article>
            <article className="kpi">
              <div className="label">동기화</div>
              <div className="value" style={{ fontSize: 16 }}>
                {new Date(payload.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
              </div>
            </article>
          </section>

          <section className="chips" aria-label="서비스 필터">
            <button className={`chip ${service === null ? "on" : ""}`} type="button" onClick={() => setService(null)}>
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
            {person ? (
              <button className="chip on" type="button" onClick={() => setPerson(null)}>
                {person} ×
              </button>
            ) : null}
          </section>

          <div className="load-stack">
            <div className="panel">
              <h2>담당자별 완료 성과</h2>
              <div className="table-wrap">
                <table className="tasks">
                  <thead>
                    <tr>
                      <th>담당자</th>
                      <th>완료 건</th>
                      <th>완료 공수</th>
                      <th>주력 서비스</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload.people.map((row) => {
                      const top = Object.entries(row.services).sort((a, b) => b[1] - a[1])[0];
                      return (
                        <tr key={row.name} className={person === row.name ? "selected" : ""}>
                          <td>
                            <button className="inline-person" type="button" onClick={() => setPerson(row.name)}>
                              {row.name}
                            </button>
                          </td>
                          <td>{row.completedCount}</td>
                          <td>{fmt(row.effortDays)}</td>
                          <td>{top ? `${top[0]} ${top[1]}건` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel">
              <h2>
                완료 작업 목록
                {selected ? ` · ${selected.name}` : ""}
                {` · ${payload.tasks.length}건`}
              </h2>
              <div className="table-wrap">
                {payload.tasks.length === 0 ? (
                  <p className="empty">조건에 맞는 완료 작업이 없습니다.</p>
                ) : (
                  <table className="tasks">
                    <thead>
                      <tr>
                        <th>서비스</th>
                        <th>작업</th>
                        <th>담당</th>
                        <th>일정</th>
                        <th>공수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.tasks.map((task) => (
                        <tr key={task.id}>
                          <td>{task.service ?? "—"}</td>
                          <td>
                            <TaskTitle task={task} />
                          </td>
                          <td>{task.assignees.join(", ") || "—"}</td>
                          <td>
                            {task.start ?? "—"}
                            {task.end && task.end !== task.start ? ` – ${task.end}` : ""}
                          </td>
                          <td>{fmt(task.effortDays)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </main>
  );
}
