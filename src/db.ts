import pg from 'pg'

// date(OID 1082)를 JS Date로 바꾸면 타임존 때문에 하루가 밀릴 수 있어 'YYYY-MM-DD' 문자열 그대로 쓴다
pg.types.setTypeParser(1082, (value: string) => value)

export type PoolOptions = { searchPath?: string }

export function createPool(connectionString: string, { searchPath }: PoolOptions = {}): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5000,
    options: searchPath ? `-c search_path=${searchPath}` : undefined,
  })
  // 유휴 연결이 끊겨도 처리되지 않은 'error' 이벤트로 프로세스가 죽지 않게 한다
  pool.on('error', (err) => console.error('유휴 DB 연결 오류', err))
  return pool
}

export async function withTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  // ROLLBACK까지 실패한 연결은 상태를 믿을 수 없으므로 release(오류)로 풀에서 폐기한다
  let discardReason: Error | undefined
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackErr) {
      discardReason = rollbackErr instanceof Error ? rollbackErr : new Error(String(rollbackErr))
    }
    throw err
  } finally {
    client.release(discardReason)
  }
}
