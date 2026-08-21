import { IBM_Plex_Sans_KR } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const plex = IBM_Plex_Sans_KR({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  title: "담당자별 리소스 현황",
  description: "Notion WBS 기준 담당자 부하 대시보드",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className={plex.className}>{children}</body>
    </html>
  );
}
