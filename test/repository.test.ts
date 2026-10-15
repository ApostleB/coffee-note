import type { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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

  it('품종 배열을 원두·카페 모두 왕복한다', async () => {
    const bean = await repos.bean.create(prepared(beanDef, { name: 'a', shop: 'b', variety: '게이샤, 버번' }))
    expect(bean.variety).toEqual(['게이샤', '버번'])
    expect((await repos.bean.get(bean.id))?.variety).toEqual(['게이샤', '버번'])
    expect((await repos.bean.create(prepared(beanDef, { name: 'c', shop: 'd' }))).variety).toEqual([])
    const cafe = await repos.cafe.create(prepared(cafeVisitDef, { bean_name: 'm', cafeName: 'c', bean_variety: '파카마라' }))
    expect((await repos.cafe.get(cafe.id))?.beans).toMatchObject([{ variety: ['파카마라'] }])
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
      prepared(cafeVisitDef, { bean_name: '게이샤 필터', cafeName: '프릳츠', rating: '4', visitedAt: '2026-10-05' }),
    )
    expect(created).toMatchObject({ id: 1, cafeName: '프릳츠', rating: 4, visitedAt: '2026-10-05' })
    expect(created.beans).toHaveLength(1)
    expect(await repos.cafe.list()).toHaveLength(1)
  })

  describe('카페 후기 원두 N개', () => {
    const body = (names: string[], extra: Record<string, unknown> = {}) => ({
      cafeName: '프릳츠',
      bean_name: names,
      bean_country: names.map((_, i) => (i === 0 ? '파나마' : '')),
      bean_is_decaf: names.map((_, i) => (i === 1 ? 'true' : 'false')),
      bean_flavor_tags: names.map((_, i) => `태그${i}, 공통`),
      bean_price: names.map((_, i) => String(1000 * (i + 1))),
      bean_rating: names.map((_, i) => String(i + 1)),
      ...extra,
    })
    const beanRows = async () => (await pool.query('SELECT cafe_visit_id, position, name FROM cafe_visit_beans ORDER BY cafe_visit_id, position')).rows

    it('원두를 position 순서대로 저장하고 조회한다', async () => {
      const created = await repos.cafe.create(prepared(cafeVisitDef, body(['가', '나', '다'])))
      expect(created.beans!.map((b) => b.name)).toEqual(['가', '나', '다'])
      const loaded = (await repos.cafe.get(created.id))!
      expect(loaded.beans).toEqual([
        { name: '가', country: '파나마', variety: [], process: null, brewMethod: null, isDecaf: false, flavorTags: ['태그0', '공통'], price: 1000, rating: 1, memo: null },
        { name: '나', country: null, variety: [], process: null, brewMethod: null, isDecaf: true, flavorTags: ['태그1', '공통'], price: 2000, rating: 2, memo: null },
        { name: '다', country: null, variety: [], process: null, brewMethod: null, isDecaf: false, flavorTags: ['태그2', '공통'], price: 3000, rating: 3, memo: null },
      ])
      expect(await beanRows()).toEqual([
        { cafe_visit_id: 1, position: 0, name: '가' },
        { cafe_visit_id: 1, position: 1, name: '나' },
        { cafe_visit_id: 1, position: 2, name: '다' },
      ])
    })

    it('목록도 원두를 붙이고 글마다 섞이지 않는다', async () => {
      await repos.cafe.create(prepared(cafeVisitDef, body(['가', '나'])))
      await repos.cafe.create(prepared(cafeVisitDef, { cafeName: '나무사이로', bean_name: '케냐' }))
      const list = await repos.cafe.list()
      expect(list.map((c) => c.beans!.map((b) => b.name))).toEqual([['케냐'], ['가', '나']])
    })

    it('수정하면 원두를 전부 교체한다', async () => {
      const created = await repos.cafe.create(prepared(cafeVisitDef, body(['가', '나', '다'])))
      const updated = await repos.cafe.update(created.id, prepared(cafeVisitDef, body(['다', '라'], { cafeName: '새 이름' })))
      expect(updated).toMatchObject({ cafeName: '새 이름' })
      expect(updated!.beans!.map((b) => b.name)).toEqual(['다', '라'])
      expect(await beanRows()).toEqual([
        { cafe_visit_id: 1, position: 0, name: '다' },
        { cafe_visit_id: 1, position: 1, name: '라' },
      ])
    })

    it('없는 id를 수정하면 null이고 다른 글의 원두는 그대로', async () => {
      await repos.cafe.create(prepared(cafeVisitDef, body(['가'])))
      expect(await repos.cafe.update(999, prepared(cafeVisitDef, body(['나'])))).toBeNull()
      expect(await beanRows()).toEqual([{ cafe_visit_id: 1, position: 0, name: '가' }])
    })

    it('삭제하면 원두 행도 cascade로 지운다', async () => {
      const created = await repos.cafe.create(prepared(cafeVisitDef, body(['가', '나'])))
      await repos.cafe.remove(created.id)
      expect(await beanRows()).toEqual([])
    })

    it('복사하면 원두도 같은 순서로 복사하고 원본은 그대로', async () => {
      const src = await repos.cafe.create(prepared(cafeVisitDef, body(['가', '나'])))
      const copy = (await repos.cafe.copy(src.id))!
      expect(copy.cafeName).toBe('프릳츠 (복사)')
      expect(copy.beans).toEqual(src.beans)
      expect((await repos.cafe.get(copy.id))!.beans).toEqual(src.beans)
      expect((await repos.cafe.get(src.id))!.beans!.map((b) => b.name)).toEqual(['가', '나'])
      expect((await beanRows()).filter((r) => r.cafe_visit_id === copy.id)).toHaveLength(2)
    })

    // 다른 연결이 원본 방문 행을 잠근 채 수정/삭제 중일 때 복사는 그 커밋을 기다렸다가 완결된 상태를 복사해야 한다
    const settledWithin = async (promise: Promise<unknown>, ms: number) =>
      Promise.race([promise.then(() => true, () => true), new Promise<boolean>((r) => setTimeout(() => r(false), ms))])

    it('복사는 진행 중인 수정이 커밋될 때까지 기다리고 수정된 방문+원두를 통째로 복사한다', async () => {
      const src = await repos.cafe.create(prepared(cafeVisitDef, body(['가', '나'])))
      const other = await pool.connect()
      try {
        await other.query('BEGIN')
        await other.query(`UPDATE cafe_visits SET cafe_name = '새 카페' WHERE id = $1`, [src.id])
        const copying = repos.cafe.copy(src.id)
        expect(await settledWithin(copying, 400)).toBe(false)
        await other.query('DELETE FROM cafe_visit_beans WHERE cafe_visit_id = $1', [src.id])
        await other.query(`INSERT INTO cafe_visit_beans (cafe_visit_id, position, name) VALUES ($1, 0, '새 원두')`, [src.id])
        await other.query('COMMIT')
        const copy = (await copying)!
        expect(copy.cafeName).toBe('새 카페 (복사)')
        expect(copy.beans!.map((b) => b.name)).toEqual(['새 원두'])
      } finally {
        await other.query('ROLLBACK').catch(() => {})
        other.release()
      }
    })

    it('복사는 진행 중인 삭제가 커밋되면 null을 돌려주고 원두 없는 복사본을 만들지 않는다', async () => {
      const src = await repos.cafe.create(prepared(cafeVisitDef, body(['가', '나'])))
      const other = await pool.connect()
      try {
        await other.query('BEGIN')
        await other.query('DELETE FROM cafe_visits WHERE id = $1', [src.id])
        const copying = repos.cafe.copy(src.id)
        expect(await settledWithin(copying, 400)).toBe(false)
        await other.query('COMMIT')
        expect(await copying).toBeNull()
        expect(await repos.cafe.list()).toEqual([])
      } finally {
        await other.query('ROLLBACK').catch(() => {})
        other.release()
      }
    })

    it('원두 저장이 실패하면 방문도 저장하지 않는다', async () => {
      const data = prepared(cafeVisitDef, body(['가']))
      await expect(repos.cafe.create({ ...data, beans: [{ ...(data.beans as object[])[0], price: -5 }] })).rejects.toThrow()
      expect(await repos.cafe.list()).toEqual([])
    })
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

  it('사진이 여러 장인 글을 삭제하면 모든 사진 행을 돌려주고 photos에서도 지운다', async () => {
    const cafe = await repos.cafe.create(prepared(cafeVisitDef, { bean_name: '필터', cafeName: '프릳츠' }))
    const insert = 'INSERT INTO photos (cafe_visit_id, file_name, thumb_name, sort_order) VALUES ($1, $2, $3, $4)'
    await pool.query(insert, [cafe.id, 'a.webp', 'a-thumb.webp', 0])
    await pool.query(insert, [cafe.id, 'b.webp', 'b-thumb.webp', 1])
    const removed = await repos.cafe.remove(cafe.id)
    expect(removed?.map((p) => p.file_name).sort()).toEqual(['a.webp', 'b.webp'])
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM photos')
    expect(rows[0].n).toBe(0)
  })
})
