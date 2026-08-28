"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isUnresolvedCs, NO_CS_SERVICE, servicesOfCs, statusesOfCs, unresolvedCount } from "@/lib/cs";
import { pageSlice } from "@/lib/pager";
import type { CsItem, CsPayload } from "@/lib/types";
import { Pager, PageSizeSelect } from "@/components/Pager";

type StatusFilter = "unresolved" | "all" | string;

function fmtReceived(ymd: string | null): string {
  if (!ymd) return "—";
  return ymd.slice(5).replace("-", "/");
}

function matchesQuery(item: CsItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${item.title} ${item.service ?? ""} ${item.status ?? ""} ${item.assignees.join(" ")}`.toLowerCase();
  return hay.includes(q);
}

export function CsBoard({ token }: { token: string }) {
  const [payload, setPayload] = useState<CsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [service, setService] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("unresolved");
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cs", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        credentials: "include",
      });
      const body = (await res.json()) as CsPayload & { error?: string };
      if (!res.ok) throw new Error(body.error || `조회 실패 (${res.status})`);
      setPayload(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "노션 CS 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = payload?.items ?? [];
  const services = useMemo(() => servicesOfCs(items), [items]);
  const statuses = useMemo(() => statusesOfCs(items), [items]);
  const otherStatuses = useMemo(
    () => statuses.filter((name) => !isUnresolvedCs(name)),
    [statuses],
  );

  const unresolvedByService = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      if (!isUnresolvedCs(item.status)) continue;
      const key = item.service || NO_CS_SERVICE;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (service) {
        const name = item.service || NO_CS_SERVICE;
        if (name !== service) return false;
      }
      if (statusFilter === "unresolved") {
        if (!isUnresolvedCs(item.status)) return false;
      } else if (statusFilter !== "all") {
        if ((item.status ?? "") !== statusFilter) return false;
      }
      return matchesQuery(item, query);
    });
  }, [items, service, statusFilter, query]);

  useEffect(() => {
    setPage(1);
  }, [service, statusFilter, query, pageSize]);

  const paged = pageSlice(filtered, page, pageSize);
  const totalUnresolved = unresolvedCount(items);
  const scopedUnresolved = unresolvedCount(filtered);
  const fetched = payload
    ? new Date(payload.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : "";
  const statusOptions = payload?.schema.statusOptions ?? [];
  const canWrite = Boolean(payload?.schema.writable);

  async function saveStatus(item: CsItem, next: string) {
    if (next === (item.status ?? "")) return;
    setSavingId(item.id);
    setError(null);
    try {
      const res = await fetch(`/api/cs/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: next }),
      });
      const body = (await res.json()) as { item?: CsItem; error?: string };
      if (!res.ok || !body.item) throw new Error(body.error || "상태 저장 실패");
      setPayload((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((row) => (row.id === item.id ? body.item! : row)),
            }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "상태를 저장하지 못했습니다.");
    } finally {
      setSavingId(null);
    }
  }

  const serviceChips = useMemo(() => {
    const names = [...services];
    if (items.some((item) => !item.service) && !names.includes(NO_CS_SERVICE)) {
      names.push(NO_CS_SERVICE);
    }
    return names;
  }, [services, items]);

  return (
    <main className="shell wide">
      <header className="top">
        <div>
          <p className="kicker">Split Invest · {payload?.databaseTitle ?? "CS"}</p>
          <h1>CS</h1>
          <p className="sub">
            미해결 문의를 기본으로 봅니다. 상태는 목록에서 바로 저장됩니다.
            {fetched ? ` · ${fetched} 동기화` : ""}
          </p>
        </div>
        <div className="controls">
          <input
            placeholder="제목, 서비스, 상태, 담당 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <PageSizeSelect value={pageSize} onChange={setPageSize} />
          <button className="btn" type="button" disabled={loading} onClick={() => void load()}>
            {loading ? "새로고침 중" : "노션 다시 읽기"}
          </button>
        </div>
      </header>

      {error ? <p className="auth-error">{error}</p> : null}

      <section className="chips" aria-label="서비스 필터">
        <span className="chip-group-label">서비스</span>
        <button
          className={`chip ${service === null ? "on" : ""}`}
          type="button"
          onClick={() => setService(null)}
        >
          전체 서비스
          <span className="count">{totalUnresolved}</span>
        </button>
        {serviceChips.map((name) => (
          <button
            key={name}
            className={`chip ${service === name ? "on" : ""}`}
            type="button"
            onClick={() => setService(name === service ? null : name)}
          >
            {name}
            <span className="count">{unresolvedByService.get(name) ?? 0}</span>
          </button>
        ))}
      </section>

      <section className="chips" aria-label="상태 필터">
        <span className="chip-group-label">상태</span>
        <button
          className={`chip ${statusFilter === "unresolved" ? "on" : ""}`}
          type="button"
          onClick={() => setStatusFilter("unresolved")}
        >
          미해결
          <span className="count">{totalUnresolved}</span>
        </button>
        <button
          className={`chip ${statusFilter === "all" ? "on" : ""}`}
          type="button"
          onClick={() => setStatusFilter("all")}
        >
          전체
          <span className="count">{items.length}</span>
        </button>
        {otherStatuses.map((name) => (
          <button
            key={name}
            className={`chip ${statusFilter === name ? "on" : ""}`}
            type="button"
            onClick={() => setStatusFilter(statusFilter === name ? "unresolved" : name)}
          >
            {name}
          </button>
        ))}
      </section>

      <section className="kpis" aria-label="CS 요약">
        <article className="kpi">
          <div className="label">미해결</div>
          <div className="value">{totalUnresolved}</div>
        </article>
        <article className="kpi">
          <div className="label">{service ? `${service} 미해결` : "목록 미해결"}</div>
          <div className="value">{scopedUnresolved}</div>
        </article>
        <article className="kpi">
          <div className="label">목록 건수</div>
          <div className="value">{filtered.length}</div>
        </article>
      </section>

      {!payload && loading ? <p className="empty">노션에서 CS를 불러오는 중입니다.</p> : null}

      {payload ? (
        <section className="panel tasks-panel">
          <div className="panel-head">
            <h2>
              {statusFilter === "unresolved" ? "미해결" : statusFilter === "all" ? "전체" : statusFilter}
              {service ? ` · ${service}` : ""}
              {` · ${filtered.length}건`}
            </h2>
          </div>
          <div className="table-wrap">
            {filtered.length === 0 ? (
              <p className="empty">조건에 맞는 CS가 없습니다.</p>
            ) : (
              <table className="tasks">
                <thead>
                  <tr>
                    <th className="col-status">상태</th>
                    <th className="col-service">서비스</th>
                    <th>제목</th>
                    <th className="col-assignee">접수</th>
                    <th className="col-assignee">담당</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.items.map((item) => {
                    const open = isUnresolvedCs(item.status);
                    const options = [...statusOptions];
                    if (item.status && !options.includes(item.status)) options.unshift(item.status);
                    return (
                      <tr key={item.id} className={open ? "unassigned-task" : undefined}>
                        <td className="col-status">
                          {canWrite && options.length > 0 ? (
                            <select
                              className="cell-input cs-status-select"
                              value={item.status ?? ""}
                              disabled={savingId === item.id}
                              aria-label={`${item.title} 상태`}
                              onChange={(e) => void saveStatus(item, e.target.value)}
                            >
                              {!item.status ? <option value="">(없음)</option> : null}
                              {options.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={`badge ${open ? "미지정" : "완료"}`}>
                              {item.status || "—"}
                            </span>
                          )}
                        </td>
                        <td className="col-service">{item.service ?? "—"}</td>
                        <td>
                          {item.url ? (
                            <a className="title-link" href={item.url} target="_blank" rel="noreferrer">
                              {item.title}
                            </a>
                          ) : (
                            <span className="title-link">{item.title}</span>
                          )}
                        </td>
                        <td className="col-assignee">{fmtReceived(item.receivedAt)}</td>
                        <td className="col-assignee">{item.assignees.join(", ") || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {filtered.length > 0 ? (
            <Pager
              page={paged.page}
              pages={paged.pages}
              total={paged.total}
              from={paged.from}
              to={paged.to}
              onPage={setPage}
            />
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
