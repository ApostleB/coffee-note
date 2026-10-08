import { createHash, timingSafeEqual } from 'node:crypto'
import type { Request, RequestHandler, Response } from 'express'
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

/** 다른 사이트에서 보낸 POST를 막는다 (SameSite 쿠키에 더한 이중 방어). 프로토콜·호스트·포트 전체를 비교한다 */
export const sameOriginOnly: RequestHandler = (req, _res, next) => {
  const origin = req.get('origin')
  if (req.method === 'POST' && origin !== undefined) {
    let originOfRequest: string | null
    try {
      originOfRequest = new URL(origin).origin
    } catch {
      originOfRequest = null
    }
    if (originOfRequest === null || originOfRequest !== `${req.protocol}://${req.get('host')}`) {
      throw new HttpError(403, '허용되지 않은 요청입니다')
    }
  }
  next()
}
