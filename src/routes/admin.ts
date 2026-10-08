import { Router, type Response } from 'express'
import {
  checkPassword,
  clearAdminCookie,
  isAdmin,
  issueAdminCookie,
  requireAdmin,
  sameOriginOnly,
} from '../auth.js'
import type { Config } from '../config.js'
import { HttpError, parseId } from '../errors.js'
import { formValues } from '../fields.js'
import type { LoginGuard } from '../login-guard.js'
import { receivePhotos, type PhotoOwner, type PhotoService } from '../photos.js'
import { DEFS, prepare, type Entity, type ResourceDef } from '../resources.js'
import { toIndexEntry } from '../search-index.js'
import type { Repos } from '../repository.js'

export type AdminDeps = { config: Config; repos: Repos; photos: PhotoService; loginGuard: LoginGuard }

type FormOptions = {
  entity: Entity | null
  values?: Record<string, string | boolean>
  errors?: Record<string, string>
  status?: number
  saved?: boolean
  copied?: boolean
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
    copied: options.copied ?? false,
    photoError: options.photoError ?? null,
  })
}

export function adminRouter({ config, repos, photos, loginGuard }: AdminDeps): Router {
  const router = Router()
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  router.use(sameOriginOnly)
  // 로그인 실패가 쌓여 차단된 IP는 /admin 아래 모든 요청을 거부한다 (비밀번호 확인도 하지 않는다)
  router.use((req, res, next) => {
    const state = loginGuard.check(req.ip ?? '')
    if (!state.blocked) {
      next()
      return
    }
    const minutes = Math.ceil(state.retryAfterMs / 60_000)
    res
      .status(429)
      .set('Retry-After', String(Math.ceil(state.retryAfterMs / 1000)))
      .render('admin/login', {
        title: '관리자 로그인',
        error: `로그인 시도가 너무 많아 차단되었습니다. ${minutes}분 후 다시 시도하세요.`,
      })
  })

  router.get('/login', (req, res) => {
    if (isAdmin(req)) {
      res.redirect(303, '/admin')
      return
    }
    res.render('admin/login', { title: '관리자 로그인', error: null })
  })

  router.post('/login', (req, res) => {
    const ip = req.ip ?? ''
    if (!checkPassword(req.body?.password, config.adminPassword)) {
      loginGuard.recordFailure(ip)
      res.status(401).render('admin/login', { title: '관리자 로그인', error: '비밀번호가 올바르지 않습니다.' })
      return
    }
    loginGuard.recordSuccess(ip)
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
      renderForm(res, def, { entity, saved: req.query.saved === '1', copied: req.query.copied === '1' })
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

    router.post(`/${def.path}/:id/copy`, async (req, res) => {
      // 사진은 파일 공유로 삭제가 꼬이지 않도록 복사하지 않는다
      const created = await repo.copy(parseId(req.params.id))
      if (!created) throw recordNotFound()
      res.redirect(303, `${base}/${created.id}/edit?copied=1`)
    })

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
  }

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

  return router
}
