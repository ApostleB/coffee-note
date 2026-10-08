# Coffee Note 설계

작성일: 2026-10-08

## 목적

나의 커피생활(구매한 원두의 커핑노트, 카페에서 마신 커피 후기)을 기록하고 PC·모바일 어디서나 카드 형태로 빠르게 검색·정렬해 보는 개인 웹사이트.

- 보기: 누구나 (읽기 전용)
- 작성·수정·삭제: 관리자 비밀번호로 로그인한 관리자만

## 아키텍처

pnpm 모노레포.

```
coffee-note/
  apps/
    server/   Express + TypeScript + pg (PostgreSQL)
    web/      React 19 + Vite + TypeScript
  package.json, pnpm-workspace.yaml
```

- 개발: Vite dev server(web)가 `/api`, `/uploads` 요청을 Express(server)로 프록시.
- 운영: `web` 빌드 결과물을 Express가 정적 서빙 → 단일 서버 프로세스로 배포.
- 환경변수는 `apps/server/.env` (git 제외, `.env.example` 제공).

| 변수 | 설명 |
|---|---|
| `DATABASE_URL` | PostgreSQL 접속 문자열 (DB `coffee_note`) |
| `TEST_DATABASE_URL` | API 통합 테스트용 DB. 없으면 통합 테스트 skip |
| `ADMIN_PASSWORD` | 관리자 로그인 비밀번호 |
| `SESSION_SECRET` | 관리자 쿠키 서명 키 |
| `UPLOAD_DIR` | 사진 저장 경로 (기본 `./uploads`) |
| `PORT` | 서버 포트 (기본 4000) |

## 데이터 모델

### `beans` — 원두 커핑노트

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | serial PK | |
| name | text NOT NULL | 원두명 (카드 제목) |
| shop | text NOT NULL | 판매처/로스터리 (카드 부제목) |
| country | text | 산지 국가 |
| region | text | 산지 지역/농장 |
| variety | text | 품종 |
| process | text | 가공 방식 |
| roast_level | text | 로스팅 포인트 (라이트/미디엄/다크 등 자유 입력) |
| is_decaf | boolean NOT NULL default false | 디카페인 |
| flavor_tags | text[] NOT NULL default '{}' | 향미 노트 태그 |
| acidity, sweetness, body, aftertaste | smallint | 각 1~10, nullable |
| total_score | smallint | 4개 점수 합 (서버에서 계산, 하나라도 없으면 null) |
| summary | text | 간략 메모 (카드 노출) |
| memo | text | 상세 메모 |
| url | text | 상품 URL |
| purchased_at | date | 구매일 |
| price | integer | 가격(원) |
| weight_g | integer | 용량(g) |
| brew_method | text | 추출방식 |
| roasted_at | date | 로스팅일 |
| best_from | date | 최적 시음 시작일 |
| created_at, updated_at | timestamptz | |

### `cafe_visits` — 카페 후기

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | serial PK | |
| menu | text NOT NULL | 마신 원두/메뉴명 (카드 제목) |
| cafe_name | text NOT NULL | 카페명 (카드 부제목) |
| address | text | 주소 |
| map_url | text | 지도 URL |
| mood_memo | text | 분위기 메모 |
| visited_at | date | 방문일 |
| price | integer | 가격(원) |
| brew_method | text | 추출방식 |
| country, variety, process | text | 원두 정보 |
| is_decaf | boolean NOT NULL default false | |
| flavor_tags | text[] NOT NULL default '{}' | |
| rating | smallint | 1~5 |
| memo | text | 후기 |
| created_at, updated_at | timestamptz | |

### `photos`

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | serial PK | |
| bean_id | int FK → beans ON DELETE CASCADE, nullable | |
| cafe_visit_id | int FK → cafe_visits ON DELETE CASCADE, nullable | |
| file_name | text NOT NULL | 원본 리사이즈본 파일명 |
| thumb_name | text NOT NULL | 썸네일 파일명 |
| sort_order | int NOT NULL default 0 | |
| is_thumbnail | boolean NOT NULL default false | |
| created_at | timestamptz | |

- CHECK: `bean_id`와 `cafe_visit_id` 중 정확히 하나만 not null.
- 부분 유니크 인덱스: 글 하나당 `is_thumbnail = true`는 최대 1장.
- 썸네일 지정이 없으면 `sort_order`가 가장 앞선 사진을 카드 썸네일로 사용.
- 글 삭제 시 DB는 cascade, 디스크 파일은 서버가 함께 삭제.

### 마이그레이션

`apps/server/migrations/NNN_name.sql` 파일을 번호 순으로 실행하고 `schema_migrations` 테이블에 적용 이력을 기록하는 스크립트(`pnpm migrate`).

## 서버 API

공통: JSON, 오류 응답은 `{ "error": string }` + 적절한 상태 코드(400 검증 실패, 401 미인증, 404 없음, 500 서버 오류). 입력은 zod로 검증.

### 공개 (읽기)

- `GET /api/beans` — 전체 원두 노트 목록. 각 항목에 `photos: [{id, url, thumbUrl, isThumbnail}]`와 `thumbnailUrl` 포함.
- `GET /api/beans/:id`
- `GET /api/cafe-visits`, `GET /api/cafe-visits/:id` — 동일 구조.

개인 기록 규모(수백~수천 건)이므로 페이지네이션 없이 전체를 내려주고 검색·정렬은 프론트에서 처리.

### 관리자

- `POST /api/auth/login` `{ password }` → 일치 시 서명된 httpOnly, SameSite=Lax 쿠키 발급(유효 30일). 불일치 401.
- `POST /api/auth/logout`, `GET /api/auth/me` (`{ admin: boolean }`).
- 아래는 모두 관리자 쿠키 필요 (없으면 401):
  - `POST /api/beans`, `PUT /api/beans/:id`, `DELETE /api/beans/:id`
  - `POST /api/cafe-visits`, `PUT /api/cafe-visits/:id`, `DELETE /api/cafe-visits/:id`
  - `POST /api/beans/:id/photos`, `POST /api/cafe-visits/:id/photos` — multipart, 여러 장. jpg/png/webp/heic, 장당 최대 15MB.
  - `DELETE /api/photos/:id`
  - `PUT /api/photos/:id/thumbnail` — 해당 사진을 썸네일로 지정(같은 글의 기존 썸네일 해제).
- 로그인 시도는 IP당 분당 10회로 제한.

### 사진 처리

multer(메모리)로 수신 → sharp로 회전 보정 후 WebP 변환:
- 본 이미지: 긴 변 1600px
- 썸네일: 긴 변 480px

`UPLOAD_DIR`에 UUID 파일명으로 저장, `/uploads/<파일명>`으로 정적 서빙.

## 프론트엔드

### 라우트

- `/` — 공개 메인 (탭: 원두 노트 | 카페 후기)
- `/admin` — 관리자 로그인 및 관리

### 공개 메인

**툴바**
- 검색창: 입력 즉시 필터링
- 검색 범위 셀렉트: 전체 / 원두 / 카페. "전체"면 두 목록을 합친 결과를 보여주고(카드에 원두/카페 배지), 원두·카페 선택 시 해당 탭으로 전환
- 정렬 셀렉트:
  - 최신순 / 오래된순 — 원두: `purchased_at`, 카페: `visited_at` (없으면 `created_at`)
  - 점수 높은순 — 원두: `total_score`, 카페: `rating`
  - 이름순(가나다) — 원두 `name` / 카페 `menu`, `localeCompare('ko')`
  - 가격 낮은순 / 높은순
  - 최신 로스팅순 — `roasted_at` (원두에만 노출)
  - 원두 국가순 — `country` 가나다
  - 값이 없는 항목은 항상 뒤로
- 로스터리/가게 셀렉트: 현재 목록의 `shop`(원두) / `cafe_name`(카페) 고유값으로 자동 생성, "전체" 기본
- 디카페인 토글: 켜면 `is_decaf = true`만

**검색 구현**
- 최초 진입 시 두 목록을 한 번 fetch해 메모리에 보관.
- 각 항목에 대해 이름·가게·국가·지역·품종·가공·태그·간략 메모·메모(카페는 주소·분위기 메모 포함)를 이어 붙여 소문자·공백 정규화한 `searchText`를 미리 계산(목록 로드 시 1회).
- 검색어를 공백으로 나눈 모든 토큰이 `searchText`에 포함되면 매칭(AND).
- 필터→검색→정렬은 순수 함수 `applyQuery(items, query)`로 분리, `useMemo` + `useDeferredValue`로 입력 지연 없이 갱신.

**카드 레이아웃**
- 컨테이너: `display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap`.
  화면 폭에 따라 한 줄 카드 수가 자동으로 바뀜(모바일 1, 태블릿 2~3, PC 4~5).
- 카드 높이 통일: 썸네일 4:3 고정(`aspect-ratio`, `object-fit: cover`, 사진 없으면 원두/컵 아이콘 플레이스홀더), 간략 메모 2줄 clamp, 태그 최대 1줄.
- 원두 카드: 썸네일, 제목(원두명), 부제목(판매처), 국가·가공, 향미 태그, 총점, 디카페인 배지, "시음 적기" 배지(`best_from` ≤ 오늘).
- 카페 카드: 썸네일, 제목(메뉴명), 부제목(카페명), 별점, 향미 태그, 방문일, 디카페인 배지.
- 카드 클릭 → 상세 모달(모바일은 전체 화면 시트): 모든 필드, 사진 갤러리(좌우 스와이프/화살표), 외부 링크(상품 URL, 지도 URL).
- 결과 없음 상태 메시지, 로딩 스켈레톤 카드, fetch 실패 시 재시도 버튼.

### 관리자 (`/admin`)

- 미로그인: 비밀번호 입력 폼.
- 로그인 후: 원두/카페 탭별 목록(공개 화면과 같은 카드 그리드 + 검색) + "새로 작성" 버튼.
- 작성/수정 폼: 모든 필드 입력, 향미 태그는 입력 후 Enter로 칩 추가, 점수 입력 시 총점 미리보기.
- 사진: 여러 장 선택 업로드(업로드 진행 표시), 미리보기 그리드에서 탭하여 썸네일 지정, 개별 삭제.
  신규 글은 저장 후 사진 업로드 단계가 활성화됨.
- 삭제는 확인 대화상자 후 실행.
- API가 401을 반환하면 로그인 화면으로 이동.

### 스타일

- 순수 CSS(CSS 변수 기반 토큰, 라이트/다크 대응), 모바일 우선 반응형.
- 툴바는 모바일에서 검색창 한 줄 + 셀렉트들이 가로 스크롤 한 줄로 배치.

## 테스트

- `apps/web`: Vitest로 `applyQuery`(검색 토큰 매칭, 각 정렬, 가게·디카페인 필터, null 값 뒤로) 단위 테스트.
- `apps/server`: Vitest로 zod 스키마·총점 계산 단위 테스트. supertest로 API 통합 테스트(인증 401, CRUD, 썸네일 지정 유일성)는 `TEST_DATABASE_URL` 설정 시에만 실행해 운영 DB를 건드리지 않음.

## 범위 밖 (YAGNI)

- 다중 사용자/회원가입
- 서버 측 검색·페이지네이션
- 외부 스토리지(S3 등)
- 배포 자동화(배포 대상 확정 후 별도 진행)
