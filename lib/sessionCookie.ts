"use client";

import type { User } from "firebase/auth";

const COOKIE = "wbs_token";

export async function writeSessionCookie(user: User) {
  const token = await user.getIdToken();
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `__session=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  document.cookie = `${COOKIE}=${token}; Path=/; SameSite=Lax${secure}`;
  return token;
}

export function clearSessionCookie() {
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `__session=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  document.cookie = `${COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}
