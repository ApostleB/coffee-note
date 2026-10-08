import type { Pool } from 'pg'
import { describe } from 'vitest'
import { createPool } from '../src/db.js'
import { migrate } from '../src/migrate.js'

export const TEST_SCHEMA = 'coffee_note_test'
const url = process.env.TEST_DATABASE_URL

/** TEST_DATABASE_URL이 없으면 DB 테스트를 건너뛴다 */
export const describeDb = url ? describe : describe.skip

/**
 * 테스트 전용 스키마를 새로 만들고 마이그레이션을 적용한 풀을 돌려준다.
 * 운영 데이터가 있는 public 스키마는 건드리지 않는다.
 */
export async function createTestPool(): Promise<Pool> {
  if (!url) throw new Error('TEST_DATABASE_URL이 필요합니다')
  const admin = createPool(url)
  try {
    await admin.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
    await admin.query(`CREATE SCHEMA ${TEST_SCHEMA}`)
  } finally {
    await admin.end()
  }
  const pool = createPool(url, { searchPath: TEST_SCHEMA })
  await migrate(pool, () => {})
  return pool
}

export async function resetData(pool: Pool): Promise<void> {
  await pool.query('TRUNCATE photos, beans, cafe_visits RESTART IDENTITY CASCADE')
}
