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
    await repos.cafe.create(prepared(cafeVisitDef, { bean_name: '게이샤 필터', cafeName: '프릳츠', rating: '4' }))
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

  it('카페 상세에 원두별 카드와 상세 값이 표시되고 사용자 입력은 이스케이프된다', async () => {
    await repos.cafe.update(1, prepared(cafeVisitDef, {
      cafeName: '카페', bean_name: ['<script>alert(1)</script>', '두 번째 원두'],
      bean_country: ['파나마', '케냐'], bean_variety: ['게이샤, 버번', ''], bean_brew_method: ['필터', ''],
      bean_price: ['9000', ''], bean_rating: ['5', ''], bean_flavor_tags: ['<꽃>', ''], bean_memo: ['<img src=x onerror=alert(1)>', '둘째 메모'],
    }))
    for (const url of ['/cafe-visits/1', '/cafe-visits/1?fragment=1']) {
      const res = await request(app).get(url).expect(200)
      expect(res.text.match(/data-bean-detail/g)).toHaveLength(2)
      expect(res.text).toContain('row-cols-1 row-cols-md-2')
      for (const value of ['마신 원두', '게이샤, 버번', '9,000원', '★★★★★', '둘째 메모', '&lt;꽃&gt;', '&lt;script&gt;']) expect(res.text).toContain(value)
      expect(res.text).not.toContain('<script>alert(1)</script>')
      expect(res.text).not.toContain('<img src=x')
    }
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
