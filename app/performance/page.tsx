"use client";

import { AuthGate } from "@/components/AuthGate";
import { ProfileGate } from "@/components/ProfileGate";
import { PerformanceBoard } from "@/components/PerformanceBoard";

export default function PerformancePage() {
  return (
    <AuthGate>
      {(user) => (
        <ProfileGate user={user}>
          {({ profile, token }) =>
            profile.canPerformance ? (
              <PerformanceBoard token={token} profile={profile} />
            ) : (
              <main className="auth-page">
                <p className="kicker">Split Invest · 성과</p>
                <h1>성과 페이지 권한이 없습니다</h1>
                <p className="sub">슈퍼 관리자가 이 페이지 접근을 허용해야 합니다.</p>
              </main>
            )
          }
        </ProfileGate>
      )}
    </AuthGate>
  );
}
