import cookieParser from 'cookie-parser'
import express from 'express'
import type { Pool } from 'pg'
import { isAdmin } from './auth.js'
import type { Config } from './config.js'
import { errorHandler, notFound } from './errors.js'
import { createLoginGuard, type LoginGuard } from './login-guard.js'
import { PUBLIC_DIR, VIEWS_DIR, vendorDir } from './paths.js'
import { createPhotoService } from './photos.js'
import { createRepos } from './repository.js'
import { adminRouter } from './routes/admin.js'
import { publicRouter } from './routes/public.js'
import { createStorage } from './storage.js'

export type AppDeps = { config: Config; pool: Pool; loginGuard?: LoginGuard }

export function createApp({ config, pool, loginGuard = createLoginGuard() }: AppDeps) {
  const app = express()
  app.disable('x-powered-by')
  // 같은 서버의 리버스 프록시(nginx 등)만 신뢰한다 (로그인 시도 제한의 IP 판별용)
  app.set('trust proxy', 'loopback')
  app.set('view engine', 'ejs')
  app.set('views', VIEWS_DIR)
  // 정적 파일 캐시 무효화용 버전 (?v=)
  app.locals.assetVersion = Date.now().toString(36)

  const staticOptions = { maxAge: '7d' }
  // ES 모듈의 하위 import(./query.js 등)에는 ?v=를 붙일 수 없으므로 JS는 매번 ETag로 재검증한다
  app.use(
    express.static(PUBLIC_DIR, {
      ...staticOptions,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js')) res.setHeader('Cache-Control', 'no-cache')
      },
    }),
  )
  app.use('/vendor/bootstrap', express.static(vendorDir('bootstrap', 'dist'), staticOptions))
  app.use('/vendor/bootstrap-icons', express.static(vendorDir('bootstrap-icons', 'font'), staticOptions))
  app.use('/vendor/pretendard', express.static(vendorDir('pretendard', 'dist/web/variable'), staticOptions))

  // 본문 파싱 오류도 오류 페이지로 렌더링되므로 템플릿 변수는 파서보다 먼저 초기화한다
  app.use((_req, res, next) => {
    res.locals.isAdmin = false
    next()
  })

  app.use(express.urlencoded({ extended: false, limit: '100kb' }))
  app.use(cookieParser(config.sessionSecret))
  // 템플릿에서 관리자 전용 링크(수정 버튼 등)를 보여줄지 정한다
  app.use((req, res, next) => {
    res.locals.isAdmin = isAdmin(req)
    next()
  })

  const repos = createRepos(pool)
  const photos = createPhotoService(pool, createStorage(config.uploadDir))
  // 사진 파일 이름은 UUID라 내용이 바뀌지 않는다
  app.use('/uploads', express.static(config.uploadDir, { maxAge: '365d', immutable: true }))

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true })
  })

  app.use('/admin', adminRouter({ config, repos, photos, loginGuard }))
  app.use(publicRouter(repos))

  app.use(notFound)
  app.use(errorHandler)
  return app
}
