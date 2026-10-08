import type { Express } from 'express'
import type { Pool } from 'pg'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createRepos, type Repos } from '../src/repository.js'
import { beanDef, cafeVisitDef } from '../src/resources.js'
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
  it('엄격하지 않은 ID는 조회·수정·삭제 모두 404', async () => {
    for (const id of ['01', '1e3', '0x10', '0', '-1', '2147483648']) {
      expect((await agent.get(`/admin/beans/${id}/edit`)).status).toBe(404)
      expect((await agent.post(`/admin/beans/${id}`).type('form').send({ name: 'a', shop: 'b' })).status).toBe(404)
      expect((await agent.post(`/admin/beans/${id}/delete`)).status).toBe(404)
    }
  })

  it('출처가 다른 CRUD 요청은 거부한다', async () => {
    const bean = await repos.bean.create(prepared(beanDef, { name: '구지', shop: '리브레' }))
    for (const path of ['/admin/beans', `/admin/beans/${bean.id}`, `/admin/beans/${bean.id}/delete`]) {
      expect((await agent.post(path).set('Origin', 'https://other.example').type('form').send({ name: '변경', shop: '리브레' })).status).toBe(403)
    }
    expect((await repos.bean.get(bean.id))?.name).toBe('구지')
    expect(await repos.bean.list()).toHaveLength(1)
  })

  describe('카드 복사', () => {
    const beanBody = {
      name: '에티오피아 구지',
      shop: '리브레',
      variety: '헤어룸, 게이샤',
      flavorTags: '베리, 자스민',
      acidity: '8',
      sweetness: '7',
      body: '6',
      aftertaste: '9',
      purchasedAt: '2026-10-01',
      isDecaf: 'on',
      memo: '메모',
    }
    const addPhoto = (beanId: number) =>
      pool.query("INSERT INTO photos (bean_id, file_name, thumb_name, is_thumbnail) VALUES ($1, 'a.jpg', 'a-t.jpg', true)", [beanId])

    it('원두를 복사하면 제목에 (복사)가 붙고 나머지는 같다', async () => {
      const src = await repos.bean.create(prepared(beanDef, beanBody))
      await addPhoto(src.id)
      const res = await agent.post(`/admin/beans/${src.id}/copy`)
      expect(res.status).toBe(303)
      const copy = (await repos.bean.list()).find((b) => b.id !== src.id)!
      expect(res.headers.location).toBe(`/admin/beans/${copy.id}/edit?copied=1`)
      expect(copy).toMatchObject({
        name: '에티오피아 구지 (복사)',
        shop: '리브레',
        variety: ['헤어룸', '게이샤'],
        flavorTags: ['베리', '자스민'],
        totalScore: 30,
        isDecaf: true,
        purchasedAt: '2026-10-01',
        memo: '메모',
        photos: [],
      })
      expect((await repos.bean.get(src.id))?.name).toBe('에티오피아 구지')
      expect((await repos.bean.get(src.id))?.photos).toHaveLength(1)
      const edit = await agent.get(res.headers.location)
      expect(edit.text).toContain('복사했습니다. 제목을 수정하세요.')
      expect(edit.text).toMatch(/id="f-name"[^>]*autofocus/)
      expect((await agent.get(`/admin/beans/${src.id}/edit`)).text).toContain(`action="/admin/beans/${src.id}/copy"`)
    })

    it('카페 후기도 복사한다', async () => {
      const src = await repos.cafe.create(
        prepared(cafeVisitDef, { menu: '게이샤 필터', cafeName: '프릳츠', rating: '4', variety: '게이샤', flavorTags: '꽃' }),
      )
      const res = await agent.post(`/admin/cafe-visits/${src.id}/copy`)
      expect(res.status).toBe(303)
      const copy = (await repos.cafe.list()).find((c) => c.id !== src.id)!
      expect(res.headers.location).toBe(`/admin/cafe-visits/${copy.id}/edit?copied=1`)
      expect(copy).toMatchObject({ menu: '게이샤 필터 (복사)', cafeName: '프릳츠', rating: 4, variety: ['게이샤'], flavorTags: ['꽃'], photos: [] })
    })

    it('같은 이름이 있으면 (복사 2), (복사 3)으로 구분한다', async () => {
      const src = await repos.bean.create(prepared(beanDef, beanBody))
      await agent.post(`/admin/beans/${src.id}/copy`).expect(303)
      await agent.post(`/admin/beans/${src.id}/copy`).expect(303)
      const first = (await repos.bean.list()).find((b) => b.name === '에티오피아 구지 (복사)')!
      await agent.post(`/admin/beans/${first.id}/copy`).expect(303)
      const names = (await repos.bean.list()).map((b) => b.name).sort()
      expect(names).toEqual(['에티오피아 구지', '에티오피아 구지 (복사 2)', '에티오피아 구지 (복사 3)', '에티오피아 구지 (복사)'])
    })

    it('긴 제목도 200자 안에서 복사한다', async () => {
      const src = await repos.bean.create(prepared(beanDef, { name: '가'.repeat(200), shop: '리브레' }))
      await agent.post(`/admin/beans/${src.id}/copy`).expect(303)
      await agent.post(`/admin/beans/${src.id}/copy`).expect(303)
      const names = (await repos.bean.list()).map((b) => b.name as string)
      expect(names).toHaveLength(3)
      expect(new Set(names).size).toBe(3)
      for (const name of names) expect(name.length).toBeLessThanOrEqual(200)
      expect(names.filter((n) => n.endsWith(' (복사)') || n.endsWith(' (복사 2)'))).toHaveLength(2)
    })

    it('이모지 제목도 문자가 깨지지 않게 200자 안에서 복사한다', async () => {
      const src = await repos.bean.create(prepared(beanDef, { name: '😀'.repeat(100), shop: '리브레' }))
      await agent.post(`/admin/beans/${src.id}/copy`).expect(303)
      const copy = (await repos.bean.list()).find((b) => b.id !== src.id)!
      const name = copy.name as string
      expect(name).not.toContain('\uFFFD')
      expect(name.length).toBeLessThanOrEqual(200)
      expect(name.endsWith(' (복사)')).toBe(true)
      expect(name.slice(0, -' (복사)'.length)).toBe('😀'.repeat(97))
    })

    it('같은 원본을 동시에 복사해도 제목이 겹치지 않는다', async () => {
      const src = await repos.bean.create(prepared(beanDef, beanBody))
      const results = await Promise.all([agent.post(`/admin/beans/${src.id}/copy`), agent.post(`/admin/beans/${src.id}/copy`)])
      expect(results.map((r) => r.status)).toEqual([303, 303])
      const names = (await repos.bean.list()).map((b) => b.name).sort()
      expect(names).toEqual(['에티오피아 구지', '에티오피아 구지 (복사 2)', '에티오피아 구지 (복사)'])
    })

    it('없는 글은 404, 로그인하지 않으면 로그인으로, 다른 출처는 403', async () => {
      expect((await agent.post('/admin/beans/999/copy')).status).toBe(404)
      expect((await agent.post('/admin/cafe-visits/999/copy')).status).toBe(404)
      const src = await repos.bean.create(prepared(beanDef, beanBody))
      const anon = await request(app).post(`/admin/beans/${src.id}/copy`)
      expect(anon.status).toBe(303)
      expect(anon.headers.location).toBe('/admin/login')
      expect((await agent.post(`/admin/beans/${src.id}/copy`).set('Origin', 'https://other.example')).status).toBe(403)
      expect(await repos.bean.list()).toHaveLength(1)
    })
  })
})
