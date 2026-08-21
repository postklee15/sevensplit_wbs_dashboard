# Sevensplit WBS Dashboard — Agent Handover

작성일: 2026-08-21  
대상: 이 저장소를 이어받을 에이전트  
로컬 워크스페이스: `/Users/heojiyoun/notion-resource-dashboard`  
원격: https://github.com/postklee15/sevensplit_wbs_dashboard (`main`)

이 문서는 대화 맥락 없이 코드를 이어갈 수 있게 정리한 인수인계입니다. 비밀값(노션 토큰, 서비스 계정 JSON)은 절대 이 파일이나 git에 넣지 마세요.

---

## 1. 제품이 뭔가

Notion **WBS & Gantt** 데이터베이스를 읽어, `@sevensplit.com` 구성원만 볼 수 있는 담당자 부하 대시보드입니다.

화면 세 가지:

| 보기 | 역할 |
|---|---|
| 부하 | 담당자별 주간 부하 히트맵, KPI, 작업 표 |
| 월력 | 월 캘린더. 이벤트 라벨: `작업명 / 서비스 / 담당자` |
| 주력 | 주 캘린더. 같은 라벨 |

기본 필터: **하위(리프) 작업만**, 완료 숨김.

라이브: https://sevensplit-wbs-dashboard.web.app

---

## 2. 현재 상태 (2026-08-21 기준)

- 기능 코드(대시보드 + 월/주 캘린더)는 `origin/main`에 이미 있음 (`7c09640`, `0eb72e0`).
- **Google 로그인, `/api/wbs` 보호, Firebase Hosting(webframeworks) SSR, GitHub Actions CD** 는 로컬에서 구현·수동 배포까지 됐고, 이 커밋으로 `main`에 올라갑니다.
- 라이브 사이트는 수동 `firebase deploy`로 이미 올라가 있음. `main` 푸시 후 GitHub Actions가 같은 구성을 다시 배포합니다.
- 최근 막혔던 버그: 로그인 후 `/api/wbs` **401**. `firebase-admin.verifyIdToken`이 Cloud Function에서 실패. **지금은 `jose`로 ID 토큰을 직접 검증**합니다.

---

## 3. 계정·프로젝트·URL

| 항목 | 값 |
|---|---|
| GitHub | `postklee15/sevensplit_wbs_dashboard` |
| 브랜치 | `main`만 사용 |
| Firebase 프로젝트 | `sevensplit-wbs-dashboard` |
| Hosting | https://sevensplit-wbs-dashboard.web.app |
| SSR Cloud Function | `ssrsevensplitwbsdashboa` (2nd gen, `asia-northeast3`) |
| Cloud Run URL | https://ssrsevensplitwbsdashboa-kjhdtn3b5a-du.a.run.app |
| Firebase CLI 로그인에 쓰인 계정 | `proj.stockdiary@gmail.com` |
| CD 서비스 계정 | `github-wbs-cd@sevensplit-wbs-dashboard.iam.gserviceaccount.com` |
| 허용 이메일 | `*@sevensplit.com` (`lib/allowedEmail.ts`) |
| Notion DB | `37c1559b-095a-80f1-af80-e0be81606fe9` (WBS & Gantt) |

Firebase 웹 앱 설정은 `lib/firebase.ts`에 하드코딩되어 있습니다. 웹 API 키는 클라이언트에 노출되는 값입니다. 보안은 도메인 제한 + 서버 측 ID 토큰 검증에 의존합니다.

---

## 4. 로컬에서 돌리기

Node 22, `npm ci`, 저장소 루트에 `.env` (gitignored):

```
NOTION_TOKEN=<노션 인테그레이션 시크릿, ntn_ 로 시작>
NOTION_DATABASE_ID=37c1559b-095a-80f1-af80-e0be81606fe9
```

```bash
npm run dev   # next dev --turbopack
```

로컬에서도 Google 로그인이 필요합니다. Firebase Auth 승인된 도메인에 `localhost`가 있어야 합니다.

토큰은 채팅/커밋/이 문서에 다시 붙이지 마세요. 로컬 `.env`와 GitHub Secret `NOTION_TOKEN`에만 있습니다.

커밋된 `.env.sevensplit-wbs-dashboard`에는 **DATABASE_ID만** 있습니다. Firebase webframeworks가 프로젝트별 env 파일로 읽습니다. **여기에 `NOTION_TOKEN`을 넣지 마세요.**

---

## 5. 아키텍처

```
브라우저
  AuthGate (Firebase Google popup, @sevensplit.com만)
  WbsApp  →  user.getIdToken()
          →  Authorization: Bearer <ID token>
          →  cookie wbs_token (로컬 폴백)
          →  GET /api/wbs
서버 (Next.js Route Handler, Cloud Function으로 호스팅)
  requireSevensplitUser  (jose + Google JWKS)
  fetchWbsTasks          (Notion API, NOTION_TOKEN은 서버만)
  JSON { fetchedAt, databaseTitle, tasks }
클라이언트
  Dashboard / WbsCalendar  (lib/metrics.ts, lib/calendar.ts)
```

핵심 파일:

| 경로 | 역할 |
|---|---|
| `app/page.tsx` | `AuthGate` + `WbsApp` |
| `components/AuthGate.tsx` | Google 로그인 게이트 |
| `components/WbsApp.tsx` | `/api/wbs` 호출, 세션 쿠키 |
| `components/Dashboard.tsx` | 부하 뷰 + 보기 전환 |
| `components/WbsCalendar.tsx` | 월력/주력 |
| `app/api/wbs/route.ts` | 인증 후 노션 fetch |
| `lib/adminAuth.ts` | ID 토큰 검증 (`jose`, 이름은 admin이지만 firebase-admin 없음) |
| `lib/sessionCookie.ts` | `wbs_token` 쿠키. 예전 `__session`은 지움 |
| `lib/firebase.ts` | 클라이언트 Firebase 앱 |
| `lib/notion.ts` | Notion query + 속성 매핑 |
| `lib/metrics.ts` | 잔여 공수, 주간 부하, 용량 |
| `lib/calendar.ts` | 캘린더 레이아웃 |
| `lib/allowedEmail.ts` | `@sevensplit.com` |
| `firebase.json` | Hosting source `.` + webframeworks `asia-northeast3` |
| `.github/workflows/deploy.yml` | `main` 푸시 → Firebase Hosting |

스택: Next.js 15 App Router, React 19, Firebase JS SDK 12, `jose` 6. `firebase-admin`은 **제거됨**.

---

## 6. 인증 — 꼭 읽기

### 동작

1. 클라이언트: `signInWithPopup` + `hd: sevensplit.com`.
2. 이메일 도메인이 `@sevensplit.com`이 아니면 즉시 로그아웃 (클라이언트 + 서버).
3. `email_verified` 검사는 **하지 않음**. Google 회사 도메인만 본다.
4. API는 `Authorization: Bearer <Firebase ID token>`을 우선 사용.
5. 서버는 `jose` `jwtVerify` + JWKS  
   `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`  
   issuer `https://securetoken.google.com/sevensplit-wbs-dashboard`, audience 프로젝트 ID.

401 `reason` 값:

- `missing_token` — 헤더/쿠키에 토큰 없음
- `invalid_token` — JWT 검증 실패
- `forbidden_domain` — 403, 회사 메일 아님

### 왜 firebase-admin을 버렸나

Cloud Run SSR에서 `getAuth().verifyIdToken`이 반복 실패했습니다.

로그 요약:

1. `The default Firebase app does not exist` — Next 번들이 `firebase-admin`을 두 벌로 나눠 `initializeApp`과 `getAuth`가 다른 인스턴스를 봄.
2. `__session` 쿠키에 **ID 토큰**을 넣으면 Firebase Hosting/frameworks가 **세션 쿠키**로 검증함.  
   issuer가 `securetoken.google.com`인데 세션 쿠키는 `session.firebase.google.com`을 기대함.

그래서:

- 검증은 `jose`만 사용.
- 쿠키 이름은 `wbs_token`. `__session`은 로그인 시 삭제.
- 프로덕션 Hosting은 `__session` 외 쿠키를 버릴 수 있음 → **Bearer 헤더가 본 경로**.

`firebase-admin`을 다시 넣지 마세요. 넣더라도 named app + 같은 모듈에서 `getAuth(app)`를 써야 하고, 그래도 Next+webframeworks에서 깨질 수 있습니다.

### 디버깅

```bash
# 비로그인 → missing_token 이어야 함
curl -sS https://sevensplit-wbs-dashboard.web.app/api/wbs

gcloud functions logs read ssrsevensplitwbsdashboa \
  --project sevensplit-wbs-dashboard --region asia-northeast3 --limit 50
```

노션 env가 없으면 401이 아니라 500, 메시지 `"NOTION_TOKEN 또는 NOTION_DATABASE_ID가 없습니다."`

---

## 7. 노션 스키마

데이터베이스 속성 (한글 키 그대로 `lib/notion.ts`에 매핑):

| 속성 | 타입 | 앱 필드 |
|---|---|---|
| 작업명 | title | `title` |
| 담당자 | people | `assignees` |
| 서비스 | select | `service` |
| 진척도 | number (0–1 또는 0–100) | `progress` |
| 소요일 | number | `effortDays` |
| 일정 | date | `start` / `end` |
| 상위/하위 항목 | relation | `isLeaf` = 하위 항목 0건 |
| 일정승인, 배포승인 | select | 표시용 |
| 내용/이슈 | rich_text | `issue` |
| URL | url | 페이지 URL은 Notion page url 사용 |

행 수는 대략 400+. query는 page_size 100으로 페이지네이션.

---

## 8. 부하 계산 (`lib/metrics.ts`)

- **단위:** 인일 (person-day). 사람 1명이 하루 일한 양 = 1.
- **주 용량:** `WEEKLY_CAPACITY = 5` (월–금).
- **잔여 공수:** `소요일 × (1 − 진척도)`. 진척 0–1이면 그대로, 100이면 1.
- 소요일 없음 + 일정 있음: 시작~종료 **달력 일수(양끝 포함, 최소 1일)** 로 추정.
- 일정과 소요일 **둘 다 없음:** 미정 업무로 보고 부하·잔여 공수에서 제외 (0). 목록/캘린더에는 표시.
- 담당자 여러 명: 잔여를 인원수로 균등 분배.
- 주간 히트맵: 오늘~종료일의 **평일**에 균등 배분. 주말 제외. 기한 지난 잔여는 **이번 주(week 0)** 에 합산. 일정 없는 잔여는 `unscheduledDays`.
- 색 구간 `loadBand`: 여유 `< 3.5`, 바쁨 `≤ 5.5`, 과부하 `> 5.5`.

기준 날짜는 **KST** (`Asia/Seoul`).

---

## 9. 배포

### 수동 (이미 사용 중)

```bash
npx -y firebase-tools@latest experiments:enable webframeworks
npx -y firebase-tools@latest deploy --only hosting \
  --project sevensplit-wbs-dashboard --non-interactive --force
```

webframeworks는 Next를 Cloud Function으로 감쌉니다. 정적 호스팅만으로는 `/api/wbs`가 동작하지 않습니다.

배포 시 로컬 `.env` / `.env.sevensplit-wbs-dashboard`가 함수 env로 들어갑니다. Cloud Run 서비스 `ssrsevensplitwbsdashboa`에도 `NOTION_TOKEN`, `NOTION_DATABASE_ID`가 설정되어 있습니다.

### GitHub Actions

`.github/workflows/deploy.yml`

- 트리거: `push` to `main`
- `npm ci` 후 `.env.sevensplit-wbs-dashboard`에 시크릿으로 토큰+DB ID 기록
- `google-github-actions/auth@v2` + `FIREBASE_SERVICE_ACCOUNT`
- `firebase deploy --only hosting` (SSR Function은 Hosting에 묶여 같이 올라감)
- **`auth`는 CD에서 빼 둠.** Google 로그인은 이미 프로비저닝됨. CD 서비스 계정은 `serviceusage.services.enable`이 없어 `--only auth`가 실패함.
- **`FIREBASE_TOKEN`은 쓰지 않음.** `firebase login:ci` 불필요.

이미 있는 GitHub Secrets:

- `FIREBASE_SERVICE_ACCOUNT`
- `NOTION_TOKEN`
- `NOTION_DATABASE_ID`

첫 CD가 이 handover 커밋의 푸시입니다. Actions 탭에서 실패하면 서비스 계정 IAM(Hosting Admin, Functions Admin, Service Account User, Cloud Run 등)과 Secret 값을 먼저 보세요.

---

## 10. 알려진 이슈 / 남은 일

1. **`/favicon.ico` 404** — 아이콘 없음. API와 무관.
2. **Next config 경고** — Cloud Function 로그에 `Unrecognized key(s): '__esModule', 'default'`. firebase-frameworks가 `next.config.ts`를 감싸면서 생김. 앱 동작에는 보통 지장 없음.
3. **CD가 이 커밋 전까지는 한 번도 `main`에서 안 돌아갔을 수 있음.** 푸시 후 workflow 성공 여부를 확인하세요.
4. Hosting webframeworks는 **실험 기능**. `firebase-functions` peer / `firebase-admin` 버전 충돌이 났었음. admin을 다시 추가하면 frameworks 패키징이 깨질 수 있음.
5. 캘린더/부하 필터는 클라이언트만. 노션 원본은 서버가 통째로 가져옴.
6. 용량 5인일·평일만 배분·주말 제외는 제품 가정입니다. 바꾸려면 `WEEKLY_CAPACITY`와 `buildPersonRows`를 보면 됩니다.

---

## 11. 하지 말 것

- `NOTION_TOKEN`을 git, 채팅, `docs/`, 커밋된 `.env.sevensplit-wbs-dashboard`에 넣지 말 것.
- `/api/wbs`를 인증 없이 열지 말 것.
- 쿠키 이름을 다시 `__session`으로 되돌리지 말 것 (ID 토큰 ≠ Firebase session cookie).
- `firebase-admin`으로 검증을 되돌리지 말 것 (Cloud Function에서 이미 실패).
- `main` force push, `--no-verify` 커밋 금지 (사용자 규칙).
- 배포 시 `--force`는 webframeworks가 요구해서 수동 배포에 썼음. CD workflow에도 `--force`가 있음.

---

## 12. 다음 에이전트에게 추천하는 첫 작업

1. GitHub Actions `Deploy` 워크플로가 이 푸시에서 초록인지 확인.
2. 라이브에서 `@sevensplit.com` 로그인 → 대시보드 데이터 로드 확인.
3. 필요하면 favicon, next.config 경고, 부하 가정(주 5인일) 조정을 이어가면 됨.

로그 확인:

```bash
gcloud functions logs read ssrsevensplitwbsdashboa \
  --project sevensplit-wbs-dashboard --region asia-northeast3 --limit 80
```
