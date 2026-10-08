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
