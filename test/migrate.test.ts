import fs from 'node:fs/promises'
import path from 'node:path'
import type { Pool } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { migrate } from '../src/migrate.js'
import { MIGRATIONS_DIR } from '../src/paths.js'
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
    expect(rows.map((r) => r.table_name)).toEqual(['beans', 'cafe_visit_beans', 'cafe_visits', 'photos', 'schema_migrations'])
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

describeDb('migrate 002_variety_array', () => {
  let pool!: Pool

  beforeAll(async () => {
    pool = await createTestPool()
  })

  afterAll(async () => {
    if (pool) await pool.end()
  })

  it('품종 컬럼이 text[] NOT NULL DEFAULT {} 이다', async () => {
    const { rows } = await pool.query(
      `SELECT table_name, data_type, udt_name, is_nullable, column_default FROM information_schema.columns
       WHERE table_schema = $1 AND column_name = 'variety' ORDER BY table_name`,
      [TEST_SCHEMA],
    )
    // 003 이후 카페 품종은 cafe_visit_beans 로 옮겨졌다
    expect(rows.map((r) => [r.table_name, r.data_type, r.udt_name, r.is_nullable])).toEqual([
      ['beans', 'ARRAY', '_text', 'NO'],
      ['cafe_visit_beans', 'ARRAY', '_text', 'NO'],
    ])
    for (const row of rows) expect(row.column_default).toContain("'{}'")
  })

  it('001만 적용된 데이터를 쉼표로 나눠 trim·빈 값·중복 제거하며 변환한다', async () => {
    await pool.query(`DROP SCHEMA ${TEST_SCHEMA} CASCADE`)
    await pool.query(`CREATE SCHEMA ${TEST_SCHEMA}`)
    await pool.query('CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
    await pool.query(await fs.readFile(path.join(MIGRATIONS_DIR, '001_init.sql'), 'utf8'))
    await pool.query("INSERT INTO schema_migrations (name) VALUES ('001_init.sql')")
    await pool.query(
      `INSERT INTO beans (name, shop, variety) VALUES ('a', 's', 'A, B ,,A'), ('b', 's', NULL), ('c', 's', '  '), ('d', 's', 'Gesha'), ('e', 's', ' , ')`,
    )
    await pool.query(`INSERT INTO cafe_visits (menu, cafe_name, variety) VALUES ('m', 'c', '게이샤,버번, 게이샤'), ('n', 'c', NULL)`)
    // 탭·개행·캐리지리턴 등 스페이스 외 공백
    for (const [name, variety] of [['f', '\t'], ['g', 'A,\tA'], ['h', 'A\n, B'], ['i', ' \r\n\t '], ['j', '\tB\r,A\n']]) {
      await pool.query('INSERT INTO beans (name, shop, variety) VALUES ($1, $2, $3)', [name, 's', variety])
    }
    await pool.query('INSERT INTO cafe_visits (menu, cafe_name, variety) VALUES ($1, $2, $3), ($4, $2, $5)', ['p', 'c', '\t', 'q', 'A\n,\tA, B'])
    // JS trim과 같은 유니코드 공백(NBSP·전각 공백·BOM 등)
    for (const [name, variety] of [['k', ' A\u3000'], ['l', 'A,\uFEFFA'], ['m', '\u00A0\u2003\u3000\uFEFF'], ['n', '\u00A0B\u2028,A\u202F,\u205FB']]) {
      await pool.query('INSERT INTO beans (name, shop, variety) VALUES ($1, $2, $3)', [name, 's', variety])
    }
    await pool.query('INSERT INTO cafe_visits (menu, cafe_name, variety) VALUES ($1, $2, $3), ($4, $2, $5)', ['r', 'c', '\u00A0', 's', '\u3000A,\uFEFFA\u2029,B'])

    expect(await migrate(pool, () => {})).toEqual(['002_variety_array.sql', '003_cafe_visit_beans.sql'])

    const beans = await pool.query('SELECT name, variety FROM beans ORDER BY name')
    expect(beans.rows).toEqual([
      { name: 'a', variety: ['A', 'B'] },
      { name: 'b', variety: [] },
      { name: 'c', variety: [] },
      { name: 'd', variety: ['Gesha'] },
      { name: 'e', variety: [] },
      { name: 'f', variety: [] },
      { name: 'g', variety: ['A'] },
      { name: 'h', variety: ['A', 'B'] },
      { name: 'i', variety: [] },
      { name: 'j', variety: ['B', 'A'] },
      { name: 'k', variety: ['A'] },
      { name: 'l', variety: ['A'] },
      { name: 'm', variety: [] },
      { name: 'n', variety: ['B', 'A'] },
    ])
    const cafes = await pool.query('SELECT name AS menu, variety FROM cafe_visit_beans ORDER BY name')
    expect(cafes.rows).toEqual([
      { menu: 'm', variety: ['게이샤', '버번'] },
      { menu: 'n', variety: [] },
      { menu: 'p', variety: [] },
      { menu: 'q', variety: ['A', 'B'] },
      { menu: 'r', variety: [] },
      { menu: 's', variety: ['A', 'B'] },
    ])
  })
})

describeDb('migrate 003_cafe_visit_beans', () => {
  let pool!: Pool

  beforeAll(async () => {
    pool = await createTestPool()
  })

  afterAll(async () => {
    if (pool) await pool.end()
  })

  const columns = async (table: string) =>
    (
      await pool.query<{ column_name: string }>(
        'SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY column_name',
        [TEST_SCHEMA, table],
      )
    ).rows.map((r) => r.column_name)

  it('방문 단위 컬럼만 cafe_visits에 남고 원두 컬럼은 cafe_visit_beans에 있다', async () => {
    expect(await columns('cafe_visits')).toEqual(
      ['address', 'cafe_name', 'created_at', 'id', 'map_url', 'memo', 'mood_memo', 'rating', 'updated_at', 'visited_at'],
    )
    expect(await columns('cafe_visit_beans')).toEqual(
      ['brew_method', 'cafe_visit_id', 'country', 'created_at', 'flavor_tags', 'id', 'is_decaf', 'memo', 'name', 'position', 'price', 'process', 'rating', 'variety'],
    )
  })

  it('제약: 순서 유일, 가격·별점 범위, 방문 삭제 cascade', async () => {
    const { rows } = await pool.query("INSERT INTO cafe_visits (cafe_name) VALUES ('c') RETURNING id")
    const id = rows[0].id
    const insert = 'INSERT INTO cafe_visit_beans (cafe_visit_id, position, name, price, rating) VALUES ($1, $2, $3, $4, $5)'
    await pool.query(insert, [id, 0, 'a', 100, 5])
    await expect(pool.query(insert, [id, 0, 'dup', null, null])).rejects.toThrow()
    await expect(pool.query(insert, [id, 1, 'neg', -1, null])).rejects.toThrow()
    await expect(pool.query(insert, [id, 2, 'star', null, 6])).rejects.toThrow()
    await pool.query('DELETE FROM cafe_visits WHERE id = $1', [id])
    expect((await pool.query('SELECT count(*)::int AS n FROM cafe_visit_beans')).rows[0].n).toBe(0)
  })

  it('002까지 적용된 카페 행을 원두 1개로 옮기고 컬럼을 지운다', async () => {
    await pool.query(`DROP SCHEMA ${TEST_SCHEMA} CASCADE`)
    await pool.query(`CREATE SCHEMA ${TEST_SCHEMA}`)
    await pool.query('CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
    for (const file of ['001_init.sql', '002_variety_array.sql']) {
      await pool.query(await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8'))
      await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
    }
    await pool.query(
      `INSERT INTO cafe_visits (menu, cafe_name, visited_at, rating, price, brew_method, country, variety, process, is_decaf, flavor_tags, address, map_url, mood_memo, memo)
       VALUES ('게이샤 필터', '프릳츠', '2026-10-05', 4, 9000, '필터', '파나마', ARRAY['게이샤','버번'], '워시드', true, ARRAY['꽃','시트러스'], '서울', 'https://map.example/x', '조용함', '맛있었다'),
              ('라떼', '나무사이로', NULL, NULL, NULL, NULL, NULL, '{}', NULL, false, '{}', NULL, NULL, NULL, NULL)`,
    )
    await pool.query("INSERT INTO photos (cafe_visit_id, file_name, thumb_name) VALUES (1, 'a', 'b')")

    expect(await migrate(pool, () => {})).toEqual(['003_cafe_visit_beans.sql'])

    const visits = await pool.query('SELECT id, cafe_name, visited_at, rating, address, map_url, mood_memo, memo FROM cafe_visits ORDER BY id')
    expect(visits.rows).toEqual([
      { id: 1, cafe_name: '프릳츠', visited_at: '2026-10-05', rating: 4, address: '서울', map_url: 'https://map.example/x', mood_memo: '조용함', memo: '맛있었다' },
      { id: 2, cafe_name: '나무사이로', visited_at: null, rating: null, address: null, map_url: null, mood_memo: null, memo: null },
    ])
    const beans = await pool.query(
      'SELECT cafe_visit_id, position, name, country, variety, process, brew_method, is_decaf, flavor_tags, price, rating, memo FROM cafe_visit_beans ORDER BY cafe_visit_id, position',
    )
    expect(beans.rows).toEqual([
      { cafe_visit_id: 1, position: 0, name: '게이샤 필터', country: '파나마', variety: ['게이샤', '버번'], process: '워시드', brew_method: '필터', is_decaf: true, flavor_tags: ['꽃', '시트러스'], price: 9000, rating: null, memo: null },
      { cafe_visit_id: 2, position: 0, name: '라떼', country: null, variety: [], process: null, brew_method: null, is_decaf: false, flavor_tags: [], price: null, rating: null, memo: null },
    ])
    expect((await pool.query('SELECT count(*)::int AS n FROM photos WHERE cafe_visit_id = 1')).rows[0].n).toBe(1)
    expect(await columns('cafe_visits')).not.toContain('menu')
  })
})
