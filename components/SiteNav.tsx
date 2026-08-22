"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "firebase/auth";
import { signOut } from "firebase/auth";
import type { AccessProfile } from "@/lib/acl";
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
          <Link className={`chip ${pathname === "/" ? "on" : ""}`} href="/">
            부하
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
        {profile.isSuperAdmin ? <span className="badge">슈퍼관리자</span> : null}
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
