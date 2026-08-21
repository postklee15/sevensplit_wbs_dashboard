"use client";

import { useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { ALLOWED_EMAIL_DOMAIN, isAllowedEmail } from "@/lib/allowedEmail";
import { auth, googleProvider } from "@/lib/firebase";
import { clearSessionCookie, writeSessionCookie } from "@/lib/sessionCookie";

export function AuthGate({ children }: { children: (user: User) => ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (next) => {
      if (next && !isAllowedEmail(next.email)) {
        clearSessionCookie();
        await signOut(auth);
        setUser(null);
        setError(`@${ALLOWED_EMAIL_DOMAIN} Google 계정만 사용할 수 있습니다.`);
      } else if (next) {
        await writeSessionCookie(next);
        setUser(next);
      } else {
        clearSessionCookie();
        setUser(null);
      }
      setReady(true);
    });
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
      </main>
    );
  }

  return <>{children(user)}</>;
}
