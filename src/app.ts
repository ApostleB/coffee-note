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
