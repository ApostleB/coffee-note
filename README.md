# Coffee Note

원두 커핑노트와 카페 후기를 기록하는 개인 웹사이트입니다. PC·모바일 반응형 카드 그리드에서 즉시 검색·정렬할 수 있고, 관리자 화면에서 기록과 사진을 관리합니다.

- 서버: Node.js 22, Express 5, TypeScript, EJS
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
