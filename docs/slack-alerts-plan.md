# WBS Slack 알림

작성: 2026-08-23  
상태: **구현됨 (봇 DM).** 비밀값(봇 토큰, 멤버 ID)은 적지 않는다.  
대상: Sevensplit WBS Dashboard (`sevensplit-wbs-dashboard`)

---

## GitHub Secrets

**추가로 넣을 것 (1개):**

| Secret | 값 |
|---|---|
| `SLACK_BOT_TOKEN` | Slack 앱 Bot User OAuth Token (`xoxb-…`) |

**이미 있는 것 (다시 넣지 않음):** `NOTION_TOKEN`, `NOTION_DATABASE_ID`, `FIREBASE_SERVICE_ACCOUNT`

Slack 앱 스코프: `chat:write`, `im:write`, `users:read.email`. 워크스페이스에 앱을 설치한다. Incoming Webhook·사람별 URL은 쓰지 않는다.

---

## 동작

| # | 언제 | 누구에게 | 안내 |
|---|---|---|---|
| 1 | 리프이고 담당자가 없거나 시작·종료가 둘 다 없음 | 그 **서비스 PM** | 담당자와 일정을 넣으라는 안내 |
| 2 | `taskStatus === "기한초과"` 이고 진척 < 100% | **담당자**(프로필 `workName` 완전 일치, 전원) | 완료(진척 100%) 또는 일정승인을 「지연」으로 바꾸고 사유·새 일정 수정 |

- 프로젝트 = 노션 **서비스**(하위가 비면 상위 상속). 없으면 `서비스없음`.
- Slack 수신: 로그인 이메일로 `users.lookupByEmail`. 슈퍼관리자가 `/admin/access`에서 이메일을 넣거나 「이메일로 찾기」를 누르면 `users.slackMemberId`(`U…`)로 저장해 조회로 덮어씀. 칸이 비면 발송 때 다시 조회.
- 수신자+종류+KST 날짜당 성공 1통. Firestore `alertLogs/{kind}_{uid}_{dateKst}`, `ok: true`면 스킵.
- 앱은 노션을 쓰지 않음. 일정승인 값 **지연**은 화면에만 추가.
- 평일 00:00 UTC = 09:00 KST. GitHub Actions가 서비스 계정 액세스 토큰으로 Firestore REST + 노션 + Slack.
- 슈퍼관리자 `/admin/access`: Slack 멤버 ID, 서비스 PM, 미리보기, 지금 보내기. Hosting SSR은 그 사용자 ID 토큰으로 users를 list.

제약: `firebase-admin` 없음. 쿠키 `wbs_token`. CD `--only auth` 금지.

공유 로직: `lib/alerts.ts`. 크론: `scripts/run-alerts.ts`, `.github/workflows/alerts.yml`.
