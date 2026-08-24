"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { Dashboard } from "@/components/Dashboard";
import type { AccessProfile } from "@/lib/acl";
import type { DashboardPayload } from "@/lib/types";
import { writeSessionCookie } from "@/lib/sessionCookie";

export function WbsApp({ user, profile }: { user: User; profile: AccessProfile }) {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await writeSessionCookie(user);
      const res = await fetch("/api/wbs", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        credentials: "include",
      });
      const body = (await res.json()) as DashboardPayload & {
        error?: string;
        reason?: string;
      };
      if (!res.ok) {
        throw new Error(body.error || `조회 실패 (${res.status})`);
      }
      setPayload(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !payload) {
    return (
      <main className="shell">
        <p className="kicker">Split Invest · WBS & Gantt</p>
        <h1>담당자별 리소스 현황</h1>
        <p className="sub">노션에서 작업을 불러오는 중입니다.</p>
      </main>
    );
  }

  if (error && !payload) {
    return (
      <main className="error-page">
        <h1>노션 데이터를 불러오지 못했습니다</h1>
        <p>{error}</p>
        <button className="btn" type="button" onClick={() => void load()}>
          다시 시도
        </button>
      </main>
    );
  }

  if (!payload) return null;

  return (
    <Dashboard
      payload={payload}
      profile={profile}
      onRefresh={() => void load()}
      refreshing={loading}
    />
  );
}
