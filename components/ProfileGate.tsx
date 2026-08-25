"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import type { AccessProfile } from "@/lib/acl";
import { writeSessionCookie } from "@/lib/sessionCookie";
import { SiteNav } from "@/components/SiteNav";
import { TaskDetailProvider } from "@/components/TaskDetail";

export function ProfileGate({
  user,
  children,
}: {
  user: User;
  children: (ctx: {
    user: User;
    profile: AccessProfile;
    token: string;
    setProfile: (profile: AccessProfile) => void;
  }) => ReactNode;
}) {
  const [profile, setProfile] = useState<AccessProfile | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const nextToken = await writeSessionCookie(user);
        const res = await fetch("/api/me", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${nextToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ displayName: user.displayName ?? "" }),
        });
        const body = (await res.json()) as { profile?: AccessProfile; error?: string };
        if (!res.ok || !body.profile) {
          throw new Error(body.error || `권한 확인 실패 (${res.status})`);
        }
        if (!cancelled) {
          setToken(nextToken);
          setProfile(body.profile);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "권한 정보를 확인하지 못했습니다.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (error) {
    return (
      <main className="auth-page">
        <p className="kicker">Sevensplit WBS</p>
        <h1>권한을 확인하지 못했습니다</h1>
        <p className="sub">{error}</p>
      </main>
    );
  }

  if (!profile || !token) {
    return (
      <main className="auth-page">
        <p className="kicker">Sevensplit WBS</p>
        <h1>권한 확인 중</h1>
        <p className="sub">계정 권한을 불러오는 중입니다.</p>
      </main>
    );
  }

  return (
    <TaskDetailProvider profile={profile} token={token}>
      <SiteNav profile={profile} user={user} />
      {children({ user, profile, token, setProfile })}
    </TaskDetailProvider>
  );
}
