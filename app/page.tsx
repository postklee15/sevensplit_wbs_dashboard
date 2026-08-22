"use client";

import { AuthGate } from "@/components/AuthGate";
import { ProfileGate } from "@/components/ProfileGate";
import { WbsApp } from "@/components/WbsApp";

export default function HomePage() {
  return (
    <AuthGate>
      {(user) => (
        <ProfileGate user={user}>
          {({ user: signed, profile }) =>
            profile.canDashboard ? (
              <WbsApp user={signed} />
            ) : (
              <main className="auth-page">
                <p className="kicker">Sevensplit WBS</p>
                <h1>대시보드 권한이 없습니다</h1>
                <p className="sub">슈퍼 관리자에게 부하 대시보드 접근을 요청하세요.</p>
              </main>
            )
          }
        </ProfileGate>
      )}
    </AuthGate>
  );
}
