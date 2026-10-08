import type { Pool } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { migrate } from '../src/migrate.js'
import { createTestPool, describeDb, TEST_SCHEMA } from './db.js'

describeDb('migrate', () => {
  let pool!: Pool // beforeAll이 실패하면 대입되지 않을 수 있다

  beforeAll(async () => {
    pool = await createTestPool()
  })

  afterAll(async () => {
    if (pool) await pool.end()
  })

  it('테이블을 만들고 이력을 남긴다', async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name',
      [TEST_SCHEMA],
    )
    expect(rows.map((r) => r.table_name)).toEqual(['beans', 'cafe_visits', 'photos', 'schema_migrations'])
  })

  it('두 번째 실행은 아무것도 적용하지 않는다', async () => {
    expect(await migrate(pool, () => {})).toEqual([])
  })

  it('date 컬럼은 문자열로 읽힌다', async () => {
    const { rows } = await pool.query(
      "INSERT INTO beans (name, shop, roasted_at) VALUES ('a', 'b', '2026-10-01') RETURNING roasted_at",
    )
    expect(rows[0].roasted_at).toBe('2026-10-01')
  })

  it('사진은 원두·카페 중 정확히 하나에 연결된다', async () => {
    await expect(pool.query("INSERT INTO photos (file_name, thumb_name) VALUES ('a', 'b')")).rejects.toThrow()
  })

  it('글 하나에 썸네일은 1장만 지정된다', async () => {
    const { rows } = await pool.query("INSERT INTO beans (name, shop) VALUES ('a', 'b') RETURNING id")
    const insert = 'INSERT INTO photos (bean_id, file_name, thumb_name, is_thumbnail) VALUES ($1, $2, $2, true)'
    await pool.query(insert, [rows[0].id, 'one'])
    await expect(pool.query(insert, [rows[0].id, 'two'])).rejects.toThrow()
  })
})
