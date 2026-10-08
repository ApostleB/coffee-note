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
