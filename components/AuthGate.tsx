"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { TEST_LOGIN_EMAIL } from "@/lib/acl";
import { ALLOWED_EMAIL_DOMAIN, isAllowedEmail } from "@/lib/allowedEmail";
import { auth, googleProvider } from "@/lib/firebase";
import { clearSessionCookie, writeSessionCookie } from "@/lib/sessionCookie";
import {
  clearTestToken,
  makeTestUser,
  readTestToken,
  writeTestToken,
} from "@/lib/testSession";

export function AuthGate({ children }: { children: (user: User) => ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testEnabled, setTestEnabled] = useState(false);
  const [testPassword, setTestPassword] = useState("");
  const testSession = useRef(false);

  useEffect(() => {
    void fetch("/api/test-login", { cache: "no-store" })
      .then((res) => res.json())
      .then((body: { enabled?: boolean }) => setTestEnabled(Boolean(body.enabled)))
      .catch(() => setTestEnabled(false));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreTestUser(token: string): Promise<boolean> {
      const next = makeTestUser(token);
      await writeSessionCookie(next);
      const res = await fetch("/api/me", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ displayName: next.displayName ?? "" }),
      });
      if (!res.ok) return false;
      if (cancelled) return true;
      testSession.current = true;
      setUser(next);
      setReady(true);
      return true;
    }

    const saved = readTestToken();
    const unsub = onAuthStateChanged(auth, async (next) => {
      if (cancelled) return;
      if (next && !isAllowedEmail(next.email)) {
        clearSessionCookie();
        await signOut(auth);
        setUser(null);
        setError(`@${ALLOWED_EMAIL_DOMAIN} Google 계정만 사용할 수 있습니다.`);
        setReady(true);
        return;
      }
      if (next) {
        clearTestToken();
        testSession.current = false;
        await writeSessionCookie(next);
        setUser(next);
        setReady(true);
        return;
      }
      if (testSession.current) {
        setReady(true);
        return;
      }
      if (saved) {
        try {
          if (await restoreTestUser(saved)) return;
        } catch {
          // fall through
        }
        clearTestToken();
      }
      clearSessionCookie();
      setUser(null);
      setReady(true);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider());
      if (!isAllowedEmail(result.user.email)) {
        await signOut(auth);
        setError(`@${ALLOWED_EMAIL_DOMAIN} Google 계정만 사용할 수 있습니다.`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "로그인에 실패했습니다.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function signInTest(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/test-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: TEST_LOGIN_EMAIL, password: testPassword }),
      });
      const body = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !body.token) {
        throw new Error(body.error || "테스트 로그인에 실패했습니다.");
      }
      writeTestToken(body.token);
      const next = makeTestUser(body.token);
      await writeSessionCookie(next);
      testSession.current = true;
      setUser(next);
    } catch (err) {
      clearTestToken();
      const message = err instanceof Error ? err.message : "테스트 로그인에 실패했습니다.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <main className="auth-page">
        <p className="kicker">Sevensplit WBS</p>
        <h1>담당자별 리소스 현황</h1>
        <p className="sub">로그인 상태를 확인하는 중입니다.</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="auth-page">
        <p className="kicker">Sevensplit WBS</p>
        <h1>담당자별 리소스 현황</h1>
        <p className="sub">
          Google로 로그인하세요. @{ALLOWED_EMAIL_DOMAIN} 계정만 접근할 수 있습니다.
        </p>
        {error ? <p className="auth-error">{error}</p> : null}
        <button className="btn" type="button" onClick={signIn} disabled={busy}>
          {busy ? "로그인 중" : "Google 계정으로 계속"}
        </button>
        {testEnabled ? (
          <form className="form-card test-login" onSubmit={(event) => void signInTest(event)}>
            <p className="kicker">테스트 계정</p>
            <p className="hint">화면 확인용. 부하·내 업무·일정승인·성과·변경 기록을 엽니다.</p>
            <label>
              이메일
              <input type="email" value={TEST_LOGIN_EMAIL} readOnly autoComplete="username" />
            </label>
            <label>
              비밀번호
              <input
                type="password"
                value={testPassword}
                onChange={(event) => setTestPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <div className="form-actions">
              <button className="btn" type="submit" disabled={busy || !testPassword}>
                {busy ? "로그인 중" : "테스트 계정으로 계속"}
              </button>
            </div>
          </form>
        ) : null}
      </main>
    );
  }

  return <>{children(user)}</>;
}
