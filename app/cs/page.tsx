"use client";

import { AuthGate } from "@/components/AuthGate";
import { ProfileGate } from "@/components/ProfileGate";
import { CsBoard } from "@/components/CsBoard";

export default function CsPage() {
  return (
    <AuthGate>
      {(user) => (
        <ProfileGate user={user}>
          {({ profile, token }) =>
            profile.canDashboard ? (
              <CsBoard token={token} />
            ) : (
              <main className="auth-page">
                <p className="kicker">Sevensplit WBS</p>
                <h1>대시보드 권한이 없습니다</h1>
                <p className="sub">슈퍼 관리자에게 CS 페이지 접근을 요청하세요.</p>
              </main>
            )
          }
        </ProfileGate>
      )}
    </AuthGate>
  );
}
