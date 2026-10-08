# Coffee Note Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 원두 커핑노트와 카페 후기를 기록하고, PC·모바일에서 카드 그리드로 즉시 검색·정렬해 보는 개인 웹사이트를 만든다.

**Architecture:** 단일 Express 5 + TypeScript 서버가 EJS 템플릿과 Bootstrap 5로 HTML을 렌더링한다. 공개 홈은 모든 카드를 서버에서 그리고 검색 인덱스 JSON을 함께 내려주며, 브라우저 ES 모듈이 카드를 숨기고 재배치해 즉시 필터링한다. 관리자 화면은 쿠키 인증 + 일반 HTML 폼 POST로 동작하고, 데이터는 PostgreSQL, 사진은 sharp로 변환해 디스크에 저장한다.

**Tech Stack:** Node.js 22, pnpm 11, Express 5, TypeScript 5.9, EJS 7, Bootstrap 5.3, Bootstrap Icons, Pretendard, pg, zod 4, multer 2, sharp, express-rate-limit 8, Vitest 5, supertest, jsdom

**Spec:** `docs/superpowers/specs/2026-10-08-coffee-note-design.md`

## Global Constraints

- 프로젝트 루트: `/Users/jeongbaul/Dev/SIDE_PROJECT/coffee-note` (이미 `git init` 됨, `.gitignore`에 `node_modules/ dist/ .env uploads/ .DS_Store`)
- 모든 UI 문구·오류 메시지·주석은 한국어
- 서버 코드는 ESM(`"type": "module"`), 상대 import는 `.js` 확장자로 쓴다 (`import { x } from './x.js'`)
- 코드 스타일: 세미콜론 없음, 작은따옴표, 2칸 들여쓰기
- 브라우저 JS는 빌드 없이 `public/js/*.js` ES 모듈, 첫 줄 `// @ts-check`, 타입은 JSDoc
- UI는 Bootstrap 5.3 클래스로 구성하고, 커스텀 CSS는 `public/css/app.css` 한 파일에만 둔다
- DB 접속 정보·비밀번호는 `.env`에만 둔다. 커밋·문서·코드에 넣지 않는다
- DB 테스트는 `TEST_DATABASE_URL`이 있을 때만 돌고 `coffee_note_test` 스키마만 사용한다 (`public` 스키마를 건드리는 테스트 금지)
- Bootstrap 유틸리티 `d-flex`, `d-block` 등 `!important` display 클래스를 `hidden` 속성으로 토글할 요소에 붙이지 않는다 (`[hidden]`보다 우선해서 숨겨지지 않음)
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## File Structure

```
coffee-note/
  package.json, pnpm-workspace.yaml, tsconfig.json, tsconfig.build.json, vitest.config.ts
  .env.example, README.md
  migrations/001_init.sql
  src/
    index.ts            서버 진입점
    app.ts              createApp: 미들웨어·라우터 조립
    paths.ts            루트·views·public·migrations·vendor 경로
    config.ts           환경변수 → Config
    errors.ts           HttpError, parseId, notFound, errorHandler(오류 페이지)
    db.ts               createPool, withTransaction
    migrate.ts          migrate(pool) / migrate-cli.ts: pnpm migrate
    fields.ts           필드 정의(섹션), zod 스키마 생성, 폼 값 변환
    resources.ts        ResourceDef(beanDef, cafeVisitDef), prepare, toEntity
    repository.ts       ResourceRepo(list/get/create/update/remove), createRepos
    search-index.ts     IndexEntry, normalize, toIndexEntry
    view-helpers.ts     날짜·숫자·별점 포맷, jsonForScript, displayValue
    view-models.ts      카드·홈·상세 뷰 모델
    auth.ts             관리자 쿠키, 비밀번호 확인, requireAdmin, sameOriginOnly, loginLimiter
    images.ts           sharp 변환
    storage.ts          업로드 파일 저장·삭제
    photos.ts           receivePhotos(multer), PhotoService
    routes/public.ts    홈·상세
    routes/admin.ts     로그인·CRUD·사진
  views/
    home.ejs, detail.ejs, error.ejs
    admin/login.ejs, admin/list.ejs, admin/form.ejs
    partials/head.ejs, foot.ejs, site-header.ejs, admin-header.ejs
    partials/card.ejs, stars.ejs, detail.ejs, field.ejs
  public/
    css/app.css
    js/theme.js         색상 모드(일반 스크립트)
    js/query.js         검색·필터·정렬 순수 함수
    js/home.js          홈 DOM 연결 / home-main.js 진입
    js/carousel.js      캐러셀 초기화 / detail-main.js 진입
    js/admin.js         총점 미리보기·삭제 확인·목록 검색 / admin-main.js 진입
  test/
    setup-env.ts, helpers.ts, db.ts, fixtures.ts, *.test.ts
```

---

### Task 1: 프로젝트 골격, 설정, 오류 페이지, 정적 자원

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`
- Create: `src/paths.ts`, `src/config.ts`, `src/errors.ts`, `src/app.ts`
- Create: `views/partials/head.ejs`, `views/partials/foot.ejs`, `views/partials/site-header.ejs`, `views/error.ejs`
- Create: `public/css/app.css`, `public/js/theme.js`
- Test: `test/setup-env.ts`, `test/helpers.ts`, `test/config.test.ts`, `test/app.test.ts`

**Interfaces:**
- Produces:
  - `type Config = { databaseUrl: string; adminPassword: string; sessionSecret: string; uploadDir: string; port: number; cookieSecure: boolean }`
  - `loadConfig(env?: NodeJS.ProcessEnv): Config`
  - `class HttpError extends Error { status: number }`, `parseId(value: string): number`, `notFound: RequestHandler`, `errorHandler: ErrorRequestHandler`
  - `createApp(deps: { config: Config; pool: Pool }): Express`
  - `ROOT, VIEWS_DIR, PUBLIC_DIR, MIGRATIONS_DIR: string`, `vendorDir(pkg: string, sub: string): string`
  - 템플릿 파셜 `partials/head`(locals.title), `partials/foot`(locals.scripts: string[]), `partials/site-header`(isAdmin)
  - 테스트 헬퍼 `testConfig(overrides?: Partial<Config>): Config`, `TEST_PASSWORD = 'test-password'`

- [ ] **Step 1: 패키지 파일과 설정 파일 작성**

`package.json`:
```json
{
  "name": "coffee-note",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.22.0",
  "engines": { "node": ">=22.12" },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/index.js",
    "migrate": "tsx src/migrate-cli.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

`pnpm-workspace.yaml` (pnpm 11은 설치 스크립트를 허용 목록으로 관리한다):
```yaml
allowBuilds:
  esbuild: true
  sharp: true
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "allowJs": true,
    "checkJs": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "test", "public/js", "vitest.config.ts"]
}
```

`tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "allowJs": false,
    "checkJs": false,
    "rootDir": "src",
    "outDir": "dist",
    "sourceMap": true
  },
  "include": ["src"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup-env.ts'],
    // DB 테스트들이 같은 테스트 스키마를 쓰므로 파일 단위 병렬 실행을 끈다
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
```

- [ ] **Step 2: 의존성 설치**

```bash
cd /Users/jeongbaul/Dev/SIDE_PROJECT/coffee-note
pnpm add express@^5 ejs@^7 pg zod@^4 multer@^2 sharp cookie-parser express-rate-limit@^8 bootstrap@^5.3 bootstrap-icons pretendard
pnpm add -D typescript@~5.9.3 tsx vitest@^5 supertest jsdom @types/node@^22 @types/express@^5 @types/pg @types/multer @types/cookie-parser @types/supertest @types/ejs
```
Expected: 설치 성공. `ls node_modules/bootstrap/dist/css/bootstrap.min.css node_modules/bootstrap-icons/font/bootstrap-icons.min.css node_modules/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css` 세 파일이 모두 존재.

- [ ] **Step 3: 테스트 헬퍼와 실패하는 테스트 작성**

`test/setup-env.ts`:
```ts
// .env의 TEST_DATABASE_URL 등을 테스트에서도 읽는다
try {
  process.loadEnvFile()
} catch {
  // .env가 없으면 환경변수만 사용
}
```

`test/helpers.ts`:
```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Config } from '../src/config.js'

export const TEST_PASSWORD = 'test-password'

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    databaseUrl: 'postgres://unused',
    adminPassword: TEST_PASSWORD,
    sessionSecret: 's'.repeat(32),
    uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'coffee-note-')),
    port: 0,
    cookieSecure: false,
    ...overrides,
  }
}
```

`test/config.test.ts`:
```ts
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

const valid = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  ADMIN_PASSWORD: 'password123',
  SESSION_SECRET: 'x'.repeat(32),
}

describe('loadConfig', () => {
  it('선택 항목은 기본값을 쓴다', () => {
    const config = loadConfig(valid)
    expect(config.port).toBe(4000)
    expect(config.cookieSecure).toBe(false)
    expect(path.isAbsolute(config.uploadDir)).toBe(true)
    expect(path.basename(config.uploadDir)).toBe('uploads')
  })

  it('지정한 값을 읽는다', () => {
    const config = loadConfig({ ...valid, PORT: '8080', COOKIE_SECURE: 'true', UPLOAD_DIR: '/data/photos' })
    expect(config).toMatchObject({ port: 8080, cookieSecure: true, uploadDir: '/data/photos' })
  })

  it('누락되거나 짧은 값은 변수 이름을 알려준다', () => {
    expect(() => loadConfig({ DATABASE_URL: 'x', ADMIN_PASSWORD: 'short' })).toThrow(
      '환경변수를 확인하세요: ADMIN_PASSWORD, SESSION_SECRET',
    )
  })
})
```

`test/app.test.ts`:
```ts
import type { Pool } from 'pg'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { testConfig } from './helpers.js'

const app = createApp({ config: testConfig(), pool: {} as Pool })

describe('app', () => {
  it('GET /healthz', async () => {
    const res = await request(app).get('/healthz')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('없는 페이지는 404 오류 페이지', async () => {
    const res = await request(app).get('/nope')
    expect(res.status).toBe(404)
    expect(res.type).toBe('text/html')
    expect(res.text).toContain('페이지를 찾을 수 없습니다')
    expect(res.text).toContain('/vendor/bootstrap/css/bootstrap.min.css')
  })

  it.each([
    ['/vendor/bootstrap/css/bootstrap.min.css', 'text/css'],
    ['/vendor/bootstrap/js/bootstrap.bundle.min.js', 'application/javascript'],
    ['/vendor/bootstrap-icons/bootstrap-icons.min.css', 'text/css'],
    ['/vendor/pretendard/pretendardvariable-dynamic-subset.css', 'text/css'],
    ['/css/app.css', 'text/css'],
    ['/js/theme.js', 'application/javascript'],
  ])('정적 파일 %s', async (url, type) => {
    const res = await request(app).get(url)
    expect(res.status).toBe(200)
    expect(res.type).toBe(type)
  })
})
```

- [ ] **Step 4: 테스트가 실패하는지 확인**

Run: `pnpm test`
Expected: FAIL — `Cannot find module '../src/config.js'` 등 모듈 없음

- [ ] **Step 5: 서버 코드 구현**

`src/paths.ts`:
```ts
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 프로젝트 루트. src/와 dist/ 모두 루트 바로 아래에 있으므로 한 단계 위가 루트다. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const VIEWS_DIR = path.join(ROOT, 'views')
export const PUBLIC_DIR = path.join(ROOT, 'public')
export const MIGRATIONS_DIR = path.join(ROOT, 'migrations')

export function vendorDir(pkg: string, sub: string): string {
  return path.join(ROOT, 'node_modules', pkg, sub)
}
```

`src/config.ts`:
```ts
import path from 'node:path'
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  ADMIN_PASSWORD: z.string().min(8),
  SESSION_SECRET: z.string().min(32),
  UPLOAD_DIR: z.string().default('./uploads'),
  PORT: z.coerce.number().int().positive().default(4000),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
})

export type Config = {
  databaseUrl: string
  adminPassword: string
  sessionSecret: string
  /** 절대 경로 */
  uploadDir: string
  port: number
  cookieSecure: boolean
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env)
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))]
    throw new Error(`환경변수를 확인하세요: ${names.join(', ')}`)
  }
  const e = parsed.data
  return {
    databaseUrl: e.DATABASE_URL,
    adminPassword: e.ADMIN_PASSWORD,
    sessionSecret: e.SESSION_SECRET,
    uploadDir: path.resolve(e.UPLOAD_DIR),
    port: e.PORT,
    cookieSecure: e.COOKIE_SECURE === 'true',
  }
}
```

`src/errors.ts`:
```ts
import type { ErrorRequestHandler, RequestHandler } from 'express'

export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** URL의 id 파라미터. 양의 정수가 아니면 404 */
export function parseId(value: string): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, '기록을 찾을 수 없습니다')
  return id
}

export const notFound: RequestHandler = () => {
  throw new HttpError(404, '페이지를 찾을 수 없습니다')
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err)
    return
  }
  const rawStatus = err instanceof HttpError ? err.status : Number(err?.status)
  const status = rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500
  if (status >= 500) console.error(err)
  const message =
    err instanceof HttpError
      ? err.message
      : status === 404
        ? '페이지를 찾을 수 없습니다'
        : status < 500
          ? '잘못된 요청입니다'
          : '서버 오류가 발생했습니다'
  res.status(status).render('error', { title: '오류', status, message })
}
```

`src/app.ts`:
```ts
import cookieParser from 'cookie-parser'
import express from 'express'
import type { Pool } from 'pg'
import type { Config } from './config.js'
import { errorHandler, notFound } from './errors.js'
import { PUBLIC_DIR, VIEWS_DIR, vendorDir } from './paths.js'

export type AppDeps = { config: Config; pool: Pool }

export function createApp({ config, pool }: AppDeps) {
  const app = express()
  app.disable('x-powered-by')
  // 같은 서버의 리버스 프록시(nginx 등)만 신뢰한다 (로그인 시도 제한의 IP 판별용)
  app.set('trust proxy', 'loopback')
  app.set('view engine', 'ejs')
  app.set('views', VIEWS_DIR)
  // 정적 파일 캐시 무효화용 버전 (?v=)
  app.locals.assetVersion = Date.now().toString(36)

  const staticOptions = { maxAge: '7d' }
  app.use(express.static(PUBLIC_DIR, staticOptions))
  app.use('/vendor/bootstrap', express.static(vendorDir('bootstrap', 'dist'), staticOptions))
  app.use('/vendor/bootstrap-icons', express.static(vendorDir('bootstrap-icons', 'font'), staticOptions))
  app.use('/vendor/pretendard', express.static(vendorDir('pretendard', 'dist/web/variable'), staticOptions))

  app.use(express.urlencoded({ extended: false, limit: '100kb' }))
  app.use(cookieParser(config.sessionSecret))
  app.use((_req, res, next) => {
    res.locals.isAdmin = false
    next()
  })

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true })
  })

  app.use(notFound)
  app.use(errorHandler)
  return app
}
```
(`pool`은 Task 4부터 사용한다.)

- [ ] **Step 6: 레이아웃 템플릿과 스타일 작성**

`views/partials/head.ejs`:
```ejs
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title><%= locals.title ? `${locals.title} · Coffee Note` : 'Coffee Note' %></title>
  <script src="/js/theme.js?v=<%= assetVersion %>"></script>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>☕</text></svg>">
  <link rel="stylesheet" href="/vendor/pretendard/pretendardvariable-dynamic-subset.css">
  <link rel="stylesheet" href="/vendor/bootstrap/css/bootstrap.min.css">
  <link rel="stylesheet" href="/vendor/bootstrap-icons/bootstrap-icons.min.css">
  <link rel="stylesheet" href="/css/app.css?v=<%= assetVersion %>">
</head>
<body>
```

`views/partials/foot.ejs`:
```ejs
<script src="/vendor/bootstrap/js/bootstrap.bundle.min.js"></script>
<% (locals.scripts || []).forEach((src) => { %>
<script type="module" src="<%= src %>?v=<%= assetVersion %>"></script>
<% }) %>
</body>
</html>
```

`views/partials/site-header.ejs`:
```ejs
<header class="border-bottom bg-body">
  <nav class="navbar container">
    <a class="navbar-brand fw-bold d-flex align-items-center gap-2" href="/">
      <i class="bi bi-cup-hot-fill text-primary"></i> Coffee Note
    </a>
    <span class="navbar-text small d-none d-sm-inline me-auto">나의 커피 기록</span>
    <% if (isAdmin) { %>
      <a class="btn btn-sm btn-outline-secondary" href="/admin"><i class="bi bi-gear"></i> 관리</a>
    <% } %>
  </nav>
</header>
```

`views/error.ejs`:
```ejs
<%- include('partials/head') %>
<%- include('partials/site-header') %>
<main class="container py-5 text-center">
  <p class="display-5 fw-bold text-primary mb-2"><%= status %></p>
  <p class="lead mb-4"><%= message %></p>
  <a class="btn btn-primary" href="/">처음으로</a>
</main>
<%- include('partials/foot') %>
```

`public/js/theme.js`:
```js
// @ts-check
// 시스템 다크 모드를 따라 Bootstrap 색상 모드를 정한다. 첫 렌더링 전에 실행해 깜빡임을 막는다.
;(() => {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = () => document.documentElement.setAttribute('data-bs-theme', media.matches ? 'dark' : 'light')
  apply()
  media.addEventListener('change', apply)
})()
```

`public/css/app.css`:
```css
/* ===== 테마: Bootstrap 변수를 커피 톤으로 덮어쓴다 ===== */
:root,
[data-bs-theme='light'] {
  --bs-body-font-family: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui,
    'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
  --bs-body-bg: #f7f3ee;
  --bs-body-color: #2b1d14;
  --bs-primary: #8b4a2b;
  --bs-primary-rgb: 139, 74, 43;
  --bs-link-color: #8b4a2b;
  --bs-link-color-rgb: 139, 74, 43;
  --bs-link-hover-color: #6c3820;
  --bs-link-hover-color-rgb: 108, 56, 32;
  --bs-border-color: #e3d8ca;
  --bs-tertiary-bg: #efe7dc;
  --bs-tertiary-bg-rgb: 239, 231, 220;
  --coffee-surface: #fffdf9;
  --coffee-primary-hover: #74391f;
  --coffee-on-primary: #ffffff;
}

[data-bs-theme='dark'] {
  --bs-body-bg: #17120e;
  --bs-body-color: #f1e8de;
  --bs-primary: #e09a6a;
  --bs-primary-rgb: 224, 154, 106;
  --bs-link-color: #e09a6a;
  --bs-link-color-rgb: 224, 154, 106;
  --bs-link-hover-color: #eab08a;
  --bs-link-hover-color-rgb: 234, 176, 138;
  --bs-border-color: #3a2f26;
  --bs-tertiary-bg: #2c231c;
  --bs-tertiary-bg-rgb: 44, 35, 28;
  --coffee-surface: #211a15;
  --coffee-primary-hover: #eab08a;
  --coffee-on-primary: #1a120c;
}

.card { --bs-card-bg: var(--coffee-surface); }
.modal { --bs-modal-bg: var(--coffee-surface); }
.list-group { --bs-list-group-bg: var(--coffee-surface); }

.btn-primary {
  --bs-btn-color: var(--coffee-on-primary);
  --bs-btn-bg: var(--bs-primary);
  --bs-btn-border-color: var(--bs-primary);
  --bs-btn-hover-color: var(--coffee-on-primary);
  --bs-btn-hover-bg: var(--coffee-primary-hover);
  --bs-btn-hover-border-color: var(--coffee-primary-hover);
  --bs-btn-active-color: var(--coffee-on-primary);
  --bs-btn-active-bg: var(--coffee-primary-hover);
  --bs-btn-active-border-color: var(--coffee-primary-hover);
  --bs-btn-disabled-color: var(--coffee-on-primary);
  --bs-btn-disabled-bg: var(--bs-primary);
  --bs-btn-disabled-border-color: var(--bs-primary);
}

.btn-outline-primary {
  --bs-btn-color: var(--bs-primary);
  --bs-btn-border-color: var(--bs-primary);
  --bs-btn-hover-color: var(--coffee-on-primary);
  --bs-btn-hover-bg: var(--bs-primary);
  --bs-btn-hover-border-color: var(--bs-primary);
  --bs-btn-active-color: var(--coffee-on-primary);
  --bs-btn-active-bg: var(--bs-primary);
  --bs-btn-active-border-color: var(--bs-primary);
}

.form-control:focus,
.form-select:focus,
.form-check-input:focus {
  border-color: rgba(var(--bs-primary-rgb), 0.6);
  box-shadow: 0 0 0 0.25rem rgba(var(--bs-primary-rgb), 0.2);
}

.form-check-input:checked {
  background-color: var(--bs-primary);
  border-color: var(--bs-primary);
}

.nav-underline .nav-link.active {
  color: var(--bs-body-color);
  border-bottom-color: var(--bs-primary);
}

/* ===== 공통 유틸리티 ===== */
.min-w-0 { min-width: 0; }

.text-truncate-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `pnpm test && pnpm typecheck`
Expected: config 3개, app 8개 테스트 PASS, 타입 오류 없음

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "feat: Express + EJS + Bootstrap 프로젝트 골격

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: DB 풀과 마이그레이션

**Files:**
- Create: `src/db.ts`, `src/migrate.ts`, `src/migrate-cli.ts`, `migrations/001_init.sql`, `.env.example`, `.env`(커밋 금지)
- Test: `test/db.ts`, `test/migrate.test.ts`

**Interfaces:**
- Consumes: `MIGRATIONS_DIR` (Task 1)
- Produces:
  - `createPool(connectionString: string, options?: { searchPath?: string }): pg.Pool` — `date` 컬럼은 `'YYYY-MM-DD'` 문자열로 읽힌다
  - `withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T>`
  - `migrate(pool: Pool, log?: (message: string) => void): Promise<string[]>` — 이번에 적용한 파일 이름 목록
  - 테스트 헬퍼 `describeDb`, `TEST_SCHEMA = 'coffee_note_test'`, `createTestPool(): Promise<Pool>`, `resetData(pool: Pool): Promise<void>`

- [ ] **Step 1: 환경변수 파일 작성**

`.env.example`:
```
# PostgreSQL 접속 문자열
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/coffee_note
# 통합 테스트용. 같은 DB여도 된다 (테스트는 coffee_note_test 스키마만 사용)
TEST_DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/coffee_note
# 관리자 로그인 비밀번호 (8자 이상)
ADMIN_PASSWORD=change-me-please
# 쿠키 서명 키 (32자 이상) 예: openssl rand -hex 32
SESSION_SECRET=
# 사진 저장 경로
UPLOAD_DIR=./uploads
PORT=4000
# HTTPS로 서비스할 때 true
COOKIE_SECURE=false
```

`.env`: `.env.example`을 복사한 뒤 사용자에게 받은 PostgreSQL 접속 정보(호스트 bytebard.cloud, 포트 15432, DB/사용자 coffee_note)로 `DATABASE_URL`과 `TEST_DATABASE_URL`을 채우고, `SESSION_SECRET`은 `openssl rand -hex 32` 결과, `ADMIN_PASSWORD`는 `openssl rand -base64 18` 결과로 채운다. 생성한 관리자 비밀번호는 작업 보고 때 사용자에게 알려준다. `git status`에 `.env`가 나오지 않는지 확인한다.

- [ ] **Step 2: 실패하는 테스트 작성**

`test/db.ts`:
```ts
import type { Pool } from 'pg'
import { describe } from 'vitest'
import { createPool } from '../src/db.js'
import { migrate } from '../src/migrate.js'

export const TEST_SCHEMA = 'coffee_note_test'
const url = process.env.TEST_DATABASE_URL

/** TEST_DATABASE_URL이 없으면 DB 테스트를 건너뛴다 */
export const describeDb = url ? describe : describe.skip

/**
 * 테스트 전용 스키마를 새로 만들고 마이그레이션을 적용한 풀을 돌려준다.
 * 운영 데이터가 있는 public 스키마는 건드리지 않는다.
 */
export async function createTestPool(): Promise<Pool> {
  if (!url) throw new Error('TEST_DATABASE_URL이 필요합니다')
  const admin = createPool(url)
  try {
    await admin.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
    await admin.query(`CREATE SCHEMA ${TEST_SCHEMA}`)
  } finally {
    await admin.end()
  }
  const pool = createPool(url, { searchPath: TEST_SCHEMA })
  await migrate(pool, () => {})
  return pool
}

export async function resetData(pool: Pool): Promise<void> {
  await pool.query('TRUNCATE photos, beans, cafe_visits RESTART IDENTITY CASCADE')
}
```

`test/migrate.test.ts`:
```ts
import type { Pool } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { migrate } from '../src/migrate.js'
import { createTestPool, describeDb, TEST_SCHEMA } from './db.js'

describeDb('migrate', () => {
  let pool: Pool

  beforeAll(async () => {
    pool = await createTestPool()
  })

  afterAll(async () => {
    await pool.end()
  })

  it('테이블을 만들고 이력을 남긴다', async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name',
      [TEST_SCHEMA],
    )
    expect(rows.map((r) => r.table_name)).toEqual(['beans', 'cafe_visits', 'photos', 'schema_migrations'])
  })

  it('두 번째 실행은 아무것도 적용하지 않는다', async () => {
    expect(await migrate(pool, () => {})).toEqual([])
  })

  it('date 컬럼은 문자열로 읽힌다', async () => {
    const { rows } = await pool.query(
      "INSERT INTO beans (name, shop, roasted_at) VALUES ('a', 'b', '2026-10-01') RETURNING roasted_at",
    )
    expect(rows[0].roasted_at).toBe('2026-10-01')
  })

  it('사진은 원두·카페 중 정확히 하나에 연결된다', async () => {
    await expect(pool.query("INSERT INTO photos (file_name, thumb_name) VALUES ('a', 'b')")).rejects.toThrow()
  })

  it('글 하나에 썸네일은 1장만 지정된다', async () => {
    const { rows } = await pool.query("INSERT INTO beans (name, shop) VALUES ('a', 'b') RETURNING id")
    const insert = 'INSERT INTO photos (bean_id, file_name, thumb_name, is_thumbnail) VALUES ($1, $2, $2, true)'
    await pool.query(insert, [rows[0].id, 'one'])
    await expect(pool.query(insert, [rows[0].id, 'two'])).rejects.toThrow()
  })
})
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `pnpm test test/migrate.test.ts`
Expected: FAIL — `Cannot find module '../src/db.js'`

- [ ] **Step 4: 구현**

`src/db.ts`:
```ts
import pg from 'pg'

// date(OID 1082)를 JS Date로 바꾸면 타임존 때문에 하루가 밀릴 수 있어 'YYYY-MM-DD' 문자열 그대로 쓴다
pg.types.setTypeParser(1082, (value: string) => value)

export type PoolOptions = { searchPath?: string }

export function createPool(connectionString: string, { searchPath }: PoolOptions = {}): pg.Pool {
  return new pg.Pool({
    connectionString,
    max: 5,
    options: searchPath ? `-c search_path=${searchPath}` : undefined,
  })
}

export async function withTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
```

`src/migrate.ts`:
```ts
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Pool } from 'pg'
import { withTransaction } from './db.js'
import { MIGRATIONS_DIR } from './paths.js'

/** 아직 적용하지 않은 migrations/*.sql을 이름 순으로 적용하고, 적용한 파일 이름을 돌려준다 */
export async function migrate(pool: Pool, log: (message: string) => void = console.log): Promise<string[]> {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  )
  const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations')
  const done = new Set(rows.map((r) => r.name))
  const applied: string[] = []
  for (const file of files) {
    if (done.has(file)) continue
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8')
    await withTransaction(pool, async (client) => {
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
    })
    log(`적용: ${file}`)
    applied.push(file)
  }
  return applied
}
```

`src/migrate-cli.ts`:
```ts
import { createPool } from './db.js'
import { migrate } from './migrate.js'

try {
  process.loadEnvFile()
} catch {
  // .env가 없으면 환경변수만 사용
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL이 필요합니다')
  process.exit(1)
}

const pool = createPool(url)
try {
  const applied = await migrate(pool)
  console.log(applied.length ? `${applied.length}개 마이그레이션 적용 완료` : '적용할 마이그레이션이 없습니다')
} finally {
  await pool.end()
}
```

`migrations/001_init.sql`:
```sql
CREATE TABLE beans (
  id serial PRIMARY KEY,
  name text NOT NULL,
  shop text NOT NULL,
  summary text,
  url text,
  country text,
  region text,
  variety text,
  process text,
  roast_level text,
  is_decaf boolean NOT NULL DEFAULT false,
  purchased_at date,
  price integer CHECK (price >= 0),
  weight_g integer CHECK (weight_g > 0),
  brew_method text,
  roasted_at date,
  best_from date,
  acidity smallint CHECK (acidity BETWEEN 1 AND 10),
  sweetness smallint CHECK (sweetness BETWEEN 1 AND 10),
  body smallint CHECK (body BETWEEN 1 AND 10),
  aftertaste smallint CHECK (aftertaste BETWEEN 1 AND 10),
  total_score smallint,
  flavor_tags text[] NOT NULL DEFAULT '{}',
  memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cafe_visits (
  id serial PRIMARY KEY,
  menu text NOT NULL,
  cafe_name text NOT NULL,
  visited_at date,
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  price integer CHECK (price >= 0),
  brew_method text,
  country text,
  variety text,
  process text,
  is_decaf boolean NOT NULL DEFAULT false,
  flavor_tags text[] NOT NULL DEFAULT '{}',
  address text,
  map_url text,
  mood_memo text,
  memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE photos (
  id serial PRIMARY KEY,
  bean_id integer REFERENCES beans (id) ON DELETE CASCADE,
  cafe_visit_id integer REFERENCES cafe_visits (id) ON DELETE CASCADE,
  file_name text NOT NULL,
  thumb_name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_thumbnail boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((bean_id IS NULL) <> (cafe_visit_id IS NULL))
);

CREATE INDEX photos_bean_id_idx ON photos (bean_id);
CREATE INDEX photos_cafe_visit_id_idx ON photos (cafe_visit_id);
CREATE UNIQUE INDEX photos_one_thumbnail_per_bean ON photos (bean_id) WHERE is_thumbnail AND bean_id IS NOT NULL;
CREATE UNIQUE INDEX photos_one_thumbnail_per_cafe_visit ON photos (cafe_visit_id) WHERE is_thumbnail AND cafe_visit_id IS NOT NULL;
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm test test/migrate.test.ts`
Expected: 5개 PASS (`.env`에 `TEST_DATABASE_URL`이 있으므로 skip 아님). 스키마 생성 권한 오류가 나면 중단하고 사용자에게 DB 권한(CREATE)을 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "feat: PostgreSQL 풀과 마이그레이션

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 필드 정의와 입력 검증

**Files:**
- Create: `src/fields.ts`, `src/resources.ts`
- Test: `test/fields.test.ts`, `test/resources.test.ts`

**Interfaces:**
- Produces (`src/fields.ts`):
  - `type FieldType = 'text' | 'textarea' | 'url' | 'date' | 'int' | 'score' | 'rating' | 'tags' | 'bool'`
  - `type FieldDef = { name; label; type; required?; max?; min?; unit?; placeholder?; wide?; linkText? }`
  - `type Section = { title: string; fields: FieldDef[]; showTotal?: boolean }`
  - `BEAN_SECTIONS`, `CAFE_SECTIONS: Section[]`
  - `toColumn(name: string): string` (camelCase → snake_case), `allFields(sections): FieldDef[]`, `findField(sections, name): FieldDef | undefined`
  - `toTagList(value: unknown): string[]`, `buildSchema(sections)`(zod object), `fieldErrors(error: ZodError): Record<string, string>`
  - `formValues(sections, source: Record<string, unknown> | null): Record<string, string | boolean>`
- Produces (`src/resources.ts`):
  - `type Kind = 'bean' | 'cafe'`
  - `type PhotoRow = { id; bean_id: number | null; cafe_visit_id: number | null; file_name; thumb_name; sort_order; is_thumbnail; created_at: Date }`
  - `type PhotoDto = { id: number; url: string; thumbUrl: string; isThumbnail: boolean; sortOrder: number }`
  - `type Entity = Record<string, unknown> & { id: number; createdAt: Date; updatedAt: Date; photos: PhotoDto[]; thumbnailUrl: string | null }`
  - `type ResourceDef = { kind; label; shortLabel; table; path; photoFk; sections; schema; card: { title; subtitle; date; score; scoreMax; summary?; meta: string[] }; derived: string[]; derive(data) }`
  - `beanDef`, `cafeVisitDef`, `DEFS: Record<Kind, ResourceDef>`
  - `columnsOf(def): [key: string, column: string][]`
  - `prepare(def, body: unknown): { ok: true; data: Record<string, unknown> } | { ok: false; errors: Record<string, string> }`
  - `computeTotalScore(data: Record<string, unknown>): number | null`
  - `toPhotoDto(row: PhotoRow): PhotoDto`, `toEntity(def, row: Record<string, unknown>, photos: PhotoRow[]): Entity`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/fields.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { BEAN_SECTIONS, formValues, toColumn, toTagList } from '../src/fields.js'

describe('toColumn', () => {
  it.each([
    ['name', 'name'],
    ['roastLevel', 'roast_level'],
    ['weightG', 'weight_g'],
    ['isDecaf', 'is_decaf'],
    ['cafeName', 'cafe_name'],
  ])('%s → %s', (name, column) => {
    expect(toColumn(name)).toBe(column)
  })
})

describe('toTagList', () => {
  it('쉼표로 나누고 공백·# 제거, 중복 제거', () => {
    expect(toTagList(' 베리, #자스민,, 베리 ,꿀 ')).toEqual(['베리', '자스민', '꿀'])
  })

  it('배열도 받는다', () => {
    expect(toTagList(['꽃', ' 꽃 ', '시트러스'])).toEqual(['꽃', '시트러스'])
  })

  it('값이 없으면 빈 배열', () => {
    expect(toTagList(undefined)).toEqual([])
  })
})

describe('formValues', () => {
  it('엔티티 값을 폼 문자열로 바꾼다', () => {
    const values = formValues(BEAN_SECTIONS, {
      name: '구지',
      price: 18000,
      flavorTags: ['베리', '자스민'],
      isDecaf: true,
      memo: null,
    })
    expect(values).toMatchObject({ name: '구지', price: '18000', flavorTags: '베리, 자스민', isDecaf: true, memo: '' })
  })

  it('제출된 본문(체크박스 on)도 그대로 다시 채운다', () => {
    const values = formValues(BEAN_SECTIONS, { name: '구지', isDecaf: 'on', flavorTags: '베리, 꿀' })
    expect(values).toMatchObject({ name: '구지', isDecaf: true, flavorTags: '베리, 꿀', shop: '' })
  })

  it('source가 null이면 빈 폼', () => {
    const values = formValues(BEAN_SECTIONS, null)
    expect(values.name).toBe('')
    expect(values.isDecaf).toBe(false)
  })
})
```

`test/resources.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { beanDef, cafeVisitDef, columnsOf, prepare, toEntity, type PhotoRow } from '../src/resources.js'

const required = { name: '에티오피아 구지', shop: '커피리브레' }

function prepared(def: typeof beanDef, body: Record<string, unknown>) {
  const result = prepare(def, body)
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.data
}

function errorsOf(def: typeof beanDef, body: Record<string, unknown>) {
  const result = prepare(def, body)
  if (result.ok) throw new Error('검증 실패를 기대했습니다')
  return result.errors
}

describe('prepare(beanDef)', () => {
  it('필수값만 있으면 나머지는 null·기본값', () => {
    expect(prepared(beanDef, required)).toMatchObject({
      name: '에티오피아 구지',
      shop: '커피리브레',
      country: null,
      price: null,
      roastedAt: null,
      isDecaf: false,
      flavorTags: [],
      totalScore: null,
    })
  })

  it('폼 문자열을 알맞은 타입으로 바꾼다', () => {
    const data = prepared(beanDef, {
      ...required,
      name: '  에티오피아 구지  ',
      country: '   ',
      price: '18,000',
      weightG: '200',
      isDecaf: 'on',
      flavorTags: '베리, 자스민',
      purchasedAt: '2026-10-01',
      url: 'https://example.com/guji',
    })
    expect(data).toMatchObject({
      name: '에티오피아 구지',
      country: null,
      price: 18000,
      weightG: 200,
      isDecaf: true,
      flavorTags: ['베리', '자스민'],
      purchasedAt: '2026-10-01',
      url: 'https://example.com/guji',
    })
  })

  it('네 점수가 모두 있으면 총점을 계산한다', () => {
    const data = prepared(beanDef, { ...required, acidity: '8', sweetness: '7', body: '6', aftertaste: '9' })
    expect(data).toMatchObject({ acidity: 8, sweetness: 7, body: 6, aftertaste: 9, totalScore: 30 })
  })

  it('점수가 하나라도 비면 총점은 null', () => {
    expect(prepared(beanDef, { ...required, acidity: '8', sweetness: '7', body: '6' }).totalScore).toBeNull()
  })

  it('필드별 오류 메시지를 돌려준다', () => {
    const errors = errorsOf(beanDef, {
      shop: '리브레',
      acidity: '11',
      price: 'abc',
      purchasedAt: '2026/10/01',
      url: 'javascript:alert(1)',
    })
    expect(errors).toEqual({
      name: '원두명 항목은 필수입니다',
      acidity: '10 이하여야 합니다',
      price: '숫자를 입력하세요',
      purchasedAt: '날짜는 YYYY-MM-DD 형식이어야 합니다',
      url: 'http:// 또는 https:// 로 시작하는 주소를 입력하세요',
    })
  })

  it('알 수 없는 필드는 버린다', () => {
    expect(prepared(beanDef, { ...required, id: 99, hacked: true })).not.toHaveProperty('hacked')
  })
})

describe('prepare(cafeVisitDef)', () => {
  it('정상 입력', () => {
    expect(
      prepared(cafeVisitDef, { menu: '게이샤 필터', cafeName: '프릳츠', rating: '4', mapUrl: 'https://map.naver.com/x' }),
    ).toMatchObject({ menu: '게이샤 필터', cafeName: '프릳츠', rating: 4, mapUrl: 'https://map.naver.com/x' })
  })

  it('별점은 1~5', () => {
    expect(errorsOf(cafeVisitDef, { menu: 'a', cafeName: 'b', rating: '6' })).toEqual({ rating: '5 이하여야 합니다' })
  })
})

describe('columnsOf', () => {
  it('폼 필드와 계산 필드를 컬럼으로 매핑한다', () => {
    const columns = new Map(columnsOf(beanDef))
    expect(columns.get('roastLevel')).toBe('roast_level')
    expect(columns.get('totalScore')).toBe('total_score')
    expect(columns.has('id')).toBe(false)
  })
})

describe('toEntity', () => {
  const row = {
    id: 3,
    name: '구지',
    shop: '리브레',
    roast_level: '라이트',
    flavor_tags: ['베리'],
    is_decaf: false,
    total_score: null,
    created_at: new Date('2026-10-01T00:00:00Z'),
    updated_at: new Date('2026-10-02T00:00:00Z'),
  }
  const photo = (id: number, isThumbnail = false): PhotoRow => ({
    id,
    bean_id: 3,
    cafe_visit_id: null,
    file_name: `p${id}.webp`,
    thumb_name: `p${id}-thumb.webp`,
    sort_order: id,
    is_thumbnail: isThumbnail,
    created_at: new Date(),
  })

  it('snake_case 행을 camelCase 엔티티로 바꾸고 없는 컬럼은 null', () => {
    const entity = toEntity(beanDef, row, [])
    expect(entity).toMatchObject({ id: 3, name: '구지', roastLevel: '라이트', flavorTags: ['베리'], country: null })
    expect(entity.createdAt).toEqual(row.created_at)
    expect(entity.thumbnailUrl).toBeNull()
  })

  it('썸네일로 지정한 사진을 우선한다', () => {
    const entity = toEntity(beanDef, row, [photo(1), photo(2, true)])
    expect(entity.photos.map((p) => p.url)).toEqual(['/uploads/p1.webp', '/uploads/p2.webp'])
    expect(entity.thumbnailUrl).toBe('/uploads/p2-thumb.webp')
  })

  it('지정이 없으면 첫 사진이 썸네일', () => {
    expect(toEntity(beanDef, row, [photo(1), photo(2)]).thumbnailUrl).toBe('/uploads/p1-thumb.webp')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm test test/fields.test.ts test/resources.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: `src/fields.ts` 구현**

```ts
import { z } from 'zod'

export type FieldType = 'text' | 'textarea' | 'url' | 'date' | 'int' | 'score' | 'rating' | 'tags' | 'bool'

export type FieldDef = {
  /** 폼·엔티티 키 (camelCase). DB 컬럼은 toColumn(name) */
  name: string
  label: string
  type: FieldType
  required?: boolean
  /** text: 최대 글자 수 / int: 최댓값 */
  max?: number
  /** int: 최솟값 (기본 0) */
  min?: number
  /** 표시 단위 (예: '원', 'g') */
  unit?: string
  placeholder?: string
  /** 폼에서 한 줄 전체를 쓴다 */
  wide?: boolean
  /** url 필드의 상세 화면 링크 문구 */
  linkText?: string
}

export type Section = { title: string; fields: FieldDef[]; showTotal?: boolean }

export const BEAN_SECTIONS: Section[] = [
  {
    title: '기본 정보',
    fields: [
      { name: 'name', label: '원두명', type: 'text', required: true, placeholder: '에티오피아 구지 함벨라' },
      { name: 'shop', label: '판매처(로스터리)', type: 'text', required: true },
      { name: 'summary', label: '간략 메모', type: 'text', max: 300, wide: true, placeholder: '카드에 보이는 한 줄 메모' },
      { name: 'url', label: '상품 URL', type: 'url', wide: true, linkText: '상품 페이지' },
    ],
  },
  {
    title: '원두',
    fields: [
      { name: 'country', label: '산지 국가', type: 'text', max: 100, placeholder: '에티오피아' },
      { name: 'region', label: '산지 지역·농장', type: 'text' },
      { name: 'variety', label: '품종', type: 'text', placeholder: '헤어룸' },
      { name: 'process', label: '가공', type: 'text', max: 100, placeholder: '내추럴' },
      { name: 'roastLevel', label: '로스팅 포인트', type: 'text', max: 50, placeholder: '라이트' },
      { name: 'isDecaf', label: '디카페인', type: 'bool' },
    ],
  },
  {
    title: '구매·로스팅',
    fields: [
      { name: 'purchasedAt', label: '구매일', type: 'date' },
      { name: 'price', label: '가격', type: 'int', unit: '원' },
      { name: 'weightG', label: '용량', type: 'int', min: 1, max: 100_000, unit: 'g' },
      { name: 'brewMethod', label: '추출방식', type: 'text', max: 100, placeholder: '핸드드립' },
      { name: 'roastedAt', label: '로스팅일', type: 'date' },
      { name: 'bestFrom', label: '최적 시음 시작일', type: 'date' },
    ],
  },
  {
    title: '커핑',
    showTotal: true,
    fields: [
      { name: 'acidity', label: '산미', type: 'score' },
      { name: 'sweetness', label: '단맛', type: 'score' },
      { name: 'body', label: '바디', type: 'score' },
      { name: 'aftertaste', label: '여운', type: 'score' },
      { name: 'flavorTags', label: '향미 노트', type: 'tags', wide: true, placeholder: '베리, 자스민, 꿀' },
      { name: 'memo', label: '메모', type: 'textarea', wide: true },
    ],
  },
]

export const CAFE_SECTIONS: Section[] = [
  {
    title: '기본 정보',
    fields: [
      { name: 'menu', label: '메뉴·원두명', type: 'text', required: true, placeholder: '게이샤 필터' },
      { name: 'cafeName', label: '카페명', type: 'text', required: true },
      { name: 'visitedAt', label: '방문일', type: 'date' },
      { name: 'rating', label: '별점', type: 'rating' },
      { name: 'price', label: '가격', type: 'int', unit: '원' },
      { name: 'brewMethod', label: '추출방식', type: 'text', max: 100, placeholder: '필터, 에스프레소, 라떼' },
    ],
  },
  {
    title: '원두',
    fields: [
      { name: 'country', label: '산지 국가', type: 'text', max: 100 },
      { name: 'variety', label: '품종', type: 'text' },
      { name: 'process', label: '가공', type: 'text', max: 100 },
      { name: 'isDecaf', label: '디카페인', type: 'bool' },
      { name: 'flavorTags', label: '향미 노트', type: 'tags', wide: true, placeholder: '꽃, 시트러스' },
    ],
  },
  {
    title: '카페',
    fields: [
      { name: 'address', label: '주소', type: 'text', max: 300, wide: true },
      { name: 'mapUrl', label: '지도 URL', type: 'url', wide: true, linkText: '지도에서 보기' },
      { name: 'moodMemo', label: '분위기 메모', type: 'textarea', max: 1000, wide: true },
    ],
  },
  {
    title: '후기',
    fields: [{ name: 'memo', label: '메모', type: 'textarea', wide: true }],
  },
]

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const toColumn = (name: string) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
export const allFields = (sections: Section[]) => sections.flatMap((s) => s.fields)
export const findField = (sections: Section[], name: string) => allFields(sections).find((f) => f.name === name)

function blankToNull(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }
  return value ?? null
}

function toNumberOrNull(value: unknown): unknown {
  if (typeof value === 'number') return value
  const v = blankToNull(value)
  return v === null ? null : Number(String(v).replaceAll(',', ''))
}

export function toTagList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.map(String) : typeof value === 'string' ? value.split(',') : []
  const tags = raw.map((t) => t.trim().replace(/^#/, '').trim()).filter(Boolean)
  return [...new Set(tags)]
}

function numberRange(field: FieldDef): [number, number] {
  if (field.type === 'score') return [1, 10]
  if (field.type === 'rating') return [1, 5]
  return [field.min ?? 0, field.max ?? 100_000_000]
}

function fieldSchema(field: FieldDef): z.ZodType {
  switch (field.type) {
    case 'text':
    case 'textarea': {
      const max = field.max ?? (field.type === 'textarea' ? 5000 : 200)
      const tooLong = `${max}자 이하로 입력하세요`
      if (field.required) {
        return z.preprocess(blankToNull, z.string({ error: `${field.label} 항목은 필수입니다` }).max(max, tooLong))
      }
      return z.preprocess(blankToNull, z.string().max(max, tooLong).nullable())
    }
    case 'url':
      return z.preprocess(
        blankToNull,
        z
          .url({ protocol: /^https?$/, error: 'http:// 또는 https:// 로 시작하는 주소를 입력하세요' })
          .max(2000, '주소가 너무 깁니다')
          .nullable(),
      )
    case 'date':
      return z.preprocess(blankToNull, z.string().regex(DATE_RE, '날짜는 YYYY-MM-DD 형식이어야 합니다').nullable())
    case 'int':
    case 'score':
    case 'rating': {
      const [min, max] = numberRange(field)
      return z.preprocess(
        toNumberOrNull,
        z
          .number({ error: '숫자를 입력하세요' })
          .int('정수를 입력하세요')
          .min(min, `${min} 이상이어야 합니다`)
          .max(max, `${max} 이하여야 합니다`)
          .nullable(),
      )
    }
    case 'tags':
      return z.preprocess(
        toTagList,
        z
          .array(z.string().max(30, '태그는 30자 이하로 입력하세요'))
          .max(20, '태그는 20개까지 입력할 수 있습니다'),
      )
    case 'bool':
      return z.preprocess((v) => v === true || v === 'on' || v === 'true', z.boolean())
  }
}

/** 섹션 정의로 폼 입력 검증 스키마를 만든다. 정의에 없는 키는 버린다. */
export function buildSchema(sections: Section[]) {
  return z.object(Object.fromEntries(allFields(sections).map((f) => [f.name, fieldSchema(f)])))
}

/** 필드 이름 → 첫 번째 오류 메시지 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_')
    errors[key] ??= issue.message
  }
  return errors
}

/** 폼을 다시 그릴 값. 저장된 엔티티와 제출된 본문 모두 받는다. */
export function formValues(sections: Section[], source: Record<string, unknown> | null): Record<string, string | boolean> {
  const values: Record<string, string | boolean> = {}
  for (const field of allFields(sections)) {
    const v = source?.[field.name]
    if (field.type === 'bool') values[field.name] = v === true || v === 'on' || v === 'true'
    else if (Array.isArray(v)) values[field.name] = v.join(', ')
    else values[field.name] = v === null || v === undefined ? '' : String(v)
  }
  return values
}
```

- [ ] **Step 4: `src/resources.ts` 구현**

```ts
import { allFields, BEAN_SECTIONS, buildSchema, CAFE_SECTIONS, fieldErrors, toColumn, type Section } from './fields.js'

export type Kind = 'bean' | 'cafe'

export type PhotoRow = {
  id: number
  bean_id: number | null
  cafe_visit_id: number | null
  file_name: string
  thumb_name: string
  sort_order: number
  is_thumbnail: boolean
  created_at: Date
}

export type PhotoDto = { id: number; url: string; thumbUrl: string; isThumbnail: boolean; sortOrder: number }

export type Entity = Record<string, unknown> & {
  id: number
  createdAt: Date
  updatedAt: Date
  photos: PhotoDto[]
  thumbnailUrl: string | null
}

export type ResourceDef = {
  kind: Kind
  /** '원두 노트' | '카페 후기' */
  label: string
  /** 카드 배지용 짧은 이름 */
  shortLabel: string
  table: 'beans' | 'cafe_visits'
  /** URL 경로 조각 */
  path: 'beans' | 'cafe-visits'
  photoFk: 'bean_id' | 'cafe_visit_id'
  sections: Section[]
  schema: ReturnType<typeof buildSchema>
  /** 카드·검색 인덱스에 쓰는 필드 이름 */
  card: { title: string; subtitle: string; date: string; score: string; scoreMax: number; summary?: string; meta: string[] }
  /** 폼에는 없고 서버가 계산해 저장하는 필드 */
  derived: string[]
  derive: (data: Record<string, unknown>) => Record<string, unknown>
}

export function computeTotalScore(data: Record<string, unknown>): number | null {
  const scores = ['acidity', 'sweetness', 'body', 'aftertaste'].map((key) => data[key])
  return scores.every((s): s is number => typeof s === 'number') ? scores.reduce((sum, s) => sum + s, 0) : null
}

export const beanDef: ResourceDef = {
  kind: 'bean',
  label: '원두 노트',
  shortLabel: '원두',
  table: 'beans',
  path: 'beans',
  photoFk: 'bean_id',
  sections: BEAN_SECTIONS,
  schema: buildSchema(BEAN_SECTIONS),
  card: {
    title: 'name',
    subtitle: 'shop',
    date: 'purchasedAt',
    score: 'totalScore',
    scoreMax: 40,
    summary: 'summary',
    meta: ['country', 'process', 'roastLevel'],
  },
  derived: ['totalScore'],
  derive: (data) => ({ totalScore: computeTotalScore(data) }),
}

export const cafeVisitDef: ResourceDef = {
  kind: 'cafe',
  label: '카페 후기',
  shortLabel: '카페',
  table: 'cafe_visits',
  path: 'cafe-visits',
  photoFk: 'cafe_visit_id',
  sections: CAFE_SECTIONS,
  schema: buildSchema(CAFE_SECTIONS),
  card: { title: 'menu', subtitle: 'cafeName', date: 'visitedAt', score: 'rating', scoreMax: 5, meta: ['visitedAt', 'brewMethod'] },
  derived: [],
  derive: () => ({}),
}

export const DEFS: Record<Kind, ResourceDef> = { bean: beanDef, cafe: cafeVisitDef }

export function columnsOf(def: ResourceDef): [key: string, column: string][] {
  return [...allFields(def.sections).map((f) => f.name), ...def.derived].map((key) => [key, toColumn(key)])
}

export type Prepared = { ok: true; data: Record<string, unknown> } | { ok: false; errors: Record<string, string> }

/** 폼 본문을 검증·변환하고 계산 필드를 붙인다 */
export function prepare(def: ResourceDef, body: unknown): Prepared {
  const result = def.schema.safeParse(body ?? {})
  if (!result.success) return { ok: false, errors: fieldErrors(result.error) }
  return { ok: true, data: { ...result.data, ...def.derive(result.data) } }
}

export function toPhotoDto(row: PhotoRow): PhotoDto {
  return {
    id: row.id,
    url: `/uploads/${row.file_name}`,
    thumbUrl: `/uploads/${row.thumb_name}`,
    isThumbnail: row.is_thumbnail,
    sortOrder: row.sort_order,
  }
}

export function toEntity(def: ResourceDef, row: Record<string, unknown>, photos: PhotoRow[]): Entity {
  const fields: Record<string, unknown> = {}
  for (const [key, column] of columnsOf(def)) fields[key] = row[column] ?? null
  const photoDtos = photos.map(toPhotoDto)
  const thumbnail = photoDtos.find((p) => p.isThumbnail) ?? photoDtos[0]
  return {
    ...fields,
    id: row.id as number,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
    photos: photoDtos,
    thumbnailUrl: thumbnail?.thumbUrl ?? null,
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm test test/fields.test.ts test/resources.test.ts && pnpm typecheck`
Expected: 모두 PASS. (만약 zod가 누락된 키에 preprocess를 실행하지 않아 `country`가 `undefined`로 나오면, `prepare`에서 `allFields(def.sections)`를 돌며 `undefined`를 `null`로 채우도록 고친다.)

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "feat: 필드 정의 기반 입력 검증과 리소스 정의

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 저장소 (CRUD + 사진 묶기)

**Files:**
- Create: `src/repository.ts`, `test/fixtures.ts`
- Test: `test/repository.test.ts`

**Interfaces:**
- Consumes: `Pool`, `createTestPool`, `resetData`, `describeDb` (Task 2), `beanDef`, `cafeVisitDef`, `columnsOf`, `toEntity`, `prepare`, `Entity`, `Kind`, `PhotoRow`, `ResourceDef` (Task 3)
- Produces:
  - `type ResourceRepo = { list(): Promise<Entity[]>; get(id: number): Promise<Entity | null>; create(data: Record<string, unknown>): Promise<Entity>; update(id: number, data: Record<string, unknown>): Promise<Entity | null>; remove(id: number): Promise<PhotoRow[] | null> }`
  - `createResourceRepo(pool: Pool, def: ResourceDef): ResourceRepo` — `list`는 id 내림차순, `update`는 `updated_at = now()`, `remove`는 삭제 전 붙어 있던 사진 행을 돌려준다(글이 없으면 `null`)
  - `type Repos = Record<Kind, ResourceRepo>`, `createRepos(pool: Pool): Repos`
  - 테스트 헬퍼 `prepared(def: ResourceDef, body: Record<string, unknown>): Record<string, unknown>` (검증 실패 시 throw)

- [ ] **Step 1: 테스트 헬퍼와 실패하는 테스트 작성**

`test/fixtures.ts`:
```ts
import { prepare, type ResourceDef } from '../src/resources.js'

/** 폼 본문을 검증·변환한 저장용 데이터. 검증에 실패하면 테스트를 깨뜨린다. */
export function prepared(def: ResourceDef, body: Record<string, unknown>): Record<string, unknown> {
  const result = prepare(def, body)
  if (!result.ok) throw new Error(`검증 실패: ${JSON.stringify(result.errors)}`)
  return result.data
}
```

`test/repository.test.ts`:
```ts
import type { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { createRepos, type Repos } from '../src/repository.js'
import { beanDef, cafeVisitDef } from '../src/resources.js'
import { createTestPool, describeDb, resetData } from './db.js'
import { prepared } from './fixtures.js'

describeDb('repository', () => {
  let pool: Pool
  let repos: Repos

  beforeAll(async () => {
    pool = await createTestPool()
    repos = createRepos(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  beforeEach(async () => {
    await resetData(pool)
  })

  it('원두 노트를 만들고 다시 읽는다', async () => {
    const created = await repos.bean.create(
      prepared(beanDef, {
        name: '에티오피아 구지',
        shop: '커피리브레',
        flavorTags: '베리, 자스민',
        roastedAt: '2026-09-28',
        acidity: '8',
        sweetness: '7',
        body: '6',
        aftertaste: '9',
        price: '18000',
        isDecaf: 'on',
      }),
    )
    expect(created).toMatchObject({
      id: 1,
      name: '에티오피아 구지',
      shop: '커피리브레',
      flavorTags: ['베리', '자스민'],
      roastedAt: '2026-09-28',
      totalScore: 30,
      price: 18000,
      isDecaf: true,
      country: null,
      photos: [],
      thumbnailUrl: null,
    })
    expect(created.createdAt).toBeInstanceOf(Date)
    expect(await repos.bean.get(created.id)).toEqual(created)
  })

  it('목록은 최근에 만든 것부터', async () => {
    await repos.bean.create(prepared(beanDef, { name: '첫째', shop: 'a' }))
    await repos.bean.create(prepared(beanDef, { name: '둘째', shop: 'b' }))
    expect((await repos.bean.list()).map((e) => e.name)).toEqual(['둘째', '첫째'])
  })

  it('없는 id는 null', async () => {
    expect(await repos.bean.get(999)).toBeNull()
    expect(await repos.bean.update(999, prepared(beanDef, { name: 'a', shop: 'b' }))).toBeNull()
    expect(await repos.bean.remove(999)).toBeNull()
  })

  it('수정은 모든 필드를 바꾸고 updated_at을 갱신한다', async () => {
    const created = await repos.bean.create(prepared(beanDef, { name: '구지', shop: '리브레', country: '에티오피아' }))
    const updated = await repos.bean.update(created.id, prepared(beanDef, { name: '구지 G1', shop: '리브레' }))
    expect(updated).toMatchObject({ id: created.id, name: '구지 G1', country: null })
    expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime())
  })

  it('카페 후기를 만든다', async () => {
    const created = await repos.cafe.create(
      prepared(cafeVisitDef, { menu: '게이샤 필터', cafeName: '프릳츠', rating: '4', visitedAt: '2026-10-05' }),
    )
    expect(created).toMatchObject({ id: 1, menu: '게이샤 필터', cafeName: '프릳츠', rating: 4, visitedAt: '2026-10-05' })
    expect(await repos.cafe.list()).toHaveLength(1)
  })

  it('사진 행을 엔티티에 붙인다', async () => {
    const bean = await repos.bean.create(prepared(beanDef, { name: '구지', shop: '리브레' }))
    const insert = 'INSERT INTO photos (bean_id, file_name, thumb_name, sort_order, is_thumbnail) VALUES ($1, $2, $3, $4, $5)'
    await pool.query(insert, [bean.id, 'b.webp', 'b-thumb.webp', 1, true])
    await pool.query(insert, [bean.id, 'a.webp', 'a-thumb.webp', 0, false])
    const loaded = await repos.bean.get(bean.id)
    expect(loaded?.photos.map((p) => p.url)).toEqual(['/uploads/a.webp', '/uploads/b.webp'])
    expect(loaded?.thumbnailUrl).toBe('/uploads/b-thumb.webp')
    expect((await repos.bean.list())[0].photos).toHaveLength(2)
  })

  it('삭제하면 붙어 있던 사진 행을 돌려준다', async () => {
    const bean = await repos.bean.create(prepared(beanDef, { name: '구지', shop: '리브레' }))
    await pool.query("INSERT INTO photos (bean_id, file_name, thumb_name) VALUES ($1, 'a.webp', 'a-thumb.webp')", [bean.id])
    const removed = await repos.bean.remove(bean.id)
    expect(removed?.map((p) => p.file_name)).toEqual(['a.webp'])
    expect(await repos.bean.get(bean.id)).toBeNull()
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM photos')
    expect(rows[0].n).toBe(0)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm test test/repository.test.ts`
Expected: FAIL — `Cannot find module '../src/repository.js'`

- [ ] **Step 3: `src/repository.ts` 구현**

```ts
import type { Pool } from 'pg'
import { beanDef, cafeVisitDef, columnsOf, toEntity, type Entity, type Kind, type PhotoRow, type ResourceDef } from './resources.js'

export type ResourceRepo = {
  list(): Promise<Entity[]>
  get(id: number): Promise<Entity | null>
  create(data: Record<string, unknown>): Promise<Entity>
  update(id: number, data: Record<string, unknown>): Promise<Entity | null>
  /** 삭제된 글에 붙어 있던 사진 행(파일 정리용). 글이 없으면 null */
  remove(id: number): Promise<PhotoRow[] | null>
}

export type Repos = Record<Kind, ResourceRepo>

export function createResourceRepo(pool: Pool, def: ResourceDef): ResourceRepo {
  // 테이블·컬럼 이름은 코드의 정의에서만 오므로 SQL에 직접 넣어도 안전하다
  const columns = columnsOf(def)
  const names = columns.map(([, column]) => column)
  const values = (data: Record<string, unknown>) => columns.map(([key]) => data[key] ?? null)

  async function hydrate(rows: Record<string, unknown>[]): Promise<Entity[]> {
    if (rows.length === 0) return []
    const ids = rows.map((row) => row.id as number)
    const { rows: photos } = await pool.query<PhotoRow>(
      `SELECT * FROM photos WHERE ${def.photoFk} = ANY($1::int[]) ORDER BY sort_order, id`,
      [ids],
    )
    const byOwner = new Map<number, PhotoRow[]>()
    for (const photo of photos) {
      const ownerId = photo[def.photoFk] as number
      const list = byOwner.get(ownerId) ?? []
      list.push(photo)
      byOwner.set(ownerId, list)
    }
    return rows.map((row) => toEntity(def, row, byOwner.get(row.id as number) ?? []))
  }

  return {
    async list() {
      const { rows } = await pool.query(`SELECT * FROM ${def.table} ORDER BY id DESC`)
      return hydrate(rows)
    },

    async get(id) {
      const { rows } = await pool.query(`SELECT * FROM ${def.table} WHERE id = $1`, [id])
      const [entity] = await hydrate(rows)
      return entity ?? null
    },

    async create(data) {
      const params = names.map((_, i) => `$${i + 1}`).join(', ')
      const { rows } = await pool.query(
        `INSERT INTO ${def.table} (${names.join(', ')}) VALUES (${params}) RETURNING *`,
        values(data),
      )
      const [entity] = await hydrate(rows)
      return entity
    },

    async update(id, data) {
      const sets = names.map((name, i) => `${name} = $${i + 1}`).join(', ')
      const { rows } = await pool.query(
        `UPDATE ${def.table} SET ${sets}, updated_at = now() WHERE id = $${names.length + 1} RETURNING *`,
        [...values(data), id],
      )
      const [entity] = await hydrate(rows)
      return entity ?? null
    },

    async remove(id) {
      const { rows: photos } = await pool.query<PhotoRow>(`SELECT * FROM photos WHERE ${def.photoFk} = $1`, [id])
      const { rowCount } = await pool.query(`DELETE FROM ${def.table} WHERE id = $1`, [id])
      return rowCount ? photos : null
    },
  }
}

export function createRepos(pool: Pool): Repos {
  return { bean: createResourceRepo(pool, beanDef), cafe: createResourceRepo(pool, cafeVisitDef) }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test test/repository.test.ts && pnpm typecheck`
Expected: 7개 PASS, 타입 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat: 원두·카페 저장소와 사진 묶기

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 검색 인덱스와 뷰 모델

**Files:**
- Create: `src/view-helpers.ts`, `src/search-index.ts`, `src/view-models.ts`
- Modify: `test/fixtures.ts` (엔티티 픽스처 추가)
- Test: `test/view-helpers.test.ts`, `test/search-index.test.ts`, `test/view-models.test.ts`

**Interfaces:**
- Consumes: `FieldDef`, `FieldType`, `allFields`, `findField`, `BEAN_SECTIONS` (Task 3), `Entity`, `Kind`, `PhotoDto`, `ResourceDef`, `beanDef`, `cafeVisitDef` (Task 3)
- Produces (`src/view-helpers.ts`):
  - `todayString(now?: Date): string` (로컬 `YYYY-MM-DD`), `isReadyToDrink(bestFrom: unknown, today: string): boolean`
  - `formatDate(date: string): string` (`2026.10.01`), `formatNumber(value: number): string`, `stars(rating: number): string` (`★★★★☆`)
  - `jsonForScript(value: unknown): string`, `displayValue(field: FieldDef, value: unknown): string | null`
- Produces (`src/search-index.ts`):
  - `type IndexEntry = { key: string; kind: Kind; title: string; subtitle: string; date: string; createdAt: string; score: number | null; price: number | null; country: string | null; roastedAt: string | null; isDecaf: boolean; searchText: string }`
  - `normalize(value: string): string`, `entryKey(def: ResourceDef, id: number): string`, `toIndexEntry(def: ResourceDef, entity: Entity): IndexEntry`
- Produces (`src/view-models.ts`):
  - `DEFAULT_SCOPE: Kind = 'bean'`
  - `type CardModel = { key; kind; kindLabel; href; title; subtitle; meta: string; summary: string | null; tags: string[]; thumbnailUrl: string | null; isDecaf: boolean; ready: boolean; score: CardScore | null; hidden: boolean }`, `type CardScore = { type: 'total'; value: number; max: number } | { type: 'rating'; value: number }`
  - `toCardModel(def, entity, today: string): CardModel`
  - `type HomeModel = { title: string; cards: CardModel[]; indexJson: string; counts: Record<Kind, number>; shops: string[] }`, `buildHomeModel(beans: Entity[], cafes: Entity[], today?: string): HomeModel`
  - `type DetailModel = { title; heading; key; kindLabel; subtitle; tags: string[]; rows: { label: string; value: string }[]; memos: { label: string; text: string }[]; links: { label: string; href: string }[]; photos: PhotoDto[]; editHref: string }`, `buildDetailModel(def, entity): DetailModel`
  - 테스트 픽스처 `beanEntity(overrides?)`, `cafeEntity(overrides?)`

- [ ] **Step 1: 픽스처 추가**

`test/fixtures.ts`를 다음으로 바꾼다:
```ts
import { prepare, type Entity, type ResourceDef } from '../src/resources.js'

/** 폼 본문을 검증·변환한 저장용 데이터. 검증에 실패하면 테스트를 깨뜨린다. */
export function prepared(def: ResourceDef, body: Record<string, unknown>): Record<string, unknown> {
  const result = prepare(def, body)
  if (!result.ok) throw new Error(`검증 실패: ${JSON.stringify(result.errors)}`)
  return result.data
}

export function beanEntity(overrides: Record<string, unknown> = {}): Entity {
  return {
    id: 1,
    name: '에티오피아 구지',
    shop: '커피리브레',
    summary: '산뜻한 베리 향',
    url: 'https://example.com/guji',
    country: '에티오피아',
    region: '구지',
    variety: '헤어룸',
    process: '내추럴',
    roastLevel: '라이트',
    isDecaf: false,
    purchasedAt: '2026-10-01',
    price: 18000,
    weightG: 200,
    brewMethod: '핸드드립',
    roastedAt: '2026-09-28',
    bestFrom: '2026-10-05',
    acidity: 8,
    sweetness: 7,
    body: 6,
    aftertaste: 9,
    totalScore: 30,
    flavorTags: ['베리', '자스민'],
    memo: '두 번째 추출이 더 좋았다',
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    updatedAt: new Date('2026-10-01T10:00:00.000Z'),
    photos: [],
    thumbnailUrl: null,
    ...overrides,
  } as Entity
}

export function cafeEntity(overrides: Record<string, unknown> = {}): Entity {
  return {
    id: 1,
    menu: '게이샤 필터',
    cafeName: '프릳츠',
    visitedAt: '2026-10-05',
    rating: 4,
    price: 9000,
    brewMethod: '필터',
    country: '파나마',
    variety: '게이샤',
    process: '워시드',
    isDecaf: false,
    flavorTags: ['꽃', '시트러스'],
    address: '서울 마포구',
    mapUrl: 'https://map.naver.com/p/fritz',
    moodMemo: '창가 자리가 좋다',
    memo: '산미가 깔끔하다',
    createdAt: new Date('2026-10-05T10:00:00.000Z'),
    updatedAt: new Date('2026-10-05T10:00:00.000Z'),
    photos: [],
    thumbnailUrl: null,
    ...overrides,
  } as Entity
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`test/view-helpers.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { BEAN_SECTIONS, CAFE_SECTIONS, findField } from '../src/fields.js'
import {
  displayValue,
  formatDate,
  formatNumber,
  isReadyToDrink,
  jsonForScript,
  stars,
  todayString,
} from '../src/view-helpers.js'

const beanField = (name: string) => findField(BEAN_SECTIONS, name)!
const cafeField = (name: string) => findField(CAFE_SECTIONS, name)!

describe('날짜·숫자', () => {
  it('todayString은 로컬 날짜', () => {
    expect(todayString(new Date(2026, 9, 8, 23, 30))).toBe('2026-10-08')
  })

  it('isReadyToDrink', () => {
    expect(isReadyToDrink('2026-10-05', '2026-10-08')).toBe(true)
    expect(isReadyToDrink('2026-10-08', '2026-10-08')).toBe(true)
    expect(isReadyToDrink('2026-10-09', '2026-10-08')).toBe(false)
    expect(isReadyToDrink(null, '2026-10-08')).toBe(false)
  })

  it('formatDate, formatNumber, stars', () => {
    expect(formatDate('2026-10-01')).toBe('2026.10.01')
    expect(formatNumber(18000)).toBe('18,000')
    expect(stars(4)).toBe('★★★★☆')
  })
})

describe('jsonForScript', () => {
  it('<script>를 닫지 못하게 < 를 이스케이프한다', () => {
    const json = jsonForScript({ name: '</script><b>' })
    expect(json).not.toContain('</script>')
    expect(json).toContain('\\u003c/script>')
    expect(JSON.parse(json)).toEqual({ name: '</script><b>' })
  })
})

describe('displayValue', () => {
  it.each([
    ['price', 18000, '18,000원'],
    ['weightG', 200, '200g'],
    ['acidity', 8, '8 / 10'],
    ['purchasedAt', '2026-10-01', '2026.10.01'],
    ['isDecaf', true, '예'],
    ['isDecaf', false, null],
    ['flavorTags', ['베리', '꿀'], '베리, 꿀'],
    ['country', '에티오피아', '에티오피아'],
    ['country', '', null],
    ['country', null, null],
  ])('원두 %s = %j → %j', (name, value, expected) => {
    expect(displayValue(beanField(name), value)).toBe(expected)
  })

  it('별점은 별 문자로', () => {
    expect(displayValue(cafeField('rating'), 4)).toBe('★★★★☆')
  })
})
```

`test/search-index.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { beanDef, cafeVisitDef } from '../src/resources.js'
import { normalize, toIndexEntry } from '../src/search-index.js'
import { beanEntity, cafeEntity } from './fixtures.js'

describe('normalize', () => {
  it('소문자, 공백 정리', () => {
    expect(normalize('  Ethiopia   GUJI ')).toBe('ethiopia guji')
  })

  it('조합형 한글을 완성형으로', () => {
    expect(normalize('\u1100\u1161')).toBe('가')
  })
})

describe('toIndexEntry', () => {
  it('원두 노트', () => {
    const entry = toIndexEntry(beanDef, beanEntity())
    expect(entry).toMatchObject({
      key: 'bean-1',
      kind: 'bean',
      title: '에티오피아 구지',
      subtitle: '커피리브레',
      date: '2026-10-01',
      createdAt: '2026-10-01T10:00:00.000Z',
      score: 0.75,
      price: 18000,
      country: '에티오피아',
      roastedAt: '2026-09-28',
      isDecaf: false,
    })
    expect(entry.searchText).toContain('커피리브레')
    expect(entry.searchText).toContain('자스민')
    expect(entry.searchText).toContain('두 번째 추출')
    expect(entry.searchText).not.toContain('example.com')
    expect(entry.searchText).not.toContain('decaf')
  })

  it('디카페인이면 검색어 "디카페인 decaf"를 포함한다', () => {
    expect(toIndexEntry(beanDef, beanEntity({ isDecaf: true })).searchText).toContain('디카페인 decaf')
  })

  it('날짜가 없으면 생성일, 점수가 없으면 null', () => {
    const entry = toIndexEntry(beanDef, beanEntity({ purchasedAt: null, totalScore: null }))
    expect(entry.date).toBe('2026-10-01')
    expect(entry.score).toBeNull()
  })

  it('카페 후기', () => {
    const entry = toIndexEntry(cafeVisitDef, cafeEntity())
    expect(entry).toMatchObject({
      key: 'cafe-1',
      kind: 'cafe',
      title: '게이샤 필터',
      subtitle: '프릳츠',
      date: '2026-10-05',
      score: 0.8,
      price: 9000,
      country: '파나마',
      roastedAt: null,
    })
    expect(entry.searchText).toContain('서울 마포구')
    expect(entry.searchText).toContain('창가')
    expect(entry.searchText).not.toContain('map.naver')
  })
})
```

`test/view-models.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { beanDef, cafeVisitDef } from '../src/resources.js'
import { buildDetailModel, buildHomeModel, toCardModel } from '../src/view-models.js'
import { beanEntity, cafeEntity } from './fixtures.js'

const TODAY = '2026-10-08'

describe('toCardModel', () => {
  it('원두 카드', () => {
    expect(toCardModel(beanDef, beanEntity(), TODAY)).toEqual({
      key: 'bean-1',
      kind: 'bean',
      kindLabel: '원두',
      href: '/beans/1',
      title: '에티오피아 구지',
      subtitle: '커피리브레',
      meta: '에티오피아 · 내추럴 · 라이트',
      summary: '산뜻한 베리 향',
      tags: ['베리', '자스민'],
      thumbnailUrl: null,
      isDecaf: false,
      ready: true,
      score: { type: 'total', value: 30, max: 40 },
      hidden: false,
    })
  })

  it('최적 시음일 전이면 시음 적기가 아니다', () => {
    expect(toCardModel(beanDef, beanEntity(), '2026-10-04').ready).toBe(false)
  })

  it('태그는 4개까지, 점수가 없으면 null', () => {
    const card = toCardModel(beanDef, beanEntity({ flavorTags: ['a', 'b', 'c', 'd', 'e'], totalScore: null }), TODAY)
    expect(card.tags).toEqual(['a', 'b', 'c', 'd'])
    expect(card.score).toBeNull()
  })

  it('카페 카드는 기본 범위가 아니라 처음에 숨긴다', () => {
    expect(toCardModel(cafeVisitDef, cafeEntity(), TODAY)).toMatchObject({
      key: 'cafe-1',
      kindLabel: '카페',
      href: '/cafe-visits/1',
      meta: '2026.10.05 · 필터',
      summary: null,
      ready: false,
      score: { type: 'rating', value: 4 },
      hidden: true,
    })
  })
})

describe('buildHomeModel', () => {
  it('카드·인덱스·개수·가게 목록', () => {
    const model = buildHomeModel(
      [
        beanEntity({ id: 1, shop: '커피리브레' }),
        beanEntity({ id: 2, shop: '나무사이로' }),
        beanEntity({ id: 3, shop: '커피리브레', name: '</script>' }),
      ],
      [cafeEntity()],
      TODAY,
    )
    expect(model.title).toBe('')
    expect(model.cards.map((c) => c.key)).toEqual(['bean-1', 'bean-2', 'bean-3', 'cafe-1'])
    expect(model.counts).toEqual({ bean: 3, cafe: 1 })
    expect(model.shops).toEqual(['나무사이로', '커피리브레'])
    expect(model.indexJson).not.toContain('</script>')
    expect(JSON.parse(model.indexJson)).toHaveLength(4)
  })
})

describe('buildDetailModel', () => {
  it('원두 상세', () => {
    const model = buildDetailModel(beanDef, beanEntity())
    expect(model).toMatchObject({
      title: '에티오피아 구지',
      heading: '에티오피아 구지',
      key: 'bean-1',
      kindLabel: '원두 노트',
      subtitle: '커피리브레',
      tags: ['베리', '자스민'],
      editHref: '/admin/beans/1/edit',
      photos: [],
    })
    expect(model.rows).toEqual(
      expect.arrayContaining([
        { label: '산지 국가', value: '에티오피아' },
        { label: '가격', value: '18,000원' },
        { label: '용량', value: '200g' },
        { label: '산미', value: '8 / 10' },
        { label: '최적 시음 시작일', value: '2026.10.05' },
        { label: '커핑 총점', value: '30 / 40' },
      ]),
    )
    const labels = model.rows.map((r) => r.label)
    for (const hidden of ['원두명', '판매처(로스터리)', '간략 메모', '상품 URL', '향미 노트', '메모', '디카페인']) {
      expect(labels).not.toContain(hidden)
    }
    expect(model.memos).toEqual([
      { label: '간략 메모', text: '산뜻한 베리 향' },
      { label: '메모', text: '두 번째 추출이 더 좋았다' },
    ])
    expect(model.links).toEqual([{ label: '상품 페이지', href: 'https://example.com/guji' }])
  })

  it('디카페인이면 행에 표시', () => {
    expect(buildDetailModel(beanDef, beanEntity({ isDecaf: true })).rows).toContainEqual({ label: '디카페인', value: '예' })
  })

  it('카페 상세', () => {
    const model = buildDetailModel(cafeVisitDef, cafeEntity())
    expect(model.kindLabel).toBe('카페 후기')
    expect(model.rows).toEqual(
      expect.arrayContaining([
        { label: '방문일', value: '2026.10.05' },
        { label: '별점', value: '★★★★☆' },
        { label: '주소', value: '서울 마포구' },
      ]),
    )
    expect(model.memos.map((m) => m.label)).toEqual(['분위기 메모', '메모'])
    expect(model.links).toEqual([{ label: '지도에서 보기', href: 'https://map.naver.com/p/fritz' }])
    expect(model.editHref).toBe('/admin/cafe-visits/1/edit')
  })
})
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `pnpm test test/view-helpers.test.ts test/search-index.test.ts test/view-models.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 4: `src/view-helpers.ts` 구현**

```ts
import type { FieldDef } from './fields.js'

export function todayString(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 최적 시음 시작일이 오늘이거나 지났으면 true */
export function isReadyToDrink(bestFrom: unknown, today: string): boolean {
  return typeof bestFrom === 'string' && bestFrom <= today
}

export const formatDate = (date: string) => date.replaceAll('-', '.')

export const formatNumber = (value: number) => value.toLocaleString('ko-KR')

export const stars = (rating: number) => '★'.repeat(rating) + '☆'.repeat(Math.max(0, 5 - rating))

/** <script type="application/json"> 안에 넣어도 태그가 닫히지 않는 JSON */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/** 상세 화면에 보여줄 문자열. 비어 있으면 null */
export function displayValue(field: FieldDef, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  switch (field.type) {
    case 'date':
      return formatDate(String(value))
    case 'int':
      return `${formatNumber(Number(value))}${field.unit ?? ''}`
    case 'score':
      return `${value} / 10`
    case 'rating':
      return stars(Number(value))
    case 'bool':
      return value === true ? '예' : null
    case 'tags':
      return Array.isArray(value) && value.length > 0 ? value.join(', ') : null
    default:
      return String(value)
  }
}
```

- [ ] **Step 5: `src/search-index.ts` 구현**

```ts
import { allFields, type FieldType } from './fields.js'
import type { Entity, Kind, ResourceDef } from './resources.js'

/** 브라우저가 검색·정렬에 쓰는 카드 요약 */
export type IndexEntry = {
  key: string
  kind: Kind
  title: string
  subtitle: string
  /** 정렬용 날짜 (원두: 구매일, 카페: 방문일, 없으면 생성일) */
  date: string
  createdAt: string
  /** 0~1 비율 (원두 총점/40, 카페 별점/5) */
  score: number | null
  price: number | null
  country: string | null
  roastedAt: string | null
  isDecaf: boolean
  searchText: string
}

const SEARCHABLE: FieldType[] = ['text', 'textarea', 'tags']
const DECAF_WORDS = '디카페인 decaf'

/** 검색용 정규화. 브라우저 public/js/query.js 의 normalize 와 같은 규칙이어야 한다. */
export function normalize(value: string): string {
  return value.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
}

export const entryKey = (def: ResourceDef, id: number) => `${def.kind}-${id}`

const textOrNull = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null)
const numberOrNull = (value: unknown) => (typeof value === 'number' ? value : null)

export function toIndexEntry(def: ResourceDef, entity: Entity): IndexEntry {
  const score = numberOrNull(entity[def.card.score])
  const parts: unknown[] = allFields(def.sections)
    .filter((field) => SEARCHABLE.includes(field.type))
    .flatMap((field) => {
      const value = entity[field.name]
      return Array.isArray(value) ? value : [value]
    })
  if (entity.isDecaf === true) parts.push(DECAF_WORDS)
  return {
    key: entryKey(def, entity.id),
    kind: def.kind,
    title: String(entity[def.card.title]),
    subtitle: String(entity[def.card.subtitle]),
    date: textOrNull(entity[def.card.date]) ?? entity.createdAt.toISOString().slice(0, 10),
    createdAt: entity.createdAt.toISOString(),
    score: score === null ? null : score / def.card.scoreMax,
    price: numberOrNull(entity.price),
    country: textOrNull(entity.country),
    roastedAt: textOrNull(entity.roastedAt),
    isDecaf: entity.isDecaf === true,
    searchText: normalize(parts.filter((p): p is string => typeof p === 'string' && p !== '').join(' ')),
  }
}
```

- [ ] **Step 6: `src/view-models.ts` 구현**

```ts
import { allFields, findField, type FieldType } from './fields.js'
import { beanDef, cafeVisitDef, type Entity, type Kind, type PhotoDto, type ResourceDef } from './resources.js'
import { entryKey, toIndexEntry } from './search-index.js'
import { displayValue, isReadyToDrink, jsonForScript, todayString } from './view-helpers.js'

/** 홈 화면 첫 탭 */
export const DEFAULT_SCOPE: Kind = 'bean'

export type CardScore = { type: 'total'; value: number; max: number } | { type: 'rating'; value: number }

export type CardModel = {
  key: string
  kind: Kind
  kindLabel: string
  href: string
  title: string
  subtitle: string
  meta: string
  summary: string | null
  tags: string[]
  thumbnailUrl: string | null
  isDecaf: boolean
  ready: boolean
  score: CardScore | null
  hidden: boolean
}

export type HomeModel = {
  title: string
  cards: CardModel[]
  indexJson: string
  counts: Record<Kind, number>
  shops: string[]
}

export type DetailModel = {
  title: string
  heading: string
  key: string
  kindLabel: string
  subtitle: string
  tags: string[]
  rows: { label: string; value: string }[]
  memos: { label: string; text: string }[]
  links: { label: string; href: string }[]
  photos: PhotoDto[]
  editHref: string
}

const collator = new Intl.Collator('ko')
const tagsOf = (entity: Entity) => (Array.isArray(entity.flavorTags) ? (entity.flavorTags as string[]) : [])

export function toCardModel(def: ResourceDef, entity: Entity, today: string): CardModel {
  const scoreValue = entity[def.card.score]
  const meta = def.card.meta
    .map((name) => {
      const field = findField(def.sections, name)
      return field ? displayValue(field, entity[name]) : null
    })
    .filter((value): value is string => value !== null)
  const summary = def.card.summary ? entity[def.card.summary] : null
  let score: CardScore | null = null
  if (typeof scoreValue === 'number') {
    score = def.kind === 'bean' ? { type: 'total', value: scoreValue, max: def.card.scoreMax } : { type: 'rating', value: scoreValue }
  }
  return {
    key: entryKey(def, entity.id),
    kind: def.kind,
    kindLabel: def.shortLabel,
    href: `/${def.path}/${entity.id}`,
    title: String(entity[def.card.title]),
    subtitle: String(entity[def.card.subtitle]),
    meta: meta.join(' · '),
    summary: typeof summary === 'string' && summary !== '' ? summary : null,
    tags: tagsOf(entity).slice(0, 4),
    thumbnailUrl: entity.thumbnailUrl,
    isDecaf: entity.isDecaf === true,
    ready: def.kind === 'bean' && isReadyToDrink(entity.bestFrom, today),
    score,
    hidden: def.kind !== DEFAULT_SCOPE,
  }
}

export function buildHomeModel(beans: Entity[], cafes: Entity[], today: string = todayString()): HomeModel {
  const pairs: [ResourceDef, Entity][] = [
    ...beans.map((entity): [ResourceDef, Entity] => [beanDef, entity]),
    ...cafes.map((entity): [ResourceDef, Entity] => [cafeVisitDef, entity]),
  ]
  return {
    title: '',
    cards: pairs.map(([def, entity]) => toCardModel(def, entity, today)),
    indexJson: jsonForScript(pairs.map(([def, entity]) => toIndexEntry(def, entity))),
    counts: { bean: beans.length, cafe: cafes.length },
    shops: [...new Set(beans.map((bean) => String(bean.shop)))].sort((a, b) => collator.compare(a, b)),
  }
}

/** 상세 표의 행에서 빼는 타입 (메모·링크·태그는 따로 보여준다) */
const NOT_IN_ROWS: FieldType[] = ['textarea', 'url', 'tags']

export function buildDetailModel(def: ResourceDef, entity: Entity): DetailModel {
  const fields = allFields(def.sections)
  const skip = new Set([def.card.title, def.card.subtitle, def.card.summary])
  const rows = fields
    .filter((field) => !skip.has(field.name) && !NOT_IN_ROWS.includes(field.type))
    .flatMap((field) => {
      const value = displayValue(field, entity[field.name])
      return value === null ? [] : [{ label: field.label, value }]
    })
  if (def.kind === 'bean' && typeof entity.totalScore === 'number') {
    rows.push({ label: '커핑 총점', value: `${entity.totalScore} / ${def.card.scoreMax}` })
  }
  const memos = fields
    .filter((field) => field.name === def.card.summary || field.type === 'textarea')
    .flatMap((field) => {
      const text = entity[field.name]
      return typeof text === 'string' && text !== '' ? [{ label: field.label, text }] : []
    })
  const links = fields
    .filter((field) => field.type === 'url')
    .flatMap((field) => {
      const href = entity[field.name]
      return typeof href === 'string' && href !== '' ? [{ label: field.linkText ?? field.label, href }] : []
    })
  const heading = String(entity[def.card.title])
  return {
    title: heading,
    heading,
    key: entryKey(def, entity.id),
    kindLabel: def.label,
    subtitle: String(entity[def.card.subtitle]),
    tags: tagsOf(entity),
    rows,
    memos,
    links,
    photos: entity.photos,
    editHref: `/admin/${def.path}/${entity.id}/edit`,
  }
}
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `pnpm test test/view-helpers.test.ts test/search-index.test.ts test/view-models.test.ts && pnpm typecheck`
Expected: 모두 PASS, 타입 오류 없음

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "feat: 검색 인덱스와 카드·상세 뷰 모델

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 브라우저 검색·필터·정렬 로직

**Files:**
- Create: `public/js/query.js`
- Test: `test/query.test.ts`

**Interfaces:**
- Consumes: `IndexEntry` 타입 (Task 5, JSDoc `import('../../src/search-index.js').IndexEntry`)
- Produces (JSDoc 타입은 TS에서 `import type { Query } from '../public/js/query.js'`로 쓸 수 있다):
  - `Scope = 'all' | 'bean' | 'cafe'`, `SortKey = 'newest' | 'oldest' | 'score' | 'name' | 'priceAsc' | 'priceDesc' | 'roasted' | 'country'`
  - `Query = { scope: Scope; text: string; sort: SortKey; shop: string; decafOnly: boolean }`, `IndexEntry`(재노출)
  - `DEFAULT_QUERY: Readonly<Query>` (`{ scope: 'bean', text: '', sort: 'newest', shop: '', decafOnly: false }`), `BEAN_ONLY_SORTS: readonly SortKey[]` (`['roasted']`)
  - `normalize(value: string): string`
  - `applyQuery(entries: readonly IndexEntry[], query: Query): IndexEntry[]` — 새 배열을 돌려주고 원본은 바꾸지 않는다
  - `updateQuery(query: Query, patch: Partial<Query>): Query`
  - `shopOptions(entries: readonly IndexEntry[], scope: Scope): string[]`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/query.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { applyQuery, DEFAULT_QUERY, normalize, shopOptions, updateQuery, type Query } from '../public/js/query.js'
import type { IndexEntry } from '../src/search-index.js'

function entry(key: string, overrides: Partial<IndexEntry> = {}): IndexEntry {
  return {
    key,
    kind: 'bean',
    title: key,
    subtitle: '가게',
    date: '2026-10-01',
    createdAt: '2026-10-01T00:00:00.000Z',
    score: null,
    price: null,
    country: null,
    roastedAt: null,
    isDecaf: false,
    searchText: key,
    ...overrides,
  }
}

const query = (patch: Partial<Query> = {}): Query => ({ ...DEFAULT_QUERY, ...patch })
const keys = (entries: IndexEntry[]) => entries.map((e) => e.key)

describe('normalize', () => {
  it('서버와 같은 규칙', () => {
    expect(normalize('  Ethiopia   GUJI ')).toBe('ethiopia guji')
    expect(normalize('가')).toBe('가')
  })
})

describe('applyQuery 필터', () => {
  const entries = [
    entry('a', { searchText: '에티오피아 구지 베리 berry', date: '2026-10-03' }),
    entry('b', { searchText: '케냐 aa 베리', date: '2026-10-02', subtitle: '나무사이로', isDecaf: true }),
    entry('c', { searchText: '콜롬비아', date: '2026-10-01' }),
    entry('d', { kind: 'cafe', searchText: '게이샤 베리', date: '2026-10-04', subtitle: '프릳츠' }),
  ]

  it('기본은 원두만', () => {
    expect(keys(applyQuery(entries, query()))).toEqual(['a', 'b', 'c'])
  })

  it('범위: 전체, 카페', () => {
    expect(keys(applyQuery(entries, query({ scope: 'all' })))).toEqual(['d', 'a', 'b', 'c'])
    expect(keys(applyQuery(entries, query({ scope: 'cafe' })))).toEqual(['d'])
  })

  it('검색어 토큰을 모두 포함해야 한다 (대소문자 무시)', () => {
    expect(keys(applyQuery(entries, query({ text: '베리' })))).toEqual(['a', 'b'])
    expect(keys(applyQuery(entries, query({ text: '베리  케냐' })))).toEqual(['b'])
    expect(keys(applyQuery(entries, query({ text: ' BERRY ' })))).toEqual(['a'])
    expect(keys(applyQuery(entries, query({ text: '없는말' })))).toEqual([])
  })

  it('가게, 디카페인', () => {
    expect(keys(applyQuery(entries, query({ shop: '나무사이로' })))).toEqual(['b'])
    expect(keys(applyQuery(entries, query({ decafOnly: true })))).toEqual(['b'])
  })

  it('원본 배열을 바꾸지 않는다', () => {
    const before = keys(entries)
    applyQuery(entries, query({ sort: 'oldest' }))
    expect(keys(entries)).toEqual(before)
  })
})

describe('applyQuery 정렬', () => {
  it('최신순은 날짜, 같으면 생성 시각', () => {
    const entries = [
      entry('old', { date: '2026-09-01' }),
      entry('same-early', { date: '2026-10-01', createdAt: '2026-10-01T01:00:00.000Z' }),
      entry('same-late', { date: '2026-10-01', createdAt: '2026-10-01T05:00:00.000Z' }),
    ]
    expect(keys(applyQuery(entries, query({ sort: 'newest' })))).toEqual(['same-late', 'same-early', 'old'])
    expect(keys(applyQuery(entries, query({ sort: 'oldest' })))).toEqual(['old', 'same-early', 'same-late'])
  })

  it('점수 높은순, 점수 없으면 뒤로', () => {
    const entries = [entry('none'), entry('low', { score: 0.5 }), entry('high', { score: 0.9 })]
    expect(keys(applyQuery(entries, query({ sort: 'score' })))).toEqual(['high', 'low', 'none'])
  })

  it('이름순은 가나다, 숫자는 자연 정렬', () => {
    const entries = [entry('k1', { title: '다방' }), entry('k2', { title: '가비' }), entry('k3', { title: '나무' })]
    expect(keys(applyQuery(entries, query({ sort: 'name' })))).toEqual(['k2', 'k3', 'k1'])
    const numbered = [entry('n10', { title: '원두 10' }), entry('n2', { title: '원두 2' })]
    expect(keys(applyQuery(numbered, query({ sort: 'name' })))).toEqual(['n2', 'n10'])
  })

  it('가격순, 가격 없으면 항상 뒤로', () => {
    const entries = [entry('none'), entry('cheap', { price: 9000 }), entry('pricey', { price: 30000 })]
    expect(keys(applyQuery(entries, query({ sort: 'priceAsc' })))).toEqual(['cheap', 'pricey', 'none'])
    expect(keys(applyQuery(entries, query({ sort: 'priceDesc' })))).toEqual(['pricey', 'cheap', 'none'])
  })

  it('최신 로스팅순, 로스팅일 없으면 뒤로', () => {
    const entries = [
      entry('none'),
      entry('early', { roastedAt: '2026-09-01' }),
      entry('late', { roastedAt: '2026-09-28' }),
    ]
    expect(keys(applyQuery(entries, query({ sort: 'roasted' })))).toEqual(['late', 'early', 'none'])
  })

  it('원두 국가순, 같은 국가는 이름순, 국가 없으면 뒤로', () => {
    const entries = [
      entry('none', { title: '가' }),
      entry('kenya', { country: '케냐', title: '나' }),
      entry('eth-b', { country: '에티오피아', title: '시다모' }),
      entry('eth-a', { country: '에티오피아', title: '구지' }),
    ]
    expect(keys(applyQuery(entries, query({ sort: 'country' })))).toEqual(['eth-a', 'eth-b', 'kenya', 'none'])
  })
})

describe('updateQuery', () => {
  it('범위가 바뀌면 가게 필터를 비운다', () => {
    expect(updateQuery(query({ shop: '리브레' }), { scope: 'cafe' })).toMatchObject({ scope: 'cafe', shop: '' })
  })

  it('원두가 아닌 범위로 가면 로스팅순을 최신순으로 되돌린다', () => {
    expect(updateQuery(query({ sort: 'roasted' }), { scope: 'all' }).sort).toBe('newest')
    expect(updateQuery(query({ sort: 'roasted' }), { scope: 'bean' }).sort).toBe('roasted')
    expect(updateQuery(query({ scope: 'all', sort: 'priceAsc' }), { scope: 'cafe' }).sort).toBe('priceAsc')
  })

  it('범위가 그대로면 가게·정렬을 유지한다', () => {
    const next = updateQuery(query({ shop: '리브레', sort: 'roasted' }), { text: '베리' })
    expect(next).toMatchObject({ shop: '리브레', sort: 'roasted', text: '베리' })
  })
})

describe('shopOptions', () => {
  it('범위 안의 가게 이름을 중복 없이 가나다순으로', () => {
    const entries = [
      entry('a', { subtitle: '커피리브레' }),
      entry('b', { subtitle: '나무사이로' }),
      entry('c', { subtitle: '커피리브레' }),
      entry('d', { kind: 'cafe', subtitle: '프릳츠' }),
    ]
    expect(shopOptions(entries, 'bean')).toEqual(['나무사이로', '커피리브레'])
    expect(shopOptions(entries, 'cafe')).toEqual(['프릳츠'])
    expect(shopOptions(entries, 'all')).toEqual(['나무사이로', '커피리브레', '프릳츠'])
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm test test/query.test.ts`
Expected: FAIL — `Cannot find module '../public/js/query.js'`

- [ ] **Step 3: `public/js/query.js` 구현**

```js
// @ts-check

/** @typedef {import('../../src/search-index.js').IndexEntry} IndexEntry */
/** @typedef {'all' | 'bean' | 'cafe'} Scope */
/** @typedef {'newest' | 'oldest' | 'score' | 'name' | 'priceAsc' | 'priceDesc' | 'roasted' | 'country'} SortKey */
/** @typedef {{ scope: Scope, text: string, sort: SortKey, shop: string, decafOnly: boolean }} Query */

/** @type {Readonly<Query>} */
export const DEFAULT_QUERY = Object.freeze({ scope: 'bean', text: '', sort: 'newest', shop: '', decafOnly: false })

/**
 * 원두 범위에서만 고를 수 있는 정렬
 * @type {readonly SortKey[]}
 */
export const BEAN_ONLY_SORTS = ['roasted']

/**
 * 검색용 정규화. 서버 src/search-index.ts 의 normalize 와 같은 규칙이어야 한다.
 * @param {string} value
 * @returns {string}
 */
export function normalize(value) {
  return value.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
}

const collator = new Intl.Collator('ko', { numeric: true })

/**
 * @param {string} a
 * @param {string} b
 */
const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * 값이 없는 쪽을 항상 뒤로 보낸다
 * @template T
 * @param {T | null} a
 * @param {T | null} b
 * @param {(x: T, y: T) => number} compare
 * @returns {number}
 */
function nullsLast(a, b, compare) {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return compare(a, b)
}

/** @type {Record<SortKey, (a: IndexEntry, b: IndexEntry) => number>} */
const COMPARATORS = {
  newest: (a, b) => compareText(b.date, a.date) || compareText(b.createdAt, a.createdAt),
  oldest: (a, b) => compareText(a.date, b.date) || compareText(a.createdAt, b.createdAt),
  score: (a, b) => nullsLast(a.score, b.score, (x, y) => y - x),
  name: (a, b) => collator.compare(a.title, b.title),
  priceAsc: (a, b) => nullsLast(a.price, b.price, (x, y) => x - y),
  priceDesc: (a, b) => nullsLast(a.price, b.price, (x, y) => y - x),
  roasted: (a, b) => nullsLast(a.roastedAt, b.roastedAt, (x, y) => compareText(y, x)),
  country: (a, b) =>
    nullsLast(a.country, b.country, (x, y) => collator.compare(x, y)) || collator.compare(a.title, b.title),
}

/**
 * 범위·가게·디카페인·검색어로 거르고 정렬한 새 배열을 돌려준다
 * @param {readonly IndexEntry[]} entries
 * @param {Query} query
 * @returns {IndexEntry[]}
 */
export function applyQuery(entries, query) {
  const tokens = normalize(query.text).split(' ').filter(Boolean)
  const compare = COMPARATORS[query.sort] ?? COMPARATORS.newest
  return entries
    .filter(
      (entry) =>
        (query.scope === 'all' || entry.kind === query.scope) &&
        (!query.shop || entry.subtitle === query.shop) &&
        (!query.decafOnly || entry.isDecaf) &&
        tokens.every((token) => entry.searchText.includes(token)),
    )
    .sort((a, b) => compare(a, b) || COMPARATORS.newest(a, b))
}

/**
 * 조건 일부를 바꾼다. 범위가 바뀌면 가게 필터를 비우고, 원두 전용 정렬은 최신순으로 되돌린다.
 * @param {Query} query
 * @param {Partial<Query>} patch
 * @returns {Query}
 */
export function updateQuery(query, patch) {
  const next = { ...query, ...patch }
  if (patch.scope !== undefined && patch.scope !== query.scope) {
    next.shop = ''
    if (next.scope !== 'bean' && BEAN_ONLY_SORTS.includes(next.sort)) next.sort = 'newest'
  }
  return next
}

/**
 * 범위 안의 가게(로스터리·카페) 이름, 가나다순
 * @param {readonly IndexEntry[]} entries
 * @param {Scope} scope
 * @returns {string[]}
 */
export function shopOptions(entries, scope) {
  const shops = new Set(entries.filter((e) => scope === 'all' || e.kind === scope).map((e) => e.subtitle))
  return [...shops].sort((a, b) => collator.compare(a, b))
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test test/query.test.ts && pnpm typecheck`
Expected: 모두 PASS, 타입 오류 없음 (`checkJs`로 query.js도 검사됨)

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat: 브라우저 검색·필터·정렬 로직

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 공개 화면 (홈 카드 그리드, 즉시 검색, 상세 모달)

**Files:**
- Create: `src/routes/public.ts`
- Modify: `src/app.ts` (저장소 생성, 공개 라우터 연결)
- Create: `views/home.ejs`, `views/detail.ejs`, `views/partials/card.ejs`, `views/partials/stars.ejs`, `views/partials/detail.ejs`
- Create: `public/js/carousel.js`, `public/js/home.js`, `public/js/home-main.js`, `public/js/detail-main.js`
- Modify: `public/css/app.css` (끝에 공개 화면 스타일 추가)
- Test: `test/public-pages.test.ts`, `test/home-client.test.ts`

**Interfaces:**
- Consumes: `createRepos`, `Repos` (Task 4), `buildHomeModel`, `buildDetailModel` (Task 5), `applyQuery`, `shopOptions`, `updateQuery`, `Query` (Task 6), `DEFS`, `parseId`, `HttpError`
- Produces:
  - `publicRouter(repos: Repos): Router` — `GET /`, `GET /beans/:id`, `GET /cafe-visits/:id` (`?fragment=1`이면 상세 조각만)
  - `initCarousels(root: ParentNode, bootstrap: any): void`
  - `initHome(doc: Document, deps?: { bootstrap?: any; fetch?: typeof fetch }): void`
  - 템플릿 `partials/detail`(DetailModel + isAdmin), `partials/card`({ card: CardModel }), `partials/stars`({ value: number })
  - DOM 계약: `#coffee-index`, `#card-grid[data-scope]`, `[data-key]` 카드, `a[data-detail]`, `#toolbar` 폼(name: text/scope/sort/shop/decafOnly), `[data-scope-tab]`, `#result-count`, `#empty-state`, `#detail-modal`, `#detail-body`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/public-pages.test.ts`:
```ts
import type { Express } from 'express'
import type { Pool } from 'pg'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createRepos, type Repos } from '../src/repository.js'
import { beanDef, cafeVisitDef } from '../src/resources.js'
import { createTestPool, describeDb, resetData } from './db.js'
import { prepared } from './fixtures.js'
import { testConfig } from './helpers.js'

function indexOf(html: string): { key: string }[] {
  const match = html.match(/<script type="application\/json" id="coffee-index">([\s\S]*?)<\/script>/)
  if (!match) throw new Error('coffee-index가 없습니다')
  return JSON.parse(match[1])
}

describeDb('공개 페이지', () => {
  let pool: Pool
  let repos: Repos
  let app: Express

  beforeAll(async () => {
    pool = await createTestPool()
    repos = createRepos(pool)
    app = createApp({ config: testConfig(), pool })
  })

  afterAll(async () => {
    await pool.end()
  })

  beforeEach(async () => {
    await resetData(pool)
    await repos.bean.create(
      prepared(beanDef, { name: '에티오피아 구지', shop: '커피리브레', price: '18000', flavorTags: '베리, 자스민' }),
    )
    await repos.cafe.create(prepared(cafeVisitDef, { menu: '게이샤 필터', cafeName: '프릳츠', rating: '4' }))
  })

  it('홈은 모든 카드와 검색 인덱스를 그린다', async () => {
    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    expect(res.text).toContain('에티오피아 구지')
    expect(res.text).toContain('게이샤 필터')
    expect(indexOf(res.text).map((e) => e.key)).toEqual(['bean-1', 'cafe-1'])
    expect(res.text).toContain('data-key="bean-1" data-kind="bean">')
    expect(res.text).toContain('data-key="cafe-1" data-kind="cafe" hidden>')
    expect(res.text).toContain('/js/home-main.js')
  })

  it('상세 페이지', async () => {
    const res = await request(app).get('/beans/1')
    expect(res.status).toBe(200)
    expect(res.text).toContain('<!doctype html>')
    expect(res.text).toContain('<title>에티오피아 구지 · Coffee Note</title>')
    expect(res.text).toContain('18,000원')
    expect(res.text).toContain('#베리')
  })

  it('상세 조각은 문서 껍데기 없이 본문만', async () => {
    const res = await request(app).get('/cafe-visits/1?fragment=1')
    expect(res.status).toBe(200)
    expect(res.text).not.toContain('<html')
    expect(res.text).toContain('id="detail-title"')
    expect(res.text).toContain('★★★★☆')
    expect(res.text).not.toContain('/admin/cafe-visits/1/edit')
  })

  it.each(['/beans/999', '/beans/abc', '/cafe-visits/0'])('%s는 404', async (url) => {
    const res = await request(app).get(url)
    expect(res.status).toBe(404)
    expect(res.text).toContain('기록을 찾을 수 없습니다')
  })

  it('사용자 입력은 이스케이프한다', async () => {
    await repos.bean.create(prepared(beanDef, { name: '<script>alert(1)</script>', shop: '리브레' }))
    const res = await request(app).get('/')
    expect(res.text).not.toContain('<script>alert(1)</script>')
    expect(res.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(res.text).toContain('\\u003cscript>alert(1)\\u003c/script>')
  })
})
```

`test/home-client.test.ts`:
```ts
// @vitest-environment jsdom
import path from 'node:path'
import ejs from 'ejs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initHome } from '../public/js/home.js'
import { VIEWS_DIR } from '../src/paths.js'
import { buildHomeModel } from '../src/view-models.js'
import { beanEntity, cafeEntity } from './fixtures.js'

const beans = [
  beanEntity({ id: 1, name: '에티오피아 구지', shop: '커피리브레', purchasedAt: '2026-10-01' }),
  beanEntity({
    id: 2,
    name: '케냐 AA',
    shop: '나무사이로',
    country: '케냐',
    flavorTags: ['자몽'],
    memo: null,
    summary: null,
    purchasedAt: '2026-10-03',
    isDecaf: true,
  }),
]
const cafes = [cafeEntity({ id: 1, menu: '게이샤 필터', cafeName: '프릳츠', visitedAt: '2026-10-05' })]

let show: ReturnType<typeof vi.fn>
let fetchMock: ReturnType<typeof vi.fn>

const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector(selector) as T
const visibleKeys = () =>
  [...document.querySelectorAll<HTMLElement>('#card-grid [data-key]')].filter((el) => !el.hidden).map((el) => el.dataset.key)

function setControl(name: string, value: string | boolean) {
  const control = $<HTMLFormElement>('#toolbar').elements.namedItem(name) as HTMLInputElement | HTMLSelectElement
  if (control instanceof HTMLInputElement && control.type === 'checkbox') {
    control.checked = value === true
    control.dispatchEvent(new Event('change', { bubbles: true }))
  } else if (control instanceof HTMLSelectElement) {
    control.value = String(value)
    control.dispatchEvent(new Event('change', { bubbles: true }))
  } else {
    control.value = String(value)
    control.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

beforeEach(async () => {
  const html = await ejs.renderFile(path.join(VIEWS_DIR, 'home.ejs'), {
    ...buildHomeModel(beans, cafes, '2026-10-08'),
    assetVersion: 't',
    isAdmin: false,
  })
  document.body.innerHTML = html
  show = vi.fn()
  fetchMock = vi.fn(async () => new Response('<h2 id="detail-title">상세 본문</h2>'))
  const bootstrap = {
    Modal: { getOrCreateInstance: vi.fn(() => ({ show })) },
    Carousel: { getOrCreateInstance: vi.fn() },
  }
  initHome(document, { bootstrap, fetch: fetchMock as unknown as typeof fetch })
})

describe('홈 화면 스크립트', () => {
  it('처음에는 원두만 최신순', () => {
    expect(visibleKeys()).toEqual(['bean-2', 'bean-1'])
    expect($('#result-count').textContent).toBe('2개')
    expect($('#empty-state').hidden).toBe(true)
  })

  it('검색어를 입력하면 즉시 거른다', () => {
    setControl('text', '자스민')
    expect(visibleKeys()).toEqual(['bean-1'])
    expect($('#result-count').textContent).toBe('1개')
  })

  it('전체 범위는 카페도 보여주고 종류 배지를 켠다', () => {
    setControl('scope', 'all')
    expect(visibleKeys()).toEqual(['cafe-1', 'bean-2', 'bean-1'])
    expect($('#card-grid').dataset.scope).toBe('all')
  })

  it('카페 탭: 가게 목록이 바뀌고 로스팅순은 고를 수 없다', () => {
    $('[data-scope-tab="cafe"]').click()
    expect(visibleKeys()).toEqual(['cafe-1'])
    expect($<HTMLSelectElement>('select[name="scope"]').value).toBe('cafe')
    expect($('[data-scope-tab="cafe"]').classList.contains('active')).toBe(true)
    expect($('[data-scope-tab="bean"]').classList.contains('active')).toBe(false)
    const shopOptions = [...$<HTMLSelectElement>('select[name="shop"]').options].map((o) => o.textContent)
    expect(shopOptions).toEqual(['모든 카페', '프릳츠'])
    expect($<HTMLOptionElement>('option[value="roasted"]').disabled).toBe(true)
  })

  it('로스팅순에서 카페로 가면 최신순으로 돌아간다', () => {
    setControl('sort', 'roasted')
    $('[data-scope-tab="cafe"]').click()
    expect($<HTMLSelectElement>('select[name="sort"]').value).toBe('newest')
  })

  it('가게·디카페인 필터', () => {
    setControl('shop', '나무사이로')
    expect(visibleKeys()).toEqual(['bean-2'])
    setControl('shop', '')
    setControl('decafOnly', true)
    expect(visibleKeys()).toEqual(['bean-2'])
  })

  it('정렬하면 카드 순서가 바뀐다', () => {
    setControl('sort', 'name')
    expect(visibleKeys()).toEqual(['bean-1', 'bean-2'])
  })

  it('결과가 없으면 안내를 보여준다', () => {
    setControl('text', '없는검색어')
    expect(visibleKeys()).toEqual([])
    expect($('#empty-state').hidden).toBe(false)
    expect($('#result-count').textContent).toBe('0개')
  })

  it('카드를 누르면 상세 조각을 모달로 연다', async () => {
    $('[data-key="bean-1"] a[data-detail]').click()
    expect(show).toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith('/beans/1?fragment=1')
    await vi.waitFor(() => expect($('#detail-body').innerHTML).toContain('상세 본문'))
  })

  it('상세를 못 불러오면 안내 문구', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }))
    $('[data-key="bean-1"] a[data-detail]').click()
    await vi.waitFor(() => expect($('#detail-body').textContent).toContain('상세 정보를 불러오지 못했습니다.'))
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm test test/public-pages.test.ts test/home-client.test.ts`
Expected: FAIL — `routes/public.js`, `views/home.ejs`, `public/js/home.js` 없음

- [ ] **Step 3: 라우터 구현과 연결**

`src/routes/public.ts`:
```ts
import { Router } from 'express'
import { HttpError, parseId } from '../errors.js'
import type { Repos } from '../repository.js'
import { DEFS } from '../resources.js'
import { buildDetailModel, buildHomeModel } from '../view-models.js'

export function publicRouter(repos: Repos): Router {
  const router = Router()

  router.get('/', async (_req, res) => {
    const [beans, cafes] = await Promise.all([repos.bean.list(), repos.cafe.list()])
    res.render('home', buildHomeModel(beans, cafes))
  })

  for (const def of Object.values(DEFS)) {
    router.get(`/${def.path}/:id`, async (req, res) => {
      const entity = await repos[def.kind].get(parseId(req.params.id))
      if (!entity) throw new HttpError(404, '기록을 찾을 수 없습니다')
      // 홈 화면 모달은 ?fragment=1 로 본문 조각만 받는다
      res.render(req.query.fragment === '1' ? 'partials/detail' : 'detail', buildDetailModel(def, entity))
    })
  }

  return router
}
```

`src/app.ts`를 다음으로 바꾼다:
```ts
import cookieParser from 'cookie-parser'
import express from 'express'
import type { Pool } from 'pg'
import type { Config } from './config.js'
import { errorHandler, notFound } from './errors.js'
import { PUBLIC_DIR, VIEWS_DIR, vendorDir } from './paths.js'
import { createRepos } from './repository.js'
import { publicRouter } from './routes/public.js'

export type AppDeps = { config: Config; pool: Pool }

export function createApp({ config, pool }: AppDeps) {
  const app = express()
  app.disable('x-powered-by')
  // 같은 서버의 리버스 프록시(nginx 등)만 신뢰한다 (로그인 시도 제한의 IP 판별용)
  app.set('trust proxy', 'loopback')
  app.set('view engine', 'ejs')
  app.set('views', VIEWS_DIR)
  // 정적 파일 캐시 무효화용 버전 (?v=)
  app.locals.assetVersion = Date.now().toString(36)

  const staticOptions = { maxAge: '7d' }
  app.use(express.static(PUBLIC_DIR, staticOptions))
  app.use('/vendor/bootstrap', express.static(vendorDir('bootstrap', 'dist'), staticOptions))
  app.use('/vendor/bootstrap-icons', express.static(vendorDir('bootstrap-icons', 'font'), staticOptions))
  app.use('/vendor/pretendard', express.static(vendorDir('pretendard', 'dist/web/variable'), staticOptions))

  app.use(express.urlencoded({ extended: false, limit: '100kb' }))
  app.use(cookieParser(config.sessionSecret))
  app.use((_req, res, next) => {
    res.locals.isAdmin = false
    next()
  })

  const repos = createRepos(pool)

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true })
  })
  app.use(publicRouter(repos))

  app.use(notFound)
  app.use(errorHandler)
  return app
}
```

- [ ] **Step 4: 템플릿 작성**

`views/partials/stars.ejs`:
```ejs
<span class="coffee-stars" role="img" aria-label="별점 <%= value %>점 / 5점"><%= '★'.repeat(value) %><span class="coffee-stars__empty"><%= '★'.repeat(5 - value) %></span></span>
```

`views/partials/card.ejs`:
```ejs
<div class="col" data-key="<%= card.key %>" data-kind="<%= card.kind %>"<%= card.hidden ? ' hidden' : '' %>>
  <article class="card h-100 shadow-sm coffee-card">
    <div class="position-relative">
      <div class="ratio ratio-4x3 bg-body-tertiary rounded-top overflow-hidden">
        <% if (card.thumbnailUrl) { %>
          <img src="<%= card.thumbnailUrl %>" alt="" loading="lazy" class="object-fit-cover">
        <% } else { %>
          <div class="coffee-card__placeholder text-body-tertiary">
            <i class="bi <%= card.kind === 'bean' ? 'bi-basket' : 'bi-cup-hot' %>"></i>
          </div>
        <% } %>
      </div>
      <div class="coffee-card__badges position-absolute top-0 start-0 p-2">
        <span class="badge text-bg-light card-kind"><%= card.kindLabel %></span>
        <% if (card.isDecaf) { %><span class="badge text-bg-info">디카페인</span><% } %>
        <% if (card.ready) { %><span class="badge text-bg-success">시음 적기</span><% } %>
      </div>
    </div>
    <div class="card-body coffee-card__body">
      <h3 class="card-title h6 mb-0 text-truncate-2">
        <a class="stretched-link text-reset text-decoration-none" href="<%= card.href %>" data-detail><%= card.title %></a>
      </h3>
      <p class="card-subtitle small text-body-secondary text-truncate mb-0"><%= card.subtitle %></p>
      <% if (card.meta) { %><p class="small text-body-secondary mb-0"><%= card.meta %></p><% } %>
      <% if (card.summary) { %><p class="card-text small mb-0 text-truncate-2"><%= card.summary %></p><% } %>
      <% if (card.tags.length) { %>
        <div class="coffee-tags">
          <% card.tags.forEach((tag) => { %><span class="badge rounded-pill bg-secondary-subtle text-secondary-emphasis fw-normal">#<%= tag %></span><% }) %>
        </div>
      <% } %>
      <% if (card.score) { %>
        <div class="coffee-card__score">
          <% if (card.score.type === 'total') { %>
            <span class="fw-bold text-primary fs-5"><%= card.score.value %></span><small class="text-body-secondary"> / <%= card.score.max %></small>
          <% } else { %>
            <%- include('stars', { value: card.score.value }) %>
          <% } %>
        </div>
      <% } %>
    </div>
  </article>
</div>
```

`views/partials/detail.ejs`:
```ejs
<% if (photos.length) { const carouselId = `gallery-${key}` %>
<div id="<%= carouselId %>" class="carousel slide coffee-carousel" data-bs-touch="true">
  <div class="carousel-inner">
    <% photos.forEach((photo, i) => { %>
      <div class="carousel-item<%= i === 0 ? ' active' : '' %>">
        <img src="<%= photo.url %>" class="d-block w-100" alt="<%= heading %> 사진 <%= i + 1 %>">
      </div>
    <% }) %>
  </div>
  <% if (photos.length > 1) { %>
    <button class="carousel-control-prev" type="button" data-bs-target="#<%= carouselId %>" data-bs-slide="prev">
      <span class="carousel-control-prev-icon" aria-hidden="true"></span><span class="visually-hidden">이전 사진</span>
    </button>
    <button class="carousel-control-next" type="button" data-bs-target="#<%= carouselId %>" data-bs-slide="next">
      <span class="carousel-control-next-icon" aria-hidden="true"></span><span class="visually-hidden">다음 사진</span>
    </button>
  <% } %>
</div>
<% } %>
<div class="p-3 p-md-4">
  <p class="text-primary small fw-semibold mb-1"><%= kindLabel %></p>
  <h2 class="h4 mb-1" id="detail-title"><%= heading %></h2>
  <p class="text-body-secondary mb-3"><%= subtitle %></p>
  <% if (tags.length) { %>
    <div class="coffee-tags coffee-tags--wrap mb-3">
      <% tags.forEach((tag) => { %><span class="badge rounded-pill bg-secondary-subtle text-secondary-emphasis fw-normal">#<%= tag %></span><% }) %>
    </div>
  <% } %>
  <% if (rows.length) { %>
    <dl class="row small mb-0">
      <% rows.forEach((row) => { %>
        <dt class="col-5 col-sm-4 fw-normal text-body-secondary"><%= row.label %></dt>
        <dd class="col-7 col-sm-8"><%= row.value %></dd>
      <% }) %>
    </dl>
  <% } %>
  <% memos.forEach((memo) => { %>
    <h3 class="h6 mt-3"><%= memo.label %></h3>
    <p class="coffee-memo mb-0"><%= memo.text %></p>
  <% }) %>
  <% if (links.length || isAdmin) { %>
    <div class="coffee-actions mt-4">
      <% links.forEach((link) => { %>
        <a class="btn btn-sm btn-outline-primary" href="<%= link.href %>" target="_blank" rel="noopener noreferrer"><i class="bi bi-box-arrow-up-right"></i> <%= link.label %></a>
      <% }) %>
      <% if (isAdmin) { %>
        <a class="btn btn-sm btn-outline-secondary" href="<%= editHref %>"><i class="bi bi-pencil"></i> 수정</a>
      <% } %>
    </div>
  <% } %>
</div>
```

`views/detail.ejs`:
```ejs
<%- include('partials/head') %>
<%- include('partials/site-header') %>
<main class="container py-3 py-md-4">
  <a class="btn btn-link px-0 mb-2" href="/"><i class="bi bi-arrow-left"></i> 목록으로</a>
  <article class="card overflow-hidden mx-auto coffee-detail">
    <%- include('partials/detail') %>
  </article>
</main>
<%- include('partials/foot', { scripts: ['/js/detail-main.js'] }) %>
```

`views/home.ejs`:
```ejs
<%- include('partials/head') %>
<%- include('partials/site-header') %>
<main class="container pb-5">
  <ul class="nav nav-underline mt-3" id="scope-tabs">
    <li class="nav-item">
      <button type="button" class="nav-link active" data-scope-tab="bean" aria-current="true">
        원두 노트 <span class="badge rounded-pill bg-body-tertiary text-body-secondary"><%= counts.bean %></span>
      </button>
    </li>
    <li class="nav-item">
      <button type="button" class="nav-link" data-scope-tab="cafe">
        카페 후기 <span class="badge rounded-pill bg-body-tertiary text-body-secondary"><%= counts.cafe %></span>
      </button>
    </li>
  </ul>

  <form id="toolbar" class="coffee-toolbar sticky-top py-3" role="search">
    <div class="row g-2 align-items-center">
      <div class="col-12 col-lg">
        <div class="input-group">
          <span class="input-group-text bg-body"><i class="bi bi-search"></i></span>
          <input type="search" name="text" class="form-control" placeholder="원두, 가게, 산지, 향미로 검색" aria-label="검색어" autocomplete="off" enterkeyhint="search">
        </div>
      </div>
      <div class="col-12 col-lg-auto">
        <div class="coffee-toolbar__options">
          <select name="scope" class="form-select" aria-label="검색 범위">
            <option value="all">전체</option>
            <option value="bean" selected>원두</option>
            <option value="cafe">카페</option>
          </select>
          <select name="sort" class="form-select" aria-label="정렬">
            <option value="newest" selected>최신순</option>
            <option value="oldest">오래된순</option>
            <option value="score">점수 높은순</option>
            <option value="name">이름순</option>
            <option value="priceAsc">가격 낮은순</option>
            <option value="priceDesc">가격 높은순</option>
            <option value="roasted" data-bean-only>최신 로스팅순</option>
            <option value="country">원두 국가순</option>
          </select>
          <select name="shop" class="form-select" aria-label="가게">
            <option value="">모든 가게</option>
            <% shops.forEach((shop) => { %><option value="<%= shop %>"><%= shop %></option><% }) %>
          </select>
          <div class="form-check form-switch mb-0 text-nowrap">
            <input class="form-check-input" type="checkbox" role="switch" id="decaf-only" name="decafOnly">
            <label class="form-check-label" for="decaf-only">디카페인</label>
          </div>
        </div>
      </div>
    </div>
  </form>

  <p class="small text-body-secondary mb-2" id="result-count" aria-live="polite"><%= counts.bean %>개</p>
  <div id="card-grid" class="row row-cols-1 row-cols-sm-2 row-cols-lg-3 row-cols-xl-4 row-cols-xxl-5 g-3" data-scope="bean">
    <% cards.forEach((card) => { %><%- include('partials/card', { card }) %><% }) %>
  </div>
  <div id="empty-state" class="text-center text-body-secondary py-5"<%= counts.bean > 0 ? ' hidden' : '' %>>
    <i class="bi bi-cup fs-1"></i>
    <p class="mt-2 mb-0">조건에 맞는 기록이 없습니다.</p>
  </div>
</main>

<div class="modal fade" id="detail-modal" tabindex="-1" aria-labelledby="detail-title" aria-hidden="true">
  <div class="modal-dialog modal-lg modal-dialog-scrollable modal-fullscreen-md-down">
    <div class="modal-content">
      <div class="modal-header border-0 py-2">
        <button type="button" class="btn-close ms-auto" data-bs-dismiss="modal" aria-label="닫기"></button>
      </div>
      <div class="modal-body p-0" id="detail-body"></div>
    </div>
  </div>
</div>

<script type="application/json" id="coffee-index"><%- indexJson %></script>
<%- include('partials/foot', { scripts: ['/js/home-main.js'] }) %>
```

- [ ] **Step 5: 브라우저 스크립트 작성**

`public/js/carousel.js`:
```js
// @ts-check

/**
 * 터치 스와이프가 바로 동작하도록 캐러셀 인스턴스를 만든다 (자동 넘김 없음)
 * @param {ParentNode} root
 * @param {any} bootstrap
 */
export function initCarousels(root, bootstrap) {
  if (!bootstrap) return
  for (const el of root.querySelectorAll('.carousel')) {
    bootstrap.Carousel.getOrCreateInstance(el, { interval: false, ride: false })
  }
}
```

`public/js/detail-main.js`:
```js
// @ts-check
import { initCarousels } from './carousel.js'

initCarousels(document, /** @type {any} */ (window).bootstrap)
```

`public/js/home.js`:
```js
// @ts-check
import { initCarousels } from './carousel.js'
import { applyQuery, shopOptions, updateQuery } from './query.js'

/** @typedef {import('./query.js').Query} Query */
/** @typedef {import('./query.js').IndexEntry} IndexEntry */

const SPINNER =
  '<div class="p-5 text-center"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">불러오는 중</span></div></div>'
const LOAD_ERROR = '<p class="p-4 text-center text-body-secondary mb-0">상세 정보를 불러오지 못했습니다.</p>'

/**
 * 홈 화면: 서버가 그려 둔 카드를 검색·필터·정렬 결과에 맞춰 숨기고 재배치한다.
 * @param {Document} doc
 * @param {{ bootstrap?: any, fetch?: typeof fetch }} [deps]
 */
export function initHome(doc, deps = {}) {
  const bootstrap = deps.bootstrap ?? /** @type {any} */ (window).bootstrap
  const fetchFn = deps.fetch ?? window.fetch.bind(window)

  /** @type {IndexEntry[]} */
  const entries = JSON.parse(doc.getElementById('coffee-index')?.textContent ?? '[]')
  const grid = /** @type {HTMLElement} */ (doc.getElementById('card-grid'))
  const form = /** @type {HTMLFormElement} */ (doc.getElementById('toolbar'))
  const countEl = /** @type {HTMLElement} */ (doc.getElementById('result-count'))
  const emptyEl = /** @type {HTMLElement} */ (doc.getElementById('empty-state'))
  const textInput = /** @type {HTMLInputElement} */ (form.elements.namedItem('text'))
  const scopeSelect = /** @type {HTMLSelectElement} */ (form.elements.namedItem('scope'))
  const sortSelect = /** @type {HTMLSelectElement} */ (form.elements.namedItem('sort'))
  const shopSelect = /** @type {HTMLSelectElement} */ (form.elements.namedItem('shop'))
  const decafInput = /** @type {HTMLInputElement} */ (form.elements.namedItem('decafOnly'))
  const tabs = /** @type {HTMLElement[]} */ ([...doc.querySelectorAll('[data-scope-tab]')])

  /** @type {Map<string, HTMLElement>} */
  const cards = new Map()
  for (const el of grid.querySelectorAll('[data-key]')) {
    const card = /** @type {HTMLElement} */ (el)
    cards.set(card.dataset.key ?? '', card)
  }

  // 뒤로 가기로 돌아왔을 때 브라우저가 복원한 컨트롤 값을 그대로 쓴다
  /** @type {Query} */
  let query = {
    scope: /** @type {Query['scope']} */ (scopeSelect.value),
    text: textInput.value,
    sort: /** @type {Query['sort']} */ (sortSelect.value),
    shop: shopSelect.value,
    decafOnly: decafInput.checked,
  }

  /**
   * @param {string} value
   * @param {string} label
   */
  function option(value, label) {
    const el = doc.createElement('option')
    el.value = value
    el.textContent = label
    return el
  }

  /** 범위가 바뀌었을 때 탭·정렬·가게 컨트롤을 맞춘다 */
  function syncControls() {
    scopeSelect.value = query.scope
    for (const tab of tabs) {
      const active = tab.dataset.scopeTab === query.scope
      tab.classList.toggle('active', active)
      if (active) tab.setAttribute('aria-current', 'true')
      else tab.removeAttribute('aria-current')
    }
    for (const sortOption of sortSelect.options) {
      // iOS 사파리는 hidden 옵션을 숨기지 않으므로 disabled도 함께 건다
      const unavailable = sortOption.hasAttribute('data-bean-only') && query.scope !== 'bean'
      sortOption.hidden = unavailable
      sortOption.disabled = unavailable
    }
    sortSelect.value = query.sort
    const placeholder = option('', query.scope === 'cafe' ? '모든 카페' : '모든 가게')
    shopSelect.replaceChildren(placeholder, ...shopOptions(entries, query.scope).map((shop) => option(shop, shop)))
    shopSelect.value = query.shop
    if (shopSelect.value !== query.shop) query = { ...query, shop: shopSelect.value }
  }

  function render() {
    const results = applyQuery(entries, query)
    const visible = new Set(results.map((entry) => entry.key))
    for (const [key, card] of cards) card.hidden = !visible.has(key)
    // 결과 순서대로 다시 붙여서 정렬을 화면에 반영한다
    for (const entry of results) {
      const card = cards.get(entry.key)
      if (card) grid.append(card)
    }
    grid.dataset.scope = query.scope
    countEl.textContent = `${results.length}개`
    emptyEl.hidden = results.length > 0
  }

  /** @param {Partial<Query>} patch */
  function update(patch) {
    const scopeChanged = patch.scope !== undefined && patch.scope !== query.scope
    query = updateQuery(query, patch)
    if (scopeChanged) syncControls()
    render()
  }

  textInput.addEventListener('input', () => update({ text: textInput.value }))
  scopeSelect.addEventListener('change', () => update({ scope: /** @type {Query['scope']} */ (scopeSelect.value) }))
  sortSelect.addEventListener('change', () => update({ sort: /** @type {Query['sort']} */ (sortSelect.value) }))
  shopSelect.addEventListener('change', () => update({ shop: shopSelect.value }))
  decafInput.addEventListener('change', () => update({ decafOnly: decafInput.checked }))
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    textInput.blur()
  })
  for (const tab of tabs) {
    tab.addEventListener('click', () => update({ scope: /** @type {Query['scope']} */ (tab.dataset.scopeTab) }))
  }

  const modalEl = doc.getElementById('detail-modal')
  const modalBody = /** @type {HTMLElement} */ (doc.getElementById('detail-body'))
  const modal = bootstrap && modalEl ? bootstrap.Modal.getOrCreateInstance(modalEl) : null

  /** @param {string} href */
  async function openDetail(href) {
    modalBody.innerHTML = SPINNER
    modal.show()
    try {
      const res = await fetchFn(`${href}?fragment=1`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      modalBody.innerHTML = await res.text()
      initCarousels(modalBody, bootstrap)
    } catch {
      modalBody.innerHTML = LOAD_ERROR
    }
  }

  grid.addEventListener('click', (event) => {
    const link = /** @type {Element} */ (event.target).closest('a[data-detail]')
    // 새 탭으로 열기(수정키 클릭)는 상세 페이지로 그대로 이동시킨다
    if (!link || !modal || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    void openDetail(link.getAttribute('href') ?? '')
  })

  syncControls()
  render()
}
```

`public/js/home-main.js`:
```js
// @ts-check
import { initHome } from './home.js'

initHome(document)
```

- [ ] **Step 6: 스타일 추가**

`public/css/app.css` 끝에 추가:
```css
/* ===== 공개 화면 ===== */
.coffee-toolbar {
  z-index: 1010;
  background: var(--bs-body-bg);
}

.coffee-toolbar__options {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.coffee-toolbar__options::-webkit-scrollbar { display: none; }

.coffee-toolbar__options .form-select {
  width: auto;
  flex: none;
}

.coffee-card {
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

@media (hover: hover) {
  .coffee-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--bs-box-shadow) !important;
  }
}

.coffee-card:focus-within {
  outline: 2px solid var(--bs-primary);
  outline-offset: 2px;
}

.coffee-card__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.5rem;
}

/* 배지가 카드 링크 클릭을 가로채지 않게 한다 */
.coffee-card__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  pointer-events: none;
}

.coffee-card__body {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.coffee-card__score {
  margin-top: auto;
  padding-top: 0.25rem;
  text-align: right;
}

.coffee-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  max-height: 1.5rem;
  overflow: hidden;
}

.coffee-tags--wrap { max-height: none; }

/* 종류 배지는 '전체' 범위에서만 보인다 */
.card-kind { display: none; }
#card-grid[data-scope='all'] .card-kind { display: inline-block; }

.coffee-stars {
  color: #e0a526;
  letter-spacing: 1px;
}

.coffee-stars__empty { color: var(--bs-border-color); }

.coffee-memo {
  white-space: pre-wrap;
  line-height: 1.7;
}

.coffee-carousel img {
  aspect-ratio: 4 / 3;
  object-fit: contain;
  background: #000;
}

.coffee-detail { max-width: 760px; }

.coffee-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `pnpm test && pnpm typecheck`
Expected: 전체 PASS (public-pages 7개, home-client 10개 포함), 타입 오류 없음

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "feat: 공개 홈 카드 그리드, 즉시 검색, 상세 모달

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 관리자 인증

**Files:**
- Create: `src/auth.ts`, `src/routes/admin.ts`
- Modify: `src/app.ts` (관리자 여부 미들웨어, 관리자 라우터 연결)
- Create: `views/admin/login.ejs`, `views/partials/admin-header.ejs`
- Modify: `public/css/app.css` (끝에 관리자 스타일 추가)
- Test: `test/auth.test.ts`

**Interfaces:**
- Consumes: `Config`, `HttpError` (Task 1), `Repos` (Task 4)
- Produces:
  - `ADMIN_COOKIE = 'coffee_admin'`, `isAdmin(req: Request): boolean`, `issueAdminCookie(res: Response, config: Config): void`, `clearAdminCookie(res: Response): void`
  - `checkPassword(input: unknown, expected: string): boolean`
  - `requireAdmin: RequestHandler` (미로그인 → 303 `/admin/login`), `sameOriginOnly: RequestHandler` (다른 출처 POST → 403), `loginLimiter(): RequestHandler` (분당 10회)
  - `type AdminDeps = { config: Config; repos: Repos }`, `adminRouter(deps: AdminDeps): Router` — `/admin` 아래에 마운트
  - 템플릿 `partials/admin-header` (locals.active: `'beans' | 'cafe-visits'`)

- [ ] **Step 1: 실패하는 테스트 작성**

`test/auth.test.ts`:
```ts
import type { Express } from 'express'
import type { Pool } from 'pg'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { checkPassword } from '../src/auth.js'
import { TEST_PASSWORD, testConfig } from './helpers.js'

// 이 테스트들은 DB를 쓰지 않는 경로만 호출한다
let app: Express

beforeEach(() => {
  app = createApp({ config: testConfig(), pool: {} as Pool })
})

async function loggedInAgent() {
  const agent = request.agent(app)
  await agent.post('/admin/login').type('form').send({ password: TEST_PASSWORD }).expect(303)
  return agent
}

describe('checkPassword', () => {
  it('같을 때만 true', () => {
    expect(checkPassword('secret-pass', 'secret-pass')).toBe(true)
    expect(checkPassword('secret-pas', 'secret-pass')).toBe(false)
    expect(checkPassword(undefined, 'secret-pass')).toBe(false)
    expect(checkPassword(['secret-pass'], 'secret-pass')).toBe(false)
  })
})

describe('관리자 로그인', () => {
  it('미로그인은 로그인 화면으로 보낸다', async () => {
    const res = await request(app).get('/admin')
    expect(res.status).toBe(303)
    expect(res.headers.location).toBe('/admin/login')
  })

  it('로그인 화면', async () => {
    const res = await request(app).get('/admin/login')
    expect(res.status).toBe(200)
    expect(res.text).toContain('name="password"')
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('틀린 비밀번호는 401', async () => {
    const res = await request(app).post('/admin/login').type('form').send({ password: 'wrong-password' })
    expect(res.status).toBe(401)
    expect(res.text).toContain('비밀번호가 올바르지 않습니다.')
  })

  it('맞는 비밀번호는 서명 쿠키를 주고 관리자 화면으로', async () => {
    const res = await request(app).post('/admin/login').type('form').send({ password: TEST_PASSWORD })
    expect(res.status).toBe(303)
    expect(res.headers.location).toBe('/admin')
    const cookie = String(res.headers['set-cookie'])
    expect(cookie).toContain('coffee_admin=s%3A')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
  })

  it('로그인 후에는 관리자 화면으로 이동한다', async () => {
    const agent = await loggedInAgent()
    const login = await agent.get('/admin/login')
    expect(login.status).toBe(303)
    expect(login.headers.location).toBe('/admin')
    const home = await agent.get('/admin')
    expect(home.status).toBe(303)
    expect(home.headers.location).toBe('/admin/beans')
  })

  it('관리자면 공개 헤더에 관리 링크가 보인다', async () => {
    const agent = await loggedInAgent()
    const res = await agent.get('/nope')
    expect(res.status).toBe(404)
    expect(res.text).toContain('href="/admin"')
    const anonymous = await request(app).get('/nope')
    expect(anonymous.text).not.toContain('href="/admin"')
  })

  it('위조한 쿠키는 무시한다', async () => {
    const res = await request(app).get('/admin').set('Cookie', 'coffee_admin=s%3A9999999999999.forged')
    expect(res.status).toBe(303)
    expect(res.headers.location).toBe('/admin/login')
  })

  it('로그아웃하면 다시 로그인해야 한다', async () => {
    const agent = await loggedInAgent()
    const out = await agent.post('/admin/logout')
    expect(out.status).toBe(303)
    expect(out.headers.location).toBe('/')
    expect((await agent.get('/admin')).headers.location).toBe('/admin/login')
  })

  it('1분에 10번을 넘게 시도하면 429', async () => {
    for (let i = 0; i < 10; i += 1) {
      await request(app).post('/admin/login').type('form').send({ password: 'wrong-password' }).expect(401)
    }
    const res = await request(app).post('/admin/login').type('form').send({ password: TEST_PASSWORD })
    expect(res.status).toBe(429)
    expect(res.text).toContain('로그인 시도가 너무 많습니다.')
  })

  it.each(['https://evil.example', 'null'])('다른 출처(%s)의 POST는 403', async (origin) => {
    const res = await request(app).post('/admin/login').set('Origin', origin).type('form').send({ password: TEST_PASSWORD })
    expect(res.status).toBe(403)
    expect(res.text).toContain('허용되지 않은 요청입니다')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm test test/auth.test.ts`
Expected: FAIL — `Cannot find module '../src/auth.js'`

- [ ] **Step 3: `src/auth.ts` 구현**

```ts
import { createHash, timingSafeEqual } from 'node:crypto'
import type { Request, RequestHandler, Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { Config } from './config.js'
import { HttpError } from './errors.js'

export const ADMIN_COOKIE = 'coffee_admin'
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

/** 서명 쿠키 값은 만료 시각(ms). 서명이 맞고 아직 만료 전이면 관리자 */
export function isAdmin(req: Request): boolean {
  const value: unknown = req.signedCookies?.[ADMIN_COOKIE]
  if (typeof value !== 'string') return false
  const expiresAt = Number(value)
  return Number.isFinite(expiresAt) && expiresAt > Date.now()
}

export function issueAdminCookie(res: Response, config: Config): void {
  res.cookie(ADMIN_COOKIE, String(Date.now() + MAX_AGE_MS), {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: MAX_AGE_MS,
    path: '/',
  })
}

export function clearAdminCookie(res: Response): void {
  res.clearCookie(ADMIN_COOKIE, { path: '/' })
}

/** 길이와 내용이 드러나지 않도록 SHA-256 다이제스트를 timing-safe 비교한다 */
export function checkPassword(input: unknown, expected: string): boolean {
  if (typeof input !== 'string') return false
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(input), digest(expected))
}

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (isAdmin(req)) {
    next()
    return
  }
  res.redirect(303, '/admin/login')
}

/** 다른 사이트에서 보낸 POST를 막는다 (SameSite 쿠키에 더한 이중 방어) */
export const sameOriginOnly: RequestHandler = (req, _res, next) => {
  const origin = req.get('origin')
  if (req.method === 'POST' && origin !== undefined) {
    let host: string | null
    try {
      host = new URL(origin).host
    } catch {
      host = null
    }
    if (host === null || host !== req.get('host')) throw new HttpError(403, '허용되지 않은 요청입니다')
  }
  next()
}

export function loginLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).render('admin/login', {
        title: '관리자 로그인',
        error: '로그인 시도가 너무 많습니다. 1분 뒤에 다시 시도하세요.',
      })
    },
  })
}
```

- [ ] **Step 4: `src/routes/admin.ts` 구현**

```ts
import { Router } from 'express'
import {
  checkPassword,
  clearAdminCookie,
  isAdmin,
  issueAdminCookie,
  loginLimiter,
  requireAdmin,
  sameOriginOnly,
} from '../auth.js'
import type { Config } from '../config.js'
import type { Repos } from '../repository.js'

export type AdminDeps = { config: Config; repos: Repos }

export function adminRouter({ config }: AdminDeps): Router {
  const router = Router()
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  router.use(sameOriginOnly)

  router.get('/login', (req, res) => {
    if (isAdmin(req)) {
      res.redirect(303, '/admin')
      return
    }
    res.render('admin/login', { title: '관리자 로그인', error: null })
  })

  router.post('/login', loginLimiter(), (req, res) => {
    if (!checkPassword(req.body?.password, config.adminPassword)) {
      res.status(401).render('admin/login', { title: '관리자 로그인', error: '비밀번호가 올바르지 않습니다.' })
      return
    }
    issueAdminCookie(res, config)
    res.redirect(303, '/admin')
  })

  router.post('/logout', (_req, res) => {
    clearAdminCookie(res)
    res.redirect(303, '/')
  })

  // 여기부터는 로그인한 관리자만
  router.use(requireAdmin)

  router.get('/', (_req, res) => {
    res.redirect(303, '/admin/beans')
  })

  return router
}
```

- [ ] **Step 5: `src/app.ts`에 연결**

`src/app.ts`를 다음으로 바꾼다:
```ts
import cookieParser from 'cookie-parser'
import express from 'express'
import type { Pool } from 'pg'
import { isAdmin } from './auth.js'
import type { Config } from './config.js'
import { errorHandler, notFound } from './errors.js'
import { PUBLIC_DIR, VIEWS_DIR, vendorDir } from './paths.js'
import { createRepos } from './repository.js'
import { adminRouter } from './routes/admin.js'
import { publicRouter } from './routes/public.js'

export type AppDeps = { config: Config; pool: Pool }

export function createApp({ config, pool }: AppDeps) {
  const app = express()
  app.disable('x-powered-by')
  // 같은 서버의 리버스 프록시(nginx 등)만 신뢰한다 (로그인 시도 제한의 IP 판별용)
  app.set('trust proxy', 'loopback')
  app.set('view engine', 'ejs')
  app.set('views', VIEWS_DIR)
  // 정적 파일 캐시 무효화용 버전 (?v=)
  app.locals.assetVersion = Date.now().toString(36)

  const staticOptions = { maxAge: '7d' }
  app.use(express.static(PUBLIC_DIR, staticOptions))
  app.use('/vendor/bootstrap', express.static(vendorDir('bootstrap', 'dist'), staticOptions))
  app.use('/vendor/bootstrap-icons', express.static(vendorDir('bootstrap-icons', 'font'), staticOptions))
  app.use('/vendor/pretendard', express.static(vendorDir('pretendard', 'dist/web/variable'), staticOptions))

  app.use(express.urlencoded({ extended: false, limit: '100kb' }))
  app.use(cookieParser(config.sessionSecret))
  // 템플릿에서 관리자 전용 링크(수정 버튼 등)를 보여줄지 정한다
  app.use((req, res, next) => {
    res.locals.isAdmin = isAdmin(req)
    next()
  })

  const repos = createRepos(pool)

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true })
  })
  app.use('/admin', adminRouter({ config, repos }))
  app.use(publicRouter(repos))

  app.use(notFound)
  app.use(errorHandler)
  return app
}
```

- [ ] **Step 6: 템플릿과 스타일 작성**

`views/admin/login.ejs`:
```ejs
<%- include('../partials/head') %>
<main class="container py-5">
  <div class="card shadow-sm mx-auto coffee-login">
    <div class="card-body p-4">
      <h1 class="h5 mb-3"><i class="bi bi-lock"></i> 관리자 로그인</h1>
      <% if (error) { %>
        <div class="alert alert-danger py-2" role="alert"><%= error %></div>
      <% } %>
      <form method="post" action="/admin/login" class="vstack gap-3">
        <div>
          <label class="form-label" for="password">비밀번호</label>
          <input class="form-control" id="password" name="password" type="password" autocomplete="current-password" required autofocus>
        </div>
        <button class="btn btn-primary" type="submit">로그인</button>
      </form>
    </div>
  </div>
  <p class="text-center mt-3 mb-0"><a class="small text-body-secondary" href="/">공개 페이지로</a></p>
</main>
<%- include('../partials/foot') %>
```

`views/partials/admin-header.ejs`:
```ejs
<header class="border-bottom bg-body">
  <nav class="navbar navbar-expand container">
    <a class="navbar-brand fw-bold" href="/admin"><i class="bi bi-cup-hot-fill text-primary"></i> 관리</a>
    <ul class="navbar-nav me-auto">
      <li class="nav-item">
        <a class="nav-link<%= locals.active === 'beans' ? ' active' : '' %>" href="/admin/beans">원두 노트</a>
      </li>
      <li class="nav-item">
        <a class="nav-link<%= locals.active === 'cafe-visits' ? ' active' : '' %>" href="/admin/cafe-visits">카페 후기</a>
      </li>
    </ul>
    <div class="coffee-actions">
      <a class="btn btn-sm btn-outline-secondary" href="/" title="공개 페이지">
        <i class="bi bi-box-arrow-up-right"></i><span class="d-none d-sm-inline"> 공개 페이지</span>
      </a>
      <form method="post" action="/admin/logout">
        <button class="btn btn-sm btn-outline-secondary" type="submit" title="로그아웃">
          <i class="bi bi-box-arrow-right"></i><span class="d-none d-sm-inline"> 로그아웃</span>
        </button>
      </form>
    </div>
  </nav>
</header>
```

`public/css/app.css` 끝에 추가:
```css
/* ===== 관리자 ===== */
.coffee-login { max-width: 380px; }
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `pnpm test test/auth.test.ts test/app.test.ts && pnpm typecheck`
Expected: 모두 PASS, 타입 오류 없음

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "feat: 관리자 비밀번호 로그인과 접근 제어

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 관리자 작성·수정·삭제

**Files:**
- Modify: `src/routes/admin.ts` (목록·작성·수정·삭제 라우트)
- Create: `views/admin/list.ejs`, `views/admin/form.ejs`, `views/partials/field.ejs`
- Create: `public/js/admin.js`, `public/js/admin-main.js`
- Modify: `public/css/app.css` (끝에 관리자 목록·폼 스타일 추가)
- Test: `test/admin-crud.test.ts`, `test/admin-client.test.ts`

**Interfaces:**
- Consumes: `formValues` (Task 3), `DEFS`, `prepare`, `Entity`, `ResourceDef` (Task 3), `Repos` (Task 4), `toIndexEntry` (Task 5), `normalize` (Task 6, `public/js/query.js`), `requireAdmin` 등 (Task 8)
- Produces:
  - 라우트: `GET /admin/:path`, `GET /admin/:path/new`, `POST /admin/:path`, `GET /admin/:path/:id/edit`, `POST /admin/:path/:id`, `POST /admin/:path/:id/delete` (`:path`는 `beans` | `cafe-visits`)
  - 내부 헬퍼 `renderForm(res, def, options: FormOptions)` — `FormOptions = { entity: Entity | null; values?; errors?; status?; saved?; photoError? }` (Task 10이 `photoError`를 쓴다)
  - 템플릿 `admin/form` locals: `title, active, def, entity, values, errors, action, listHref, saved, photoError`
  - `initTotalScore(root: ParentNode): void`, `initConfirm(root: Document | HTMLElement, confirmFn?: (message: string) => boolean): void`, `initListFilter(root: ParentNode): void`
  - DOM 계약: `select[data-score]`, `[data-total-score]`, `form[data-confirm]`, `#admin-search`, `#admin-list [data-search]`, `#admin-empty`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/admin-crud.test.ts`:
```ts
import type { Express } from 'express'
import type { Pool } from 'pg'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createRepos, type Repos } from '../src/repository.js'
import { beanDef } from '../src/resources.js'
import { createTestPool, describeDb, resetData } from './db.js'
import { prepared } from './fixtures.js'
import { TEST_PASSWORD, testConfig } from './helpers.js'

describeDb('관리자 작성·수정·삭제', () => {
  let pool: Pool
  let repos: Repos
  let app: Express
  // 로그인 시도 제한(분당 10회)에 걸리지 않도록 로그인은 한 번만 한다
  let agent: ReturnType<typeof request.agent>

  beforeAll(async () => {
    pool = await createTestPool()
    repos = createRepos(pool)
    app = createApp({ config: testConfig(), pool })
    agent = request.agent(app)
    await agent.post('/admin/login').type('form').send({ password: TEST_PASSWORD }).expect(303)
  })

  afterAll(async () => {
    await pool.end()
  })

  beforeEach(async () => {
    await resetData(pool)
  })

  it('빈 목록과 새로 작성 폼', async () => {
    const list = await agent.get('/admin/beans')
    expect(list.status).toBe(200)
    expect(list.text).toContain('아직 기록이 없습니다.')
    expect(list.text).toContain('href="/admin/beans/new"')
    const form = await agent.get('/admin/beans/new')
    expect(form.status).toBe(200)
    expect(form.text).toContain('name="name"')
    expect(form.text).toContain('name="flavorTags"')
    expect(form.text).toContain('data-score')
    expect(form.text).toContain('저장한 뒤에 사진을 추가할 수 있습니다.')
  })

  it('원두 노트를 만든다', async () => {
    const res = await agent.post('/admin/beans').type('form').send({
      name: '에티오피아 구지',
      shop: '커피리브레',
      price: '18,000',
      isDecaf: 'on',
      flavorTags: '베리, 자스민',
      acidity: '8',
      sweetness: '7',
      body: '6',
      aftertaste: '9',
      purchasedAt: '2026-10-01',
    })
    expect(res.status).toBe(303)
    expect(res.headers.location).toBe('/admin/beans/1/edit?saved=1')
    expect(await repos.bean.get(1)).toMatchObject({
      name: '에티오피아 구지',
      price: 18000,
      isDecaf: true,
      flavorTags: ['베리', '자스민'],
      totalScore: 30,
      purchasedAt: '2026-10-01',
    })
    const edit = await agent.get(res.headers.location)
    expect(edit.text).toContain('저장했습니다.')
    expect(edit.text).toContain('value="에티오피아 구지"')
    expect(edit.text).toContain('value="베리, 자스민"')
    const list = await agent.get('/admin/beans')
    expect(list.text).toContain('에티오피아 구지')
    expect(list.text).toContain('data-search=')
    const home = await request(app).get('/')
    expect(home.text).toContain('에티오피아 구지')
  })

  it('검증에 실패하면 입력값을 유지하고 오류를 보여준다', async () => {
    const res = await agent.post('/admin/beans').type('form').send({ shop: '리브레', acidity: '11' })
    expect(res.status).toBe(400)
    expect(res.text).toContain('원두명 항목은 필수입니다')
    expect(res.text).toContain('10 이하여야 합니다')
    expect(res.text).toContain('value="리브레"')
    expect(res.text).toContain('is-invalid')
    expect(await repos.bean.list()).toHaveLength(0)
  })

  it('수정: 체크를 풀면 false가 된다', async () => {
    const bean = await repos.bean.create(prepared(beanDef, { name: '구지', shop: '리브레', isDecaf: 'on' }))
    const res = await agent.post(`/admin/beans/${bean.id}`).type('form').send({ name: '구지 G1', shop: '리브레' })
    expect(res.status).toBe(303)
    expect(res.headers.location).toBe(`/admin/beans/${bean.id}/edit?saved=1`)
    expect(await repos.bean.get(bean.id)).toMatchObject({ name: '구지 G1', isDecaf: false })
  })

  it('수정 검증 실패는 400이고 저장하지 않는다', async () => {
    const bean = await repos.bean.create(prepared(beanDef, { name: '구지', shop: '리브레' }))
    const res = await agent.post(`/admin/beans/${bean.id}`).type('form').send({ name: '', shop: '리브레' })
    expect(res.status).toBe(400)
    expect(res.text).toContain('원두명 항목은 필수입니다')
    expect((await repos.bean.get(bean.id))?.name).toBe('구지')
  })

  it('삭제', async () => {
    const bean = await repos.bean.create(prepared(beanDef, { name: '구지', shop: '리브레' }))
    const edit = await agent.get(`/admin/beans/${bean.id}/edit`)
    expect(edit.text).toContain('data-confirm="이 기록을 삭제할까요? 사진도 함께 삭제됩니다."')
    const res = await agent.post(`/admin/beans/${bean.id}/delete`)
    expect(res.status).toBe(303)
    expect(res.headers.location).toBe('/admin/beans')
    expect(await repos.bean.get(bean.id)).toBeNull()
    expect((await agent.post(`/admin/beans/${bean.id}/delete`)).status).toBe(404)
  })

  it('없는 기록은 404', async () => {
    expect((await agent.get('/admin/beans/999/edit')).status).toBe(404)
    expect((await agent.post('/admin/beans/999').type('form').send({ name: 'a', shop: 'b' })).status).toBe(404)
  })

  it('카페 후기를 만든다', async () => {
    const res = await agent.post('/admin/cafe-visits').type('form').send({
      menu: '게이샤 필터',
      cafeName: '프릳츠',
      rating: '4',
      mapUrl: 'https://map.naver.com/p/fritz',
    })
    expect(res.status).toBe(303)
    expect(res.headers.location).toBe('/admin/cafe-visits/1/edit?saved=1')
    expect(await repos.cafe.get(1)).toMatchObject({ menu: '게이샤 필터', rating: 4 })
    const form = await agent.get('/admin/cafe-visits/1/edit')
    expect(form.text).toContain('카페 후기 수정')
    expect(form.text).toMatch(/<option value="4" selected>/)
  })

  it('로그인하지 않으면 저장할 수 없다', async () => {
    const res = await request(app).post('/admin/beans').type('form').send({ name: 'a', shop: 'b' })
    expect(res.status).toBe(303)
    expect(res.headers.location).toBe('/admin/login')
    expect(await repos.bean.list()).toHaveLength(0)
  })
})
```

`test/admin-client.test.ts`:
```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { initConfirm, initListFilter, initTotalScore } from '../public/js/admin.js'

function mount(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  document.body.append(root)
  return root
}

function choose(select: HTMLSelectElement, value: string) {
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('initTotalScore', () => {
  it('네 점수를 모두 고르면 총점을 보여준다', () => {
    const options = ['', ...Array.from({ length: 10 }, (_, i) => String(i + 1))]
      .map((v) => `<option value="${v}">${v}</option>`)
      .join('')
    const root = mount(
      `${['acidity', 'sweetness', 'body', 'aftertaste'].map((n) => `<select data-score name="${n}">${options}</select>`).join('')}` +
        '<span data-total-score></span>',
    )
    initTotalScore(root)
    const total = () => root.querySelector('[data-total-score]')?.textContent
    const selects = [...root.querySelectorAll('select')]
    expect(total()).toBe('-')
    choose(selects[0], '8')
    choose(selects[1], '7')
    choose(selects[2], '6')
    expect(total()).toBe('-')
    choose(selects[3], '9')
    expect(total()).toBe('30')
  })
})

describe('initConfirm', () => {
  it('확인을 거절하면 제출을 막는다', () => {
    const root = mount('<form data-confirm="삭제할까요?"><button>삭제</button></form><form id="plain"></form>')
    const confirmFn = vi.fn(() => false)
    initConfirm(root, confirmFn)
    const event = new Event('submit', { bubbles: true, cancelable: true })
    root.querySelector('form')!.dispatchEvent(event)
    expect(confirmFn).toHaveBeenCalledWith('삭제할까요?')
    expect(event.defaultPrevented).toBe(true)

    const plain = new Event('submit', { bubbles: true, cancelable: true })
    root.querySelector('#plain')!.dispatchEvent(plain)
    expect(confirmFn).toHaveBeenCalledTimes(1)
    expect(plain.defaultPrevented).toBe(false)
  })

  it('확인하면 그대로 제출한다', () => {
    const root = mount('<form data-confirm="삭제할까요?"></form>')
    initConfirm(root, () => true)
    const event = new Event('submit', { bubbles: true, cancelable: true })
    root.querySelector('form')!.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })
})

describe('initListFilter', () => {
  it('검색어로 목록을 거르고 결과가 없으면 안내한다', () => {
    const root = mount(`
      <input id="admin-search">
      <div id="admin-list">
        <a data-search="에티오피아 구지 커피리브레">구지</a>
        <a data-search="케냐 aa 나무사이로">케냐</a>
      </div>
      <p id="admin-empty" hidden></p>`)
    initListFilter(root)
    const input = root.querySelector<HTMLInputElement>('#admin-search')!
    const visible = () => [...root.querySelectorAll<HTMLElement>('[data-search]')].filter((el) => !el.hidden).map((el) => el.textContent)
    const type = (value: string) => {
      input.value = value
      input.dispatchEvent(new Event('input'))
    }
    type('케냐')
    expect(visible()).toEqual(['케냐'])
    type('  AA  나무 ')
    expect(visible()).toEqual(['케냐'])
    type('없음')
    expect(visible()).toEqual([])
    expect(root.querySelector<HTMLElement>('#admin-empty')!.hidden).toBe(false)
    type('')
    expect(visible()).toEqual(['구지', '케냐'])
    expect(root.querySelector<HTMLElement>('#admin-empty')!.hidden).toBe(true)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm test test/admin-crud.test.ts test/admin-client.test.ts`
Expected: FAIL — `/admin/beans`가 404, `public/js/admin.js` 없음

- [ ] **Step 3: `src/routes/admin.ts`를 다음으로 바꾼다**

```ts
import { Router, type Response } from 'express'
import {
  checkPassword,
  clearAdminCookie,
  isAdmin,
  issueAdminCookie,
  loginLimiter,
  requireAdmin,
  sameOriginOnly,
} from '../auth.js'
import type { Config } from '../config.js'
import { HttpError, parseId } from '../errors.js'
import { formValues } from '../fields.js'
import type { Repos } from '../repository.js'
import { DEFS, prepare, type Entity, type ResourceDef } from '../resources.js'
import { toIndexEntry } from '../search-index.js'

export type AdminDeps = { config: Config; repos: Repos }

type FormOptions = {
  entity: Entity | null
  values?: Record<string, string | boolean>
  errors?: Record<string, string>
  status?: number
  saved?: boolean
  photoError?: string | null
}

const recordNotFound = () => new HttpError(404, '기록을 찾을 수 없습니다')

function renderForm(res: Response, def: ResourceDef, options: FormOptions): void {
  const { entity } = options
  const base = `/admin/${def.path}`
  res.status(options.status ?? 200).render('admin/form', {
    title: entity ? `${def.label} 수정` : `새 ${def.label}`,
    active: def.path,
    def,
    entity,
    values: options.values ?? formValues(def.sections, entity),
    errors: options.errors ?? {},
    action: entity ? `${base}/${entity.id}` : base,
    listHref: base,
    saved: options.saved ?? false,
    photoError: options.photoError ?? null,
  })
}

export function adminRouter({ config, repos }: AdminDeps): Router {
  const router = Router()
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  router.use(sameOriginOnly)

  router.get('/login', (req, res) => {
    if (isAdmin(req)) {
      res.redirect(303, '/admin')
      return
    }
    res.render('admin/login', { title: '관리자 로그인', error: null })
  })

  router.post('/login', loginLimiter(), (req, res) => {
    if (!checkPassword(req.body?.password, config.adminPassword)) {
      res.status(401).render('admin/login', { title: '관리자 로그인', error: '비밀번호가 올바르지 않습니다.' })
      return
    }
    issueAdminCookie(res, config)
    res.redirect(303, '/admin')
  })

  router.post('/logout', (_req, res) => {
    clearAdminCookie(res)
    res.redirect(303, '/')
  })

  // 여기부터는 로그인한 관리자만
  router.use(requireAdmin)

  router.get('/', (_req, res) => {
    res.redirect(303, '/admin/beans')
  })

  for (const def of Object.values(DEFS)) {
    const repo = repos[def.kind]
    const base = `/admin/${def.path}`

    router.get(`/${def.path}`, async (_req, res) => {
      const items = (await repo.list()).map((entity) => ({
        ...toIndexEntry(def, entity),
        thumbnailUrl: entity.thumbnailUrl,
        editHref: `${base}/${entity.id}/edit`,
      }))
      res.render('admin/list', { title: def.label, active: def.path, def, items, newHref: `${base}/new` })
    })

    router.get(`/${def.path}/new`, (_req, res) => {
      renderForm(res, def, { entity: null })
    })

    router.post(`/${def.path}`, async (req, res) => {
      const result = prepare(def, req.body)
      if (!result.ok) {
        renderForm(res, def, { entity: null, values: formValues(def.sections, req.body), errors: result.errors, status: 400 })
        return
      }
      const created = await repo.create(result.data)
      res.redirect(303, `${base}/${created.id}/edit?saved=1`)
    })

    router.get(`/${def.path}/:id/edit`, async (req, res) => {
      const entity = await repo.get(parseId(req.params.id))
      if (!entity) throw recordNotFound()
      renderForm(res, def, { entity, saved: req.query.saved === '1' })
    })

    router.post(`/${def.path}/:id`, async (req, res) => {
      const id = parseId(req.params.id)
      const entity = await repo.get(id)
      if (!entity) throw recordNotFound()
      const result = prepare(def, req.body)
      if (!result.ok) {
        renderForm(res, def, { entity, values: formValues(def.sections, req.body), errors: result.errors, status: 400 })
        return
      }
      await repo.update(id, result.data)
      res.redirect(303, `${base}/${id}/edit?saved=1`)
    })

    router.post(`/${def.path}/:id/delete`, async (req, res) => {
      const removed = await repo.remove(parseId(req.params.id))
      if (!removed) throw recordNotFound()
      res.redirect(303, base)
    })
  }

  return router
}
```

- [ ] **Step 4: 템플릿 작성**

`views/admin/list.ejs`:
```ejs
<%- include('../partials/head') %>
<%- include('../partials/admin-header') %>
<main class="container py-3">
  <div class="coffee-actions mb-3">
    <input type="search" class="form-control coffee-grow" id="admin-search" placeholder="<%= def.label %> 검색" aria-label="검색어" autocomplete="off">
    <a class="btn btn-primary text-nowrap" href="<%= newHref %>"><i class="bi bi-plus-lg"></i> 새로 작성</a>
  </div>
  <% if (items.length === 0) { %>
    <p class="text-center text-body-secondary py-5">아직 기록이 없습니다.</p>
  <% } else { %>
    <div class="list-group" id="admin-list">
      <% items.forEach((item) => { %>
        <a class="list-group-item list-group-item-action coffee-list-item" href="<%= item.editHref %>" data-search="<%= item.searchText %>">
          <% if (item.thumbnailUrl) { %>
            <img src="<%= item.thumbnailUrl %>" alt="" class="coffee-thumb rounded object-fit-cover">
          <% } else { %>
            <span class="coffee-thumb rounded bg-body-tertiary text-body-tertiary"><i class="bi <%= def.kind === 'bean' ? 'bi-basket' : 'bi-cup-hot' %>"></i></span>
          <% } %>
          <span class="coffee-grow min-w-0">
            <span class="d-block fw-semibold text-truncate"><%= item.title %></span>
            <span class="d-block small text-body-secondary text-truncate"><%= item.subtitle %> · <%= item.date.replaceAll('-', '.') %></span>
          </span>
          <i class="bi bi-chevron-right text-body-tertiary"></i>
        </a>
      <% }) %>
    </div>
    <p class="text-center text-body-secondary py-4" id="admin-empty" hidden>검색 결과가 없습니다.</p>
  <% } %>
</main>
<%- include('../partials/foot', { scripts: ['/js/admin-main.js'] }) %>
```

`views/partials/field.ejs`:
```ejs
<%
  const id = `f-${field.name}`
  const invalid = error ? ' is-invalid' : ''
  const inputTypes = { text: 'text', url: 'url', date: 'date', int: 'number', tags: 'text' }
  const range = field.type === 'score' ? [1, 10] : [1, 5]
%>
<div class="<%= field.wide ? 'col-12' : 'col-12 col-sm-6' %>">
<% if (field.type === 'bool') { %>
  <div class="form-check form-switch pt-sm-4">
    <input class="form-check-input" type="checkbox" role="switch" id="<%= id %>" name="<%= field.name %>"<%= value ? ' checked' : '' %>>
    <label class="form-check-label" for="<%= id %>"><%= field.label %></label>
  </div>
<% } else { %>
  <label class="form-label" for="<%= id %>">
    <%= field.label %><% if (field.required) { %> <span class="text-danger">*</span><% } %><% if (field.unit) { %> <span class="small text-body-secondary">(<%= field.unit %>)</span><% } %>
  </label>
  <% if (field.type === 'textarea') { %>
    <textarea class="form-control<%= invalid %>" id="<%= id %>" name="<%= field.name %>" rows="4" placeholder="<%= field.placeholder || '' %>"><%= value %></textarea>
  <% } else if (field.type === 'score' || field.type === 'rating') { %>
    <select class="form-select<%= invalid %>" id="<%= id %>" name="<%= field.name %>"<%= field.type === 'score' ? ' data-score' : '' %>>
      <option value="">선택 안 함</option>
      <% for (let n = range[0]; n <= range[1]; n += 1) { %>
        <option value="<%= n %>"<%= String(n) === value ? ' selected' : '' %>><%= field.type === 'rating' ? `${'★'.repeat(n)} ${n}점` : n %></option>
      <% } %>
    </select>
  <% } else { %>
    <input class="form-control<%= invalid %>" id="<%= id %>" name="<%= field.name %>" type="<%= inputTypes[field.type] %>" value="<%= value %>" placeholder="<%= field.placeholder || '' %>"<%= field.required ? ' required' : '' %><%- field.type === 'int' ? ` inputmode="numeric" min="${field.min ?? 0}" step="1"` : '' %>>
  <% } %>
  <% if (field.type === 'tags') { %><div class="form-text">쉼표(,)로 구분해서 입력하세요.</div><% } %>
  <% if (error) { %><div class="invalid-feedback"><%= error %></div><% } %>
<% } %>
</div>
```

`views/admin/form.ejs`:
```ejs
<%- include('../partials/head') %>
<%- include('../partials/admin-header') %>
<main class="container py-3 coffee-form-page">
  <nav aria-label="breadcrumb">
    <ol class="breadcrumb small mb-2">
      <li class="breadcrumb-item"><a href="<%= listHref %>"><%= def.label %></a></li>
      <li class="breadcrumb-item active" aria-current="page"><%= entity ? '수정' : '새로 작성' %></li>
    </ol>
  </nav>
  <h1 class="h4 mb-3"><%= title %></h1>
  <% if (saved) { %>
    <div class="alert alert-success py-2" role="status"><i class="bi bi-check-circle"></i> 저장했습니다.</div>
  <% } %>
  <% if (Object.keys(errors).length) { %>
    <div class="alert alert-danger py-2" role="alert">입력값을 확인해 주세요.</div>
  <% } %>

  <form method="post" action="<%= action %>" class="vstack gap-3" id="entry-form">
    <% def.sections.forEach((section) => { %>
      <fieldset class="card">
        <div class="card-body">
          <legend class="h6 mb-3"><%= section.title %></legend>
          <div class="row g-3">
            <% section.fields.forEach((field) => { %>
              <%- include('../partials/field', { field, value: values[field.name], error: errors[field.name] }) %>
            <% }) %>
          </div>
          <% if (section.showTotal) { %>
            <p class="mt-3 mb-0 fw-semibold text-primary">총점 <span data-total-score>-</span> / 40</p>
          <% } %>
        </div>
      </fieldset>
    <% }) %>
    <div class="coffee-form-actions sticky-bottom bg-body border-top py-2">
      <a class="btn btn-outline-secondary" href="<%= listHref %>">목록</a>
      <button class="btn btn-primary px-4" type="submit">저장</button>
    </div>
  </form>

  <% if (entity) { %>
    <form method="post" action="<%= action %>/delete" class="mt-4 text-end" data-confirm="이 기록을 삭제할까요? 사진도 함께 삭제됩니다.">
      <button class="btn btn-outline-danger" type="submit"><i class="bi bi-trash"></i> 기록 삭제</button>
    </form>
  <% } else { %>
    <p class="form-text mt-3">저장한 뒤에 사진을 추가할 수 있습니다.</p>
  <% } %>
</main>
<%- include('../partials/foot', { scripts: ['/js/admin-main.js'] }) %>
```

- [ ] **Step 5: 관리자 스크립트 작성**

`public/js/admin.js`:
```js
// @ts-check
import { normalize } from './query.js'

/**
 * 커핑 점수 4개를 모두 고르면 총점을 미리 보여준다
 * @param {ParentNode} root
 */
export function initTotalScore(root) {
  const output = root.querySelector('[data-total-score]')
  const selects = /** @type {HTMLSelectElement[]} */ ([...root.querySelectorAll('select[data-score]')])
  if (!output || selects.length === 0) return
  const update = () => {
    const values = selects.map((select) => select.value)
    output.textContent = values.every((v) => v !== '') ? String(values.reduce((sum, v) => sum + Number(v), 0)) : '-'
  }
  for (const select of selects) select.addEventListener('change', update)
  update()
}

/**
 * data-confirm 속성이 있는 폼은 제출 전에 확인을 받는다
 * @param {Document | HTMLElement} root
 * @param {(message: string) => boolean} [confirmFn]
 */
export function initConfirm(root, confirmFn = (message) => window.confirm(message)) {
  root.addEventListener('submit', (event) => {
    const form = event.target
    if (!(form instanceof HTMLFormElement)) return
    const message = form.dataset.confirm
    if (message && !confirmFn(message)) event.preventDefault()
  })
}

/**
 * 관리자 목록 즉시 검색
 * @param {ParentNode} root
 */
export function initListFilter(root) {
  const input = /** @type {HTMLInputElement | null} */ (root.querySelector('#admin-search'))
  const list = root.querySelector('#admin-list')
  const empty = /** @type {HTMLElement | null} */ (root.querySelector('#admin-empty'))
  if (!input || !list) return
  const items = /** @type {HTMLElement[]} */ ([...list.querySelectorAll('[data-search]')])
  input.addEventListener('input', () => {
    const tokens = normalize(input.value).split(' ').filter(Boolean)
    let shown = 0
    for (const item of items) {
      const text = item.dataset.search ?? ''
      const match = tokens.every((token) => text.includes(token))
      item.hidden = !match
      if (match) shown += 1
    }
    if (empty) empty.hidden = shown > 0
  })
}
```

`public/js/admin-main.js`:
```js
// @ts-check
import { initConfirm, initListFilter, initTotalScore } from './admin.js'

initTotalScore(document)
initConfirm(document)
initListFilter(document)
```

- [ ] **Step 6: 스타일 추가**

`public/css/app.css` 끝에 추가 (`hidden`으로 토글하는 목록 항목이라 `d-flex` 대신 커스텀 클래스를 쓴다):
```css
.coffee-grow { flex: 1 1 auto; }

.coffee-list-item {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.coffee-thumb {
  width: 56px;
  height: 56px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.coffee-form-page { max-width: 880px; }

.coffee-form-actions {
  z-index: 5;
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `pnpm test && pnpm typecheck`
Expected: 전체 PASS, 타입 오류 없음

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "feat: 관리자 원두·카페 작성, 수정, 삭제

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 사진 업로드·썸네일·삭제

**Files:**
- Create: `src/images.ts`, `src/storage.ts`, `src/photos.ts`
- Modify: `src/app.ts` (`/uploads` 서빙, 사진 서비스 연결), `src/routes/admin.ts` (사진 라우트, 글 삭제 시 파일 정리)
- Modify: `views/admin/form.ejs` (사진 관리 영역)
- Test: `test/images.test.ts`, `test/storage.test.ts`, `test/admin-photos.test.ts`

**Interfaces:**
- Consumes: `withTransaction` (Task 2), `HttpError`, `parseId` (Task 1), `Kind`, `PhotoRow`, `ResourceDef`, `DEFS` (Task 3), `Repos` (Task 4), `renderForm` (Task 9)
- Produces:
  - `type ProcessedImage = { main: Buffer; thumb: Buffer }`, `processImage(input: Buffer): Promise<ProcessedImage>` (실패 시 `HttpError(400, '이미지를 읽을 수 없습니다.')`)
  - `type SavedImage = { fileName: string; thumbName: string }`, `type Storage = { save(image: ProcessedImage): Promise<SavedImage>; remove(names: string[]): Promise<void> }`, `createStorage(dir: string): Storage`
  - `receivePhotos(req: Request, res: Response): Promise<Express.Multer.File[]>` (형식·용량 오류는 `HttpError(400)`)
  - `type PhotoOwner = { kind: Kind; id: number }`
  - `type PhotoService = { add(def, ownerId, files): Promise<void>; remove(photoId): Promise<PhotoOwner | null>; setThumbnail(photoId): Promise<PhotoOwner | null>; removeFiles(rows: PhotoRow[]): Promise<void> }`, `createPhotoService(pool: Pool, storage: Storage): PhotoService`
  - `AdminDeps`에 `photos: PhotoService` 추가
  - 라우트: `POST /admin/:path/:id/photos`, `POST /admin/photos/:id/thumbnail`, `POST /admin/photos/:id/delete`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/images.test.ts`:
```ts
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { processImage } from '../src/images.js'

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#8b4a2b' } }).png().toBuffer()

describe('processImage', () => {
  it('긴 변 기준으로 줄이고 WebP로 바꾼다', async () => {
    const { main, thumb } = await processImage(await png(3000, 2000))
    const [mainMeta, thumbMeta] = await Promise.all([sharp(main).metadata(), sharp(thumb).metadata()])
    expect(mainMeta.format).toBe('webp')
    expect(mainMeta.width).toBe(1600)
    expect(thumbMeta.format).toBe('webp')
    expect(thumbMeta.width).toBe(480)
  })

  it('작은 사진은 키우지 않는다', async () => {
    const { main, thumb } = await processImage(await png(400, 300))
    expect((await sharp(main).metadata()).width).toBe(400)
    expect((await sharp(thumb).metadata()).width).toBe(400)
  })

  it('이미지가 아니면 400', async () => {
    await expect(processImage(Buffer.from('not an image'))).rejects.toMatchObject({
      status: 400,
      message: '이미지를 읽을 수 없습니다.',
    })
  })
})
```

`test/storage.test.ts`:
```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createStorage } from '../src/storage.js'

describe('createStorage', () => {
  it('UUID 이름으로 저장하고 지운다', async () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'coffee-storage-')), 'nested')
    const storage = createStorage(dir)
    const saved = await storage.save({ main: Buffer.from('main'), thumb: Buffer.from('thumb') })
    expect(saved.fileName).toMatch(/^[0-9a-f-]{36}\.webp$/)
    expect(saved.thumbName).toBe(saved.fileName.replace('.webp', '-thumb.webp'))
    expect(fs.readFileSync(path.join(dir, saved.fileName), 'utf8')).toBe('main')
    expect(fs.readFileSync(path.join(dir, saved.thumbName), 'utf8')).toBe('thumb')

    await storage.remove([saved.fileName, saved.thumbName, 'missing.webp'])
    expect(fs.existsSync(path.join(dir, saved.fileName))).toBe(false)
    expect(fs.existsSync(path.join(dir, saved.thumbName))).toBe(false)
  })

  it('경로 조작이 들어와도 저장 폴더 밖은 지우지 않는다', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'coffee-storage-'))
    const outside = path.join(base, 'outside.txt')
    fs.writeFileSync(outside, 'keep')
    const storage = createStorage(path.join(base, 'uploads'))
    await storage.remove(['../outside.txt'])
    expect(fs.existsSync(outside)).toBe(true)
  })
})
```

`test/admin-photos.test.ts`:
```ts
import fs from 'node:fs'
import path from 'node:path'
import type { Express } from 'express'
import type { Pool } from 'pg'
import sharp from 'sharp'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createRepos, type Repos } from '../src/repository.js'
import { beanDef, cafeVisitDef } from '../src/resources.js'
import { createTestPool, describeDb, resetData } from './db.js'
import { prepared } from './fixtures.js'
import { TEST_PASSWORD, testConfig } from './helpers.js'

const png = (color: string) =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: color } }).png().toBuffer()

describeDb('관리자 사진', () => {
  let pool: Pool
  let repos: Repos
  let app: Express
  let uploadDir: string
  // 로그인 시도 제한(분당 10회)에 걸리지 않도록 로그인은 한 번만 한다
  let agent: ReturnType<typeof request.agent>

  const fileExists = (url: string) => fs.existsSync(path.join(uploadDir, path.basename(url)))

  async function upload(target: string, ...images: Buffer[]) {
    let req = agent.post(target)
    images.forEach((image, i) => {
      req = req.attach('photos', image, { filename: `p${i}.png`, contentType: 'image/png' })
    })
    return req
  }

  beforeAll(async () => {
    pool = await createTestPool()
    repos = createRepos(pool)
    const config = testConfig()
    uploadDir = config.uploadDir
    app = createApp({ config, pool })
    agent = request.agent(app)
    await agent.post('/admin/login').type('form').send({ password: TEST_PASSWORD }).expect(303)
  })

  afterAll(async () => {
    await pool.end()
  })

  beforeEach(async () => {
    await resetData(pool)
    await repos.bean.create(prepared(beanDef, { name: '에티오피아 구지', shop: '커피리브레' }))
  })

  it('여러 장을 올리면 변환해 저장하고 수정 화면으로 돌아간다', async () => {
    const res = await upload('/admin/beans/1/photos', await png('#c08040'), await png('#4080c0'))
    expect(res.status).toBe(303)
    expect(res.headers.location).toBe('/admin/beans/1/edit#photos')

    const bean = await repos.bean.get(1)
    expect(bean?.photos).toHaveLength(2)
    expect(bean?.thumbnailUrl).toBe(bean?.photos[0].thumbUrl)
    for (const photo of bean!.photos) {
      expect(fileExists(photo.url)).toBe(true)
      expect(fileExists(photo.thumbUrl)).toBe(true)
    }

    const image = await request(app).get(bean!.photos[0].url)
    expect(image.status).toBe(200)
    expect(image.type).toBe('image/webp')

    const home = await request(app).get('/')
    expect(home.text).toContain(bean!.photos[0].thumbUrl)

    const edit = await agent.get('/admin/beans/1/edit')
    expect(edit.text).toContain(bean!.photos[1].thumbUrl)
    expect(edit.text).toContain('썸네일')
  })

  it('썸네일은 한 장만 지정된다', async () => {
    await upload('/admin/beans/1/photos', await png('#c08040'), await png('#4080c0'))
    const [first, second] = (await repos.bean.get(1))!.photos

    const res = await agent.post(`/admin/photos/${second.id}/thumbnail`)
    expect(res.status).toBe(303)
    expect(res.headers.location).toBe('/admin/beans/1/edit#photos')
    expect((await repos.bean.get(1))?.thumbnailUrl).toBe(second.thumbUrl)

    await agent.post(`/admin/photos/${first.id}/thumbnail`).expect(303)
    const after = await repos.bean.get(1)
    expect(after?.photos.filter((p) => p.isThumbnail).map((p) => p.id)).toEqual([first.id])
  })

  it('사진을 지우면 파일도 지운다', async () => {
    await upload('/admin/beans/1/photos', await png('#c08040'))
    const [photo] = (await repos.bean.get(1))!.photos
    const res = await agent.post(`/admin/photos/${photo.id}/delete`)
    expect(res.status).toBe(303)
    expect(res.headers.location).toBe('/admin/beans/1/edit#photos')
    expect((await repos.bean.get(1))?.photos).toHaveLength(0)
    expect(fileExists(photo.url)).toBe(false)
    expect(fileExists(photo.thumbUrl)).toBe(false)
  })

  it('글을 지우면 사진 파일도 지운다', async () => {
    await upload('/admin/beans/1/photos', await png('#c08040'))
    const [photo] = (await repos.bean.get(1))!.photos
    await agent.post('/admin/beans/1/delete').expect(303)
    expect(fileExists(photo.url)).toBe(false)
    expect(fileExists(photo.thumbUrl)).toBe(false)
  })

  it('없는 사진은 404', async () => {
    expect((await agent.post('/admin/photos/999/delete')).status).toBe(404)
    expect((await agent.post('/admin/photos/999/thumbnail')).status).toBe(404)
  })

  it('이미지가 아니면 400과 함께 폼을 다시 보여준다', async () => {
    const res = await agent
      .post('/admin/beans/1/photos')
      .attach('photos', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' })
    expect(res.status).toBe(400)
    expect(res.text).toContain('JPG, PNG, WebP, AVIF 이미지만 올릴 수 있습니다.')
    expect(res.text).toContain('value="에티오피아 구지"')
  })

  it('사진 없이 올리면 400', async () => {
    const res = await agent.post('/admin/beans/1/photos').field('note', 'empty')
    expect(res.status).toBe(400)
    expect(res.text).toContain('올릴 사진을 선택하세요.')
  })

  it('없는 글에는 올릴 수 없다', async () => {
    const res = await upload('/admin/beans/999/photos', await png('#c08040'))
    expect(res.status).toBe(404)
  })

  it('카페 후기에도 올릴 수 있다', async () => {
    await repos.cafe.create(prepared(cafeVisitDef, { menu: '게이샤 필터', cafeName: '프릳츠' }))
    const res = await upload('/admin/cafe-visits/1/photos', await png('#c08040'))
    expect(res.headers.location).toBe('/admin/cafe-visits/1/edit#photos')
    expect((await repos.cafe.get(1))?.photos).toHaveLength(1)
  })

  it('로그인하지 않으면 올릴 수 없다', async () => {
    const res = await request(app)
      .post('/admin/beans/1/photos')
      .attach('photos', await png('#c08040'), { filename: 'a.png', contentType: 'image/png' })
    expect(res.status).toBe(303)
    expect(res.headers.location).toBe('/admin/login')
    expect((await repos.bean.get(1))?.photos).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm test test/images.test.ts test/storage.test.ts test/admin-photos.test.ts`
Expected: FAIL — `src/images.js`, `src/storage.js` 없음, 사진 라우트 404

- [ ] **Step 3: `src/images.ts`, `src/storage.ts` 구현**

`src/images.ts`:
```ts
import sharp from 'sharp'
import { HttpError } from './errors.js'

export type ProcessedImage = { main: Buffer; thumb: Buffer }

/** EXIF 방향을 바로잡고 본 이미지(긴 변 1600px)와 썸네일(긴 변 480px)을 WebP로 만든다 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  try {
    const base = sharp(input, { failOn: 'error' }).rotate()
    const [main, thumb] = await Promise.all([
      base.clone().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
      base.clone().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer(),
    ])
    return { main, thumb }
  } catch {
    throw new HttpError(400, '이미지를 읽을 수 없습니다.')
  }
}
```

`src/storage.ts`:
```ts
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ProcessedImage } from './images.js'

export type SavedImage = { fileName: string; thumbName: string }

export type Storage = {
  save(image: ProcessedImage): Promise<SavedImage>
  remove(names: string[]): Promise<void>
}

export function createStorage(dir: string): Storage {
  // 파일 이름만 쓰므로 '../' 같은 경로가 들어와도 저장 폴더 밖으로 나가지 않는다
  const fullPath = (name: string) => path.join(dir, path.basename(name))
  return {
    async save(image) {
      await fs.mkdir(dir, { recursive: true })
      const id = randomUUID()
      const saved = { fileName: `${id}.webp`, thumbName: `${id}-thumb.webp` }
      await Promise.all([
        fs.writeFile(fullPath(saved.fileName), image.main),
        fs.writeFile(fullPath(saved.thumbName), image.thumb),
      ])
      return saved
    },

    async remove(names) {
      await Promise.all(names.map((name) => fs.rm(fullPath(name), { force: true })))
    },
  }
}
```

- [ ] **Step 4: `src/photos.ts` 구현**

```ts
import type { Request, Response } from 'express'
import multer from 'multer'
import type { Pool } from 'pg'
import { withTransaction } from './db.js'
import { HttpError } from './errors.js'
import { processImage } from './images.js'
import type { Kind, PhotoRow, ResourceDef } from './resources.js'
import type { SavedImage, Storage } from './storage.js'

const MAX_PHOTO_BYTES = 15 * 1024 * 1024
const MAX_PHOTOS_PER_UPLOAD = 20
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])

const MULTER_MESSAGES: Record<string, string> = {
  LIMIT_FILE_SIZE: '사진 한 장은 15MB 이하여야 합니다.',
  LIMIT_FILE_COUNT: `사진은 한 번에 ${MAX_PHOTOS_PER_UPLOAD}장까지 올릴 수 있습니다.`,
  LIMIT_UNEXPECTED_FILE: `사진은 한 번에 ${MAX_PHOTOS_PER_UPLOAD}장까지 올릴 수 있습니다.`,
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_PHOTOS_PER_UPLOAD },
  fileFilter: (_req, file, callback) => {
    if (ALLOWED_TYPES.has(file.mimetype)) callback(null, true)
    else callback(new HttpError(400, 'JPG, PNG, WebP, AVIF 이미지만 올릴 수 있습니다.'))
  },
}).array('photos', MAX_PHOTOS_PER_UPLOAD)

/** multipart 요청에서 사진 파일을 꺼낸다. 형식·용량 오류는 HttpError(400) */
export function receivePhotos(req: Request, res: Response): Promise<Express.Multer.File[]> {
  return new Promise((resolve, reject) => {
    upload(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        reject(new HttpError(400, MULTER_MESSAGES[err.code] ?? '사진을 올리지 못했습니다.'))
        return
      }
      if (err) {
        reject(err)
        return
      }
      resolve((req.files as Express.Multer.File[] | undefined) ?? [])
    })
  })
}

export type PhotoOwner = { kind: Kind; id: number }

export type PhotoService = {
  add(def: ResourceDef, ownerId: number, files: Express.Multer.File[]): Promise<void>
  /** 사진 행과 파일을 지우고 소유 글을 돌려준다. 없으면 null */
  remove(photoId: number): Promise<PhotoOwner | null>
  /** 같은 글의 다른 썸네일 지정을 풀고 이 사진을 썸네일로 지정한다. 없으면 null */
  setThumbnail(photoId: number): Promise<PhotoOwner | null>
  removeFiles(rows: PhotoRow[]): Promise<void>
}

const ownerOf = (row: PhotoRow): PhotoOwner =>
  row.bean_id !== null ? { kind: 'bean', id: row.bean_id } : { kind: 'cafe', id: row.cafe_visit_id as number }

const fileNamesOf = (rows: PhotoRow[]) => rows.flatMap((row) => [row.file_name, row.thumb_name])

export function createPhotoService(pool: Pool, storage: Storage): PhotoService {
  return {
    async add(def, ownerId, files) {
      if (files.length === 0) throw new HttpError(400, '올릴 사진을 선택하세요.')
      const saved: SavedImage[] = []
      try {
        for (const file of files) saved.push(await storage.save(await processImage(file.buffer)))
        await withTransaction(pool, async (client) => {
          const { rows } = await client.query<{ next: number }>(
            `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM photos WHERE ${def.photoFk} = $1`,
            [ownerId],
          )
          for (const [i, image] of saved.entries()) {
            await client.query(
              `INSERT INTO photos (${def.photoFk}, file_name, thumb_name, sort_order) VALUES ($1, $2, $3, $4)`,
              [ownerId, image.fileName, image.thumbName, rows[0].next + i],
            )
          }
        })
      } catch (err) {
        // DB에 남지 않은 파일은 지운다
        await storage.remove(saved.flatMap((image) => [image.fileName, image.thumbName]))
        throw err
      }
    },

    async remove(photoId) {
      const { rows } = await pool.query<PhotoRow>('DELETE FROM photos WHERE id = $1 RETURNING *', [photoId])
      if (!rows[0]) return null
      await storage.remove(fileNamesOf(rows))
      return ownerOf(rows[0])
    },

    async setThumbnail(photoId) {
      return withTransaction(pool, async (client) => {
        const { rows } = await client.query<PhotoRow>('SELECT * FROM photos WHERE id = $1 FOR UPDATE', [photoId])
        const photo = rows[0]
        if (!photo) return null
        const fk = photo.bean_id !== null ? 'bean_id' : 'cafe_visit_id'
        await client.query(`UPDATE photos SET is_thumbnail = false WHERE ${fk} = $1 AND is_thumbnail`, [photo[fk]])
        await client.query('UPDATE photos SET is_thumbnail = true WHERE id = $1', [photoId])
        return ownerOf(photo)
      })
    },

    removeFiles: (rows) => storage.remove(fileNamesOf(rows)),
  }
}
```

- [ ] **Step 5: 라우트와 앱 연결**

`src/routes/admin.ts`에서 다음을 바꾼다.

import 블록에 추가:
```ts
import { receivePhotos, type PhotoOwner, type PhotoService } from '../photos.js'
```

`AdminDeps`를 바꾼다:
```ts
export type AdminDeps = { config: Config; repos: Repos; photos: PhotoService }
```

함수 시그니처를 바꾼다:
```ts
export function adminRouter({ config, repos, photos }: AdminDeps): Router {
```

`for (const def of Object.values(DEFS))` 루프 안의 삭제 라우트를 다음으로 바꾸고, 그 바로 아래(루프 안)에 업로드 라우트를 추가한다:
```ts
    router.post(`/${def.path}/:id/delete`, async (req, res) => {
      const removed = await repo.remove(parseId(req.params.id))
      if (!removed) throw recordNotFound()
      await photos.removeFiles(removed)
      res.redirect(303, base)
    })

    router.post(`/${def.path}/:id/photos`, async (req, res) => {
      const id = parseId(req.params.id)
      const entity = await repo.get(id)
      if (!entity) throw recordNotFound()
      try {
        await photos.add(def, id, await receivePhotos(req, res))
      } catch (err) {
        if (err instanceof HttpError && err.status === 400) {
          renderForm(res, def, { entity, status: 400, photoError: err.message })
          return
        }
        throw err
      }
      res.redirect(303, `${base}/${id}/edit#photos`)
    })
```

루프가 끝난 뒤, `return router` 바로 앞에 사진 단위 라우트를 추가한다:
```ts
  const photosHref = (owner: PhotoOwner) => `/admin/${DEFS[owner.kind].path}/${owner.id}/edit#photos`

  router.post('/photos/:id/thumbnail', async (req, res) => {
    const owner = await photos.setThumbnail(parseId(req.params.id))
    if (!owner) throw new HttpError(404, '사진을 찾을 수 없습니다')
    res.redirect(303, photosHref(owner))
  })

  router.post('/photos/:id/delete', async (req, res) => {
    const owner = await photos.remove(parseId(req.params.id))
    if (!owner) throw new HttpError(404, '사진을 찾을 수 없습니다')
    res.redirect(303, photosHref(owner))
  })
```

`src/app.ts`에서 다음을 바꾼다.

import 블록에 추가:
```ts
import { createPhotoService } from './photos.js'
import { createStorage } from './storage.js'
```

`const repos = createRepos(pool)` 아래에 추가:
```ts
  const photos = createPhotoService(pool, createStorage(config.uploadDir))
  // 사진 파일 이름은 UUID라 내용이 바뀌지 않는다
  app.use('/uploads', express.static(config.uploadDir, { maxAge: '365d', immutable: true }))
```

관리자 라우터 연결을 바꾼다:
```ts
  app.use('/admin', adminRouter({ config, repos, photos }))
```

- [ ] **Step 6: 수정 화면에 사진 관리 영역 추가**

`views/admin/form.ejs`에서 다음 부분을
```ejs
  <% if (entity) { %>
    <form method="post" action="<%= action %>/delete" class="mt-4 text-end" data-confirm="이 기록을 삭제할까요? 사진도 함께 삭제됩니다.">
```
아래처럼 바꾼다 (삭제 폼 앞에 사진 영역을 넣는다):
```ejs
  <% if (entity) { %>
    <section class="card mt-4" id="photos">
      <div class="card-body">
        <h2 class="h6 mb-3">사진</h2>
        <% if (photoError) { %>
          <div class="alert alert-danger py-2" role="alert"><%= photoError %></div>
        <% } %>
        <form method="post" action="<%= action %>/photos" enctype="multipart/form-data" class="coffee-actions mb-2">
          <input class="form-control coffee-grow" type="file" name="photos" accept="image/jpeg,image/png,image/webp,image/avif" multiple required aria-label="사진 파일">
          <button class="btn btn-outline-primary text-nowrap" type="submit"><i class="bi bi-upload"></i> 업로드</button>
        </form>
        <p class="form-text mb-3">대표로 지정한 사진이 카드 썸네일이 됩니다. 지정하지 않으면 첫 번째 사진을 씁니다.</p>
        <% if (entity.photos.length) { %>
          <div class="row row-cols-3 row-cols-sm-4 row-cols-md-5 g-2">
            <% entity.photos.forEach((photo) => { const isThumb = photo.thumbUrl === entity.thumbnailUrl %>
              <div class="col">
                <div class="card h-100<%= isThumb ? ' border-primary border-2' : '' %>">
                  <div class="ratio ratio-1x1">
                    <img src="<%= photo.thumbUrl %>" alt="" class="rounded-top object-fit-cover">
                  </div>
                  <div class="card-body p-1 coffee-actions">
                    <% if (isThumb) { %>
                      <span class="badge text-bg-primary coffee-grow align-self-center">썸네일</span>
                    <% } else { %>
                      <form method="post" action="/admin/photos/<%= photo.id %>/thumbnail" class="coffee-grow">
                        <button class="btn btn-sm btn-outline-primary w-100" type="submit" title="썸네일로 지정" aria-label="썸네일로 지정"><i class="bi bi-star"></i></button>
                      </form>
                    <% } %>
                    <form method="post" action="/admin/photos/<%= photo.id %>/delete" data-confirm="사진을 삭제할까요?">
                      <button class="btn btn-sm btn-outline-danger" type="submit" title="사진 삭제" aria-label="사진 삭제"><i class="bi bi-trash"></i></button>
                    </form>
                  </div>
                </div>
              </div>
            <% }) %>
          </div>
        <% } %>
      </div>
    </section>
    <form method="post" action="<%= action %>/delete" class="mt-4 text-end" data-confirm="이 기록을 삭제할까요? 사진도 함께 삭제됩니다.">
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `pnpm test && pnpm typecheck`
Expected: 전체 PASS (images 3, storage 2, admin-photos 10 포함), 타입 오류 없음

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "feat: 사진 업로드, 썸네일 지정, 삭제

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 서버 진입점, README, 최종 검증

**Files:**
- Create: `src/index.ts`, `README.md`

**Interfaces:**
- Consumes: `loadConfig` (Task 1), `createPool` (Task 2), `createApp` (Task 10까지 완성본)
- Produces: `pnpm dev` / `pnpm start`로 실행되는 서버

- [ ] **Step 1: `src/index.ts` 작성**

```ts
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { createPool } from './db.js'

try {
  process.loadEnvFile()
} catch {
  // .env가 없으면 환경변수만 사용
}

const config = loadConfig()
const pool = createPool(config.databaseUrl)

createApp({ config, pool }).listen(config.port, () => {
  console.log(`Coffee Note: http://localhost:${config.port}`)
})
```

- [ ] **Step 2: `README.md` 작성**

````markdown
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
pnpm build && pnpm start   # 운영
```

- 공개 화면: `http://localhost:4000/`
- 관리자: `http://localhost:4000/admin` (비밀번호 로그인)

## 배포 메모

- nginx 같은 리버스 프록시를 같은 서버에 두고 HTTPS를 붙인 뒤 `COOKIE_SECURE=true`로 설정합니다. 프록시는 `Host` 헤더를 그대로 넘겨야 합니다(관리자 POST의 출처 확인에 사용).
- 사진 업로드 크기(장당 15MB, 최대 20장)에 맞춰 프록시의 요청 본문 제한(`client_max_body_size` 등)을 늘립니다.
- `UPLOAD_DIR`과 DB를 함께 백업합니다.
- 스키마를 바꿀 때는 `migrations/`에 다음 번호의 SQL 파일을 추가하고 `pnpm migrate`를 실행합니다.
````

- [ ] **Step 3: 정적 검사와 전체 테스트**

Run: `pnpm typecheck && pnpm test`
Expected: 타입 오류 없음, 모든 테스트 PASS (DB 테스트 포함, skip 0개 — `.env`에 `TEST_DATABASE_URL`이 있어야 한다)

- [ ] **Step 4: 빌드**

Run: `pnpm build && ls dist/index.js dist/routes/admin.js`
Expected: 빌드 성공, 두 파일 존재

- [ ] **Step 5: 실제 DB에 마이그레이션**

Run: `pnpm migrate`
Expected: `적용: 001_init.sql` 후 `1개 마이그레이션 적용 완료` (이미 적용됐다면 `적용할 마이그레이션이 없습니다`)

- [ ] **Step 6: 운영 모드로 실행해 확인**

Run (백그라운드): `NODE_ENV=production pnpm start`
Then: `curl -s localhost:4000/healthz`
Expected: `{"ok":true}`

브라우저(webapp-testing 또는 claude-in-chrome)로 375px·1440px 폭에서 확인한다:
1. `/` — 카드가 없을 때 "조건에 맞는 기록이 없습니다." 안내
2. `/admin` → 로그인 → 원두 노트 1개 작성(점수·태그·디카페인 포함) → 사진 2장 업로드 → 두 번째 사진을 썸네일로 지정
3. 카페 후기 1개 작성
4. `/` — 원두 탭 카드에 썸네일·총점·배지, 카페 탭 전환, "전체" 범위에서 종류 배지, 검색어 입력 시 즉시 필터, 정렬 변경, 카드 클릭 시 상세 모달(모바일 폭에서 전체 화면, 사진 스와이프)
5. 1440px에서 한 줄 4장 이상, 375px에서 한 줄 1장으로 배치되는지 확인
6. 확인용으로 만든 기록은 관리자 화면에서 삭제

확인이 끝나면 서버 프로세스를 종료한다.

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "feat: 서버 진입점과 README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
