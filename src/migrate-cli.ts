import { createPool } from './db.js'
import { migrate } from './migrate.js'

try {
  process.loadEnvFile()
} catch (err) {
  // .env 파일이 없을 때만 무시하고(환경변수만 사용), 그 외 오류는 그대로 던진다
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
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
