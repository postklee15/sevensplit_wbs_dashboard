"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "firebase/auth";
import { signOut } from "firebase/auth";
import type { AccessProfile } from "@/lib/acl";
import { canManageAccess, ROLE_LABEL } from "@/lib/acl";
import { auth } from "@/lib/firebase";
import { clearSessionCookie } from "@/lib/sessionCookie";
import { clearTestToken } from "@/lib/testSession";

export function SiteNav({
  profile,
  user,
}: {
  profile: AccessProfile;
  user: User;
}) {
  const pathname = usePathname();
  return (
    <nav className="site-nav" aria-label="페이지">
      <div className="view-switch" role="tablist">
        {profile.canDashboard ? (
          <Link className={`chip ${pathname === "/my" ? "on" : ""}`} href="/my">
            내 업무
          </Link>
        ) : null}
        {profile.canDashboard ? (
          <Link className={`chip ${pathname === "/" ? "on" : ""}`} href="/">
            부하
          </Link>
        ) : null}
        {profile.canDashboard ? (
          <Link className={`chip ${pathname === "/approval" ? "on" : ""}`} href="/approval">
            일정승인
          </Link>
        ) : null}
        {profile.canPerformance ? (
          <Link className={`chip ${pathname === "/performance" ? "on" : ""}`} href="/performance">
            성과
          </Link>
        ) : null}
        {canManageAccess(profile) ? (
          <Link className={`chip ${pathname.startsWith("/admin") ? "on" : ""}`} href="/admin/access">
            권한
          </Link>
        ) : null}
        <Link className={`chip ${pathname === "/changelog" ? "on" : ""}`} href="/changelog">
          변경 기록
        </Link>
      </div>
      <span className="account-chip">
        <span className="badge">{ROLE_LABEL[profile.role]}</span>
        {profile.workName ? <span className="work-name">{profile.workName}</span> : null}
        <Link className={`chip ${pathname === "/profile" ? "on" : ""}`} href="/profile">
          프로필
        </Link>
        {user.email}
        <button
          className="chip"
          type="button"
          onClick={() => {
            clearTestToken();
            clearSessionCookie();
            void signOut(auth).finally(() => {
              window.location.assign("/");
            });
          }}
        >
          로그아웃
        </button>
      </span>
    </nav>
  );
}
