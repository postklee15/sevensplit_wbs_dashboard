"use client";

import { AuthGate } from "@/components/AuthGate";
import { AccessAdmin } from "@/components/AccessAdmin";
import { ProfileGate } from "@/components/ProfileGate";
import { canManageAccess } from "@/lib/acl";

export default function AccessPage() {
  return (
    <AuthGate>
      {(user) => (
        <ProfileGate user={user}>
          {({ profile, token }) =>
            canManageAccess(profile) ? (
              <AccessAdmin token={token} me={profile} />
            ) : (
              <main className="auth-page">
                <p className="kicker">Split Invest · 권한</p>
                <h1>본부장·슈퍼관리자만 볼 수 있습니다</h1>
                <p className="sub">권한·조직 페이지는 본부장과 슈퍼관리자만 엽니다. 팀장·팀원은 부하·내 업무만 사용합니다.</p>
              </main>
            )
          }
        </ProfileGate>
      )}
    </AuthGate>
  );
}
