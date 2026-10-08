# Coffee Note 설계

작성일: 2026-10-08 (개정: 프론트를 React → EJS + Bootstrap 5로 변경)

## 목적

나의 커피생활(구매한 원두의 커핑노트, 카페에서 마신 커피 후기)을 기록하고 PC·모바일 어디서나 카드 형태로 빠르게 검색·정렬해 보는 개인 웹사이트.

- 보기: 누구나 (읽기 전용)
- 작성·수정·삭제: 관리자 비밀번호로 로그인한 관리자만

## 아키텍처

단일 Node.js 패키지. Express 5 + TypeScript가 EJS 템플릿으로 HTML을 렌더링한다. 별도 프론트 빌드 없음.

```
coffee-note/
  src/          서버 (Express, TypeScript)
  views/        EJS 템플릿 (공개 화면, 관리자 화면, 파셜)
  public/       정적 파일 (css, 브라우저용 ES 모듈 JS)
  migrations/   SQL 마이그레이션
  test/         Vitest 테스트
```

- UI: Bootstrap 5.3 + Bootstrap Icons + Pretendard 폰트. npm으로 설치해 `/vendor/*`로 서빙(CDN 의존 없음). 커피 톤 색상은 Bootstrap CSS 변수를 덮어써서 적용, 라이트/다크 모드는 시스템 설정을 따름.
- 브라우저 JS: 빌드 없는 ES 모듈(`public/js/*.js`, `// @ts-check` + JSDoc). 검색·필터·정렬 로직은 순수 함수 모듈로 분리해 테스트.
- 정적 자원 캐시 무효화: 서버 시작 시각을 `?v=` 쿼리로 붙임.

### 환경변수 (`.env`, git 제외, `.env.example` 제공)

| 변수 | 설명 |
|---|---|
| `DATABASE_URL` | PostgreSQL 접속 문자열 (DB `coffee_note`) |
| `TEST_DATABASE_URL` | 통합 테스트용 DB. 같은 DB여도 됨(테스트는 `coffee_note_test` 스키마만 사용). 없으면 DB 테스트 skip |
| `ADMIN_PASSWORD` | 관리자 로그인 비밀번호 (8자 이상) |
| `SESSION_SECRET` | 관리자 쿠키 서명 키 (32자 이상) |
| `UPLOAD_DIR` | 사진 저장 경로 (기본 `./uploads`) |
| `PORT` | 서버 포트 (기본 4000) |
| `COOKIE_SECURE` | HTTPS 서비스 시 `true` (기본 `false`) |

## 데이터 모델

필드 정의(`src/fields.ts`)가 단일 기준이다. 폼 렌더링, 입력 검증(zod), DB 컬럼(camelCase → snake_case), 상세 화면 표시가 모두 이 정의에서 파생된다.

### `beans` — 원두 커핑노트

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | serial PK | |
| name | text NOT NULL | 원두명 (카드 제목) |
| shop | text NOT NULL | 판매처/로스터리 (카드 부제목) |
| summary | text | 간략 메모 (카드 노출) |
| url | text | 상품 URL (http/https만) |
| country, region, variety, process, roast_level | text | 산지 국가·지역, 품종, 가공, 로스팅 포인트 |
| is_decaf | boolean NOT NULL default false | 디카페인 |
| purchased_at | date | 구매일 |
| price | integer | 가격(원) |
| weight_g | integer | 용량(g) |
| brew_method | text | 추출방식 |
| roasted_at | date | 로스팅일 |
| best_from | date | 최적 시음 시작일 |
| acidity, sweetness, body, aftertaste | smallint | 각 1~10 |
| total_score | smallint | 네 점수 합. 서버 계산, 하나라도 없으면 null |
| flavor_tags | text[] NOT NULL default '{}' | 향미 노트 태그 |
| memo | text | 상세 메모 |
| created_at, updated_at | timestamptz | |

### `cafe_visits` — 카페 후기

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | serial PK | |
| menu | text NOT NULL | 마신 원두/메뉴명 (카드 제목) |
| cafe_name | text NOT NULL | 카페명 (카드 부제목) |
| visited_at | date | 방문일 |
| rating | smallint | 별점 1~5 |
| price | integer | 가격(원) |
| brew_method | text | 추출방식 |
| country, variety, process | text | 원두 정보 |
| is_decaf | boolean NOT NULL default false | |
| flavor_tags | text[] NOT NULL default '{}' | |
| address | text | 주소 |
| map_url | text | 지도 URL (http/https만) |
| mood_memo | text | 분위기 메모 |
| memo | text | 후기 |
| created_at, updated_at | timestamptz | |

### `photos`

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | serial PK | |
| bean_id | int FK → beans ON DELETE CASCADE | nullable |
| cafe_visit_id | int FK → cafe_visits ON DELETE CASCADE | nullable |
| file_name, thumb_name | text NOT NULL | 본 이미지 / 썸네일 파일명 |
| sort_order | int NOT NULL default 0 | 업로드 순서 |
| is_thumbnail | boolean NOT NULL default false | 대표 썸네일 |
| created_at | timestamptz | |

- CHECK: `bean_id`와 `cafe_visit_id` 중 정확히 하나만 not null.
- 부분 유니크 인덱스: 글 하나당 `is_thumbnail = true`는 최대 1장.
- 썸네일 지정이 없으면 `sort_order`가 가장 앞선 사진을 카드 썸네일로 사용.
- 글·사진 삭제 시 디스크 파일도 함께 삭제.

### 마이그레이션

`migrations/NNN_name.sql`을 번호 순으로 트랜잭션 안에서 실행하고 `schema_migrations`에 이력 기록 (`pnpm migrate`).

## 화면과 라우트

JSON API는 두지 않는다. 공개 화면은 서버 렌더링 + 브라우저 필터링, 관리자 화면은 일반 HTML 폼 POST(Post/Redirect/Get).

### 공개

| 라우트 | 내용 |
|---|---|
| `GET /` | 홈: 탭 + 툴바 + 카드 그리드 |
| `GET /beans/:id`, `GET /cafe-visits/:id` | 상세 페이지. `?fragment=1`이면 모달에 넣을 본문 조각만 |
| `GET /healthz` | `{ ok: true }` |
| `/uploads/*` | 사진 (UUID 파일명, 1년 immutable 캐시) |

**홈 화면**

- 탭: 원두 노트 | 카페 후기 (개수 배지).
- 툴바(스크롤 시 상단 고정):
  - 검색창: 입력 즉시 필터링
  - 범위는 탭(원두 노트 / 카페 후기)으로만 전환한다. 검색 범위 셀렉트는 두지 않는다. 범위가 바뀌면 가게 필터는 초기화. (검색 로직 `scope: 'all'`은 남아 있지만 UI에서는 도달할 수 없다.)
  - 정렬 셀렉트:
    - 최신순 / 오래된순 — 원두 `purchased_at`, 카페 `visited_at` (없으면 `created_at`)
    - 점수 높은순 — 원두 `total_score / 40`, 카페 `rating / 5` (섞어 볼 때도 비교 가능하도록 비율)
    - 이름순(가나다), 가격 낮은순 / 높은순, 원두 국가순
    - 최신 로스팅순 — 원두 탭에서만 선택 가능. 카페 탭으로 바뀌면 최신순으로 되돌림
    - 값이 없는 항목은 항상 뒤로
  - 가게 셀렉트: 현재 범위의 로스터리/카페명 고유값(가나다순)
  - 원두 필터(원두 탭에서만 표시, 여러 조건을 AND로 조합): 국가·가공·로스팅 포인트·품종·추출 방식·향미 태그 6종. 선택지는 현재 기록에 있는 고유값(가나다순)이고, 적용 중인 조건 수를 배지로 보여주며 "초기화" 버튼으로 한 번에 해제한다. 카페 탭에서는 필터 값이 유지되지만 적용되지 않는다.
  - 디카페인 스위치: 켜면 디카페인만
- 검색 방식:
  - 서버가 모든 카드를 HTML로 렌더링하고, 카드별 검색 인덱스(제목·가게·날짜·점수·가격·국가·로스팅일·디카페인·`searchText`)를 `<script type="application/json">`으로 함께 내려준다.
  - `searchText`는 서버에서 텍스트·태그 필드를 이어 붙여 정규화(NFC, 소문자, 공백 정리)한 문자열. 디카페인이면 "디카페인 decaf"를 포함.
  - 브라우저는 검색어를 공백으로 나눈 모든 토큰이 `searchText`에 포함되는지(AND) 검사하고, 결과에 맞춰 기존 카드 요소를 숨김/표시하고 순서를 재배치한다. 서버 요청 없음.
- 카드 레이아웃: Bootstrap 그리드 `row-cols-1 / sm-2 / lg-3 / xl-4 / xxl-5`로 화면 폭에 따라 한 줄 카드 수가 바뀜. 썸네일 4:3 고정(`ratio-4x3`, `object-fit-cover`, 사진 없으면 아이콘), 제목·간략 메모 2줄 제한, 태그 1줄 제한으로 카드 높이를 맞춤.
  - 원두 카드: 썸네일, 원두명, 판매처, 국가·가공·로스팅 포인트, 간략 메모, 향미 태그(최대 4개), 총점, 디카페인 배지, "시음 적기" 배지(최적 시음 시작일 ≤ 오늘)
  - 카페 카드: 썸네일, 메뉴명, 카페명, 방문일·추출방식, 향미 태그, 별점, 디카페인 배지
- 카드 클릭 → Bootstrap 모달(모바일은 전체 화면)에 상세 조각을 불러와 표시. 새 탭으로 열면 상세 페이지가 그대로 동작.
- 상세: 사진 캐러셀(스와이프 지원), 필드 목록, 메모, 외부 링크(상품 페이지, 지도), 관리자 로그인 상태면 "수정" 버튼.
- 결과 없음 안내, 결과 개수 표시.

### 관리자 (`/admin`)

| 라우트 | 내용 |
|---|---|
| `GET/POST /admin/login` | 비밀번호 로그인. 같은 IP에서 10회 연속 실패하면 10분간 `/admin` 전체가 429(`Retry-After`)로 차단된다 |
| `POST /admin/logout` | 로그아웃 |
| `GET /admin/beans`, `/admin/cafe-visits` | 목록 (썸네일·제목·가게·날짜, 즉시 검색) + 새로 작성 |
| `GET /admin/:종류/new`, `POST /admin/:종류` | 작성 |
| `GET /admin/:종류/:id/edit`, `POST /admin/:종류/:id` | 수정 |
| `POST /admin/:종류/:id/delete` | 삭제 (확인 창) |
| `POST /admin/:종류/:id/photos` | 사진 업로드 (multipart, 여러 장) |
| `POST /admin/photos/:id/thumbnail` | 썸네일 지정 |
| `POST /admin/photos/:id/delete` | 사진 삭제 |

- 미로그인 상태로 관리자 경로 접근 시 로그인 화면으로 리다이렉트.
- 작성/수정 폼: 필드 정의의 섹션별 카드로 구성. 향미 태그는 쉼표 구분 입력. 커핑 점수 4개를 고르면 총점 미리보기. 검증 실패 시 입력값을 유지한 채 필드별 오류 표시(400). 저장 성공 시 수정 화면으로 리다이렉트하고 "저장했습니다" 표시.
- 사진: 새 글은 저장 후 업로드 가능. 업로드한 사진 목록에서 썸네일 지정·삭제.
- 관리자 페이지는 `Cache-Control: no-store`.

### 인증·보안

- 로그인 성공 시 만료 시각을 값으로 하는 서명 쿠키(httpOnly, SameSite=Lax, 30일) 발급. 비밀번호 비교는 SHA-256 다이제스트의 timing-safe 비교.
- 관리자 POST는 `Origin` 헤더가 있으면 프로토콜·호스트·포트 일치를 확인(SameSite에 더한 CSRF 방어). 프록시 뒤에서는 `X-Forwarded-Proto`를 기준으로 프로토콜을 판단한다.
- 로그인 차단: 실패 횟수는 프로세스 메모리에 저장하므로 PM2는 단일 fork 프로세스로 실행하고, `pm2 reload coffee-note`로 모든 차단이 즉시 풀린다. 키는 IPv4 주소 또는 IPv6 /56 접두사(IPv4-mapped 주소는 IPv4로 정규화)이며, 로그인에 성공하면 해당 키의 실패 기록을 지운다. 저장소는 최대 10,000개 키까지 두고, 상한을 넘으면 만료된 항목부터 정리하되 활성 차단은 보존한다. 활성 차단만으로 가득 차면 새 키를 차단한다(fail-closed). `trust proxy`는 `loopback`만 신뢰하고 nginx가 `X-Forwarded-For`를 덧붙인다.
- EJS 출력은 기본 이스케이프. JSON을 `<script>`에 넣을 때 `<`를 `<`로 이스케이프.
- URL 필드는 http/https만 허용.

### 사진 처리

multer(메모리, 장당 15MB, 한 번에 20장, JPG·PNG·WebP·AVIF)로 수신 → sharp로 EXIF 회전 보정 후 WebP 변환:
- 본 이미지: 긴 변 1600px
- 썸네일: 긴 변 480px

`UPLOAD_DIR`에 UUID 파일명으로 저장. HEIC는 sharp 기본 빌드가 지원하지 않아 제외한다(아이폰 사파리는 업로드 시 JPEG로 변환해 보낸다).

### 오류 처리

- 존재하지 않는 페이지·기록, 잘못된 id → 404 오류 페이지
- 그 밖의 4xx → 해당 상태의 오류 페이지, 5xx → 로그 기록 후 "서버 오류" 페이지

## 배포·운영

- 서버: `/home/rocky/coffee-note`, PM2 앱 `coffee-note`(fork 1개, 포트 3070, `max_memory_restart` 1G — 업로드가 메모리 버퍼에 최대 300MB까지 쌓이므로 그보다 넉넉히), 사진 저장 경로 `UPLOAD_DIR=/data/coffee-note`.
- nginx가 `coffee.bytebard.cloud`를 `127.0.0.1:3070`으로 프록시하고 Let's Encrypt(certbot webroot) 인증서로 HTTPS를 적용한다. `client_max_body_size 300m`. 설치는 서버에서 `deploy/nginx/install.sh`를 sudo로 직접 실행한다(재실행 가능, 실패 시 복구·백업·종료 코드 1).
- 정적 파일 캐시: `/js`는 ES 모듈 하위 import에 `?v=`를 붙일 수 없으므로 항상 ETag로 재검증(`no-cache`)하고, CSS와 vendor는 7일 캐시(진입점 `?v=` 사용), `/uploads`는 1년 immutable.
- 배포: `master`에 push하면 GitHub Actions(`.github/workflows/deploy.yml`)가 typecheck·테스트 후 테스트한 커밋(`github.sha`)을 SSH로 서버에 배포한다(`scripts/deploy.sh` → `scripts/remote-deploy.sh`: 체크아웃, 설치, 빌드, 마이그레이션, `pm2 reload`, `/healthz` 확인). 수동 배포는 `bash scripts/deploy.sh [브랜치] [ref]`.

## 테스트

Vitest + supertest.
- 단위: 필드 검증·변환, 총점 계산, 검색 인덱스, 카드·상세 뷰 모델, 브라우저 검색 로직(`public/js/query.js`), 설정 로딩, 이미지 변환.
- 브라우저 동작(jsdom): 실제 EJS 템플릿을 렌더링한 DOM에 홈 스크립트·관리자 스크립트를 붙여 검색·탭·정렬·모달 동작 확인.
- 통합(DB): 마이그레이션, 저장소, 공개 페이지, 관리자 인증·CRUD·사진. `TEST_DATABASE_URL`이 있을 때만 실행하고 `coffee_note_test` 스키마만 사용해 운영 데이터를 건드리지 않는다.

## 범위 밖 (YAGNI)

- 다중 사용자/회원가입
- JSON API, 서버 측 검색·페이지네이션
- 외부 스토리지(S3 등)
- 무중단·원자적 배포(릴리스 디렉터리 전환 등)
