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
