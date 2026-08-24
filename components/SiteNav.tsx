"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "firebase/auth";
import { signOut } from "firebase/auth";
import type { AccessProfile } from "@/lib/acl";
import { ROLE_LABEL } from "@/lib/acl";
import { auth } from "@/lib/firebase";
import { clearSessionCookie } from "@/lib/sessionCookie";

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
        {profile.isSuperAdmin ? (
          <Link className={`chip ${pathname.startsWith("/admin") ? "on" : ""}`} href="/admin/access">
            권한
          </Link>
        ) : null}
      </div>
      <span className="account-chip">
        {profile.isSuperAdmin ? (
          <span className="badge">{ROLE_LABEL.superAdmin}</span>
        ) : (
          <span className="badge">{ROLE_LABEL[profile.role]}</span>
        )}
        {profile.workName ? <span className="work-name">{profile.workName}</span> : null}
        <Link className={`chip ${pathname === "/profile" ? "on" : ""}`} href="/profile">
          프로필
        </Link>
        {user.email}
        <button
          className="chip"
          type="button"
          onClick={() => {
            clearSessionCookie();
            void signOut(auth);
          }}
        >
          로그아웃
        </button>
      </span>
    </nav>
  );
}
