import type { Pool, PoolClient } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { withTransaction } from '../src/db.js'

/** DB 없이 쓰는 가짜 풀. failOn에 든 SQL은 해당 오류로 실패한다 */
function fakePool(failOn: Record<string, Error> = {}) {
  const queries: string[] = []
  const release = vi.fn()
  const client = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql)
      if (failOn[sql]) throw failOn[sql]
    }),
    release,
  }
  const pool = { connect: async () => client as unknown as PoolClient } as unknown as Pool
  return { pool, queries, release }
}

describe('withTransaction', () => {
  it('성공하면 COMMIT하고 오류 없이 release한다', async () => {
    const { pool, queries, release } = fakePool()
    expect(await withTransaction(pool, async () => 'ok')).toBe('ok')
    expect(queries).toEqual(['BEGIN', 'COMMIT'])
    expect(release).toHaveBeenCalledWith(undefined)
  })

  it('콜백이 실패하면 ROLLBACK하고 원래 오류를 던진다', async () => {
    const { pool, queries, release } = fakePool()
    const original = new Error('콜백 실패')
    await expect(withTransaction(pool, async () => Promise.reject(original))).rejects.toBe(original)
    expect(queries).toEqual(['BEGIN', 'ROLLBACK'])
    expect(release).toHaveBeenCalledWith(undefined)
  })

  it('콜백 실패 + ROLLBACK 실패여도 원래 오류를 던지고 연결을 폐기한다', async () => {
    const rollbackError = new Error('롤백 실패')
    const { pool, release } = fakePool({ ROLLBACK: rollbackError })
    const original = new Error('콜백 실패')
    await expect(withTransaction(pool, async () => Promise.reject(original))).rejects.toBe(original)
    expect(release).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledWith(rollbackError)
  })
})
