"use client";

import { AuthGate } from "@/components/AuthGate";
import { ProfileGate } from "@/components/ProfileGate";
import { AccessAdmin } from "@/components/AccessAdmin";

export default function AccessPage() {
  return (
    <AuthGate>
      {(user) => (
        <ProfileGate user={user}>
          {({ profile, token }) =>
            profile.isSuperAdmin ? (
              <AccessAdmin token={token} me={profile} />
            ) : (
              <main className="auth-page">
                <p className="kicker">Split Invest · 권한</p>
                <h1>슈퍼관리자만 볼 수 있습니다</h1>
                <p className="sub">권한 페이지는 슈퍼관리자만 엽니다. 팀장·팀원은 부하·내 업무만 사용합니다.</p>
              </main>
            )
          }
        </ProfileGate>
      )}
    </AuthGate>
  );
}
