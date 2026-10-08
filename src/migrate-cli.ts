import { createPool } from './db.js'
import { migrate } from './migrate.js'

try {
  process.loadEnvFile()
} catch {
  // .env가 없으면 환경변수만 사용
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL이 필요합니다')
  process.exit(1)
}

const pool = createPool(url)
try {
  const applied = await migrate(pool)
  console.log(applied.length ? `${applied.length}개 마이그레이션 적용 완료` : '적용할 마이그레이션이 없습니다')
} finally {
  await pool.end()
}
