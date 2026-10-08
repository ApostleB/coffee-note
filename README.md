# Coffee Note

원두 커핑노트와 카페 후기를 기록하는 개인 웹사이트입니다. PC·모바일 반응형 카드 그리드에서 즉시 검색·정렬할 수 있고, 관리자 화면에서 기록과 사진을 관리합니다.

- 서버: Node.js 22 이상(CI는 22, 운영은 24), Express 5, TypeScript, EJS
- UI: Bootstrap 5, Bootstrap Icons, Pretendard
- DB: PostgreSQL / 사진: 서버 디스크(`UPLOAD_DIR`)

## 준비

```bash
pnpm install
cp .env.example .env   # 값 채우기
pnpm migrate           # 테이블 생성
```

| 변수 | 설명 |
|---|---|
| `DATABASE_URL` | PostgreSQL 접속 문자열 |
| `TEST_DATABASE_URL` | 통합 테스트용 (같은 DB여도 됨. `coffee_note_test` 스키마만 사용) |
| `ADMIN_PASSWORD` | 관리자 비밀번호 (8자 이상) |
| `SESSION_SECRET` | 쿠키 서명 키 (32자 이상, `openssl rand -hex 32`) |
| `UPLOAD_DIR` | 사진 저장 경로 (기본 `./uploads`) |
| `PORT` | 포트 (기본 4000) |
| `COOKIE_SECURE` | HTTPS로 서비스하면 `true` |

## 실행

```bash
pnpm dev        # 개발 (파일 변경 시 재시작)
pnpm test       # 테스트 (TEST_DATABASE_URL이 없으면 DB 테스트는 건너뜀)
pnpm typecheck
pnpm build && pnpm start   # 빌드 후 실행
```

- 공개 화면: `http://localhost:4000/`
- 관리자: `http://localhost:4000/admin` (비밀번호 로그인)
- 스키마를 바꿀 때는 `migrations/`에 다음 번호의 SQL 파일을 추가하고 `pnpm migrate`를 실행합니다.

## 서버 배포

운영 주소는 `https://coffee.bytebard.cloud`이며 서버(`/home/rocky/coffee-note`)에서 PM2(`coffee-note`, 포트 3070)로 실행하고 nginx가 프록시합니다.

### 서버 `.env`

`/home/rocky/coffee-note/.env` (권한 600)에 다음을 둡니다. 배포 스크립트는 `.env`를 만들지 않고 없으면 중단합니다.

```
DATABASE_URL=...
ADMIN_PASSWORD=...
SESSION_SECRET=...
PORT=3070
UPLOAD_DIR=/data/coffee-note
COOKIE_SECURE=true   # nginx HTTPS 적용 전에는 false
```

### 수동 배포

로컬에서 실행합니다. 서버에 저장소가 없으면 `git init` + `remote add`로 만든(`.env`가 먼저 있어도 되도록 clone을 쓰지 않습니다) 뒤 fetch·체크아웃, 빌드·마이그레이션·PM2 재시작·`/healthz` 확인까지 합니다.

```bash
bash scripts/deploy.sh [브랜치] [ref]   # 브랜치 기본 master, ref 기본 origin/<브랜치>
```

두 번째 인자 `ref`는 서버에서 체크아웃할 커밋/ref입니다 (자동 배포는 테스트한 `github.sha`를 넘깁니다). 허용 문자 외의 값은 거부됩니다.

`DEPLOY_KEY`(기본 `~/.ssh/coffee_note_deploy`), `DEPLOY_PORT`(2022), `DEPLOY_USER`(rocky), `DEPLOY_HOST`(bytebard.cloud) 환경변수로 접속 정보를 바꿀 수 있습니다.

### 자동 배포 (GitHub Actions)

`master`에 push하면 `.github/workflows/deploy.yml`이 typecheck·테스트 후 서버에 배포합니다 (`workflow_dispatch`로 수동 실행도 가능). 저장소 secrets가 필요합니다.

| Secret | 내용 |
|---|---|
| `DEPLOY_HOST` | 서버 호스트 |
| `DEPLOY_PORT` | SSH 포트 |
| `DEPLOY_USER` | SSH 사용자 |
| `DEPLOY_SSH_KEY` | 배포용 개인키 |
| `DEPLOY_KNOWN_HOSTS` | 서버 호스트키 (`ssh-keyscan -p <포트> <호스트>`) |

### nginx / HTTPS (서버에서 sudo로 직접 실행)

```bash
sudo bash /home/rocky/coffee-note/deploy/nginx/install.sh
```

최초 설치 때뿐 아니라 `deploy/nginx/` 설정이 바뀌었을 때(예: certbot 갱신 챌린지가 HTTPS로 리다이렉트되던 옛 설정 교체)도 다시 실행합니다. 재실행해도 안전하지만, 실행하는 몇 초 동안 HTTP 전용 설정으로 내려가 `coffee.bytebard.cloud:443` 요청이 기본 server 블록(다른 인증서)으로 갑니다. 실패하면 이전 설정으로 복구하고, 복구도 실패하면 백업을 남기고 종료 코드 1로 끝납니다.

HTTP 설정 설치 → certbot으로 `coffee.bytebard.cloud` 인증서 발급 → HTTPS 설정 적용 → 서버 `.env`의 `COOKIE_SECURE=true` 반영 및 앱 재로드까지 진행합니다. 설치 후 갱신이 되는지 `sudo certbot renew --dry-run --cert-name coffee.bytebard.cloud`로 확인하세요. `X-Forwarded-Proto` 헤더를 프록시가 넘겨야 관리자 POST가 통과합니다.

### 로그인 차단

같은 IP(IPv6는 /56 묶음)에서 관리자 로그인에 10회 연속 실패하면 10분간 `/admin` 전체가 429로 차단됩니다. 실패 기록은 프로세스 메모리에만 있어서, 관리자 본인이 차단됐다면 서버에서 `pm2 reload coffee-note`로 즉시 해제할 수 있습니다 (그래서 PM2는 단일 fork 프로세스로 실행합니다).

### 백업

DB는 `pg_dump`로 주기적으로 백업하세요 (예: `pg_dump "$DATABASE_URL" > coffee-note.sql`). 사진은 DB가 아니라 `UPLOAD_DIR`(`/data/coffee-note`)에 저장되므로 DB 백업과 별도로 이 폴더를 주기적으로 백업하세요 (예: `rsync -a rocky@bytebard.cloud:/data/coffee-note/ ./backup/`).
