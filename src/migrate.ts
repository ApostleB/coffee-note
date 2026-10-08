import fs from 'node:fs/promises'
import path from 'node:path'
import type { Pool } from 'pg'
import { withTransaction } from './db.js'
import { MIGRATIONS_DIR } from './paths.js'

/** 아직 적용하지 않은 migrations/*.sql을 이름 순으로 적용하고, 적용한 파일 이름을 돌려준다 */
export async function migrate(pool: Pool, log: (message: string) => void = console.log): Promise<string[]> {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  )
  const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations')
  const done = new Set(rows.map((r) => r.name))
  const applied: string[] = []
  for (const file of files) {
    if (done.has(file)) continue
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8')
    await withTransaction(pool, async (client) => {
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
    })
    log(`적용: ${file}`)
    applied.push(file)
  }
  return applied
}
