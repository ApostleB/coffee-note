import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { createPool } from './db.js'

try {
  process.loadEnvFile()
} catch (err) {
  // .env 파일이 없을 때만 무시하고(환경변수만 사용), 그 외 오류는 그대로 던진다
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
}

const config = loadConfig()
const pool = createPool(config.databaseUrl)

createApp({ config, pool }).listen(config.port, (err) => {
  if (err) {
    console.error(`서버 시작 실패: ${err.message}`)
    // 풀을 닫아야 프로세스가 종료 코드와 함께 끝난다
    pool.end().finally(() => {
      process.exitCode = 1
    })
    return
  }
  console.log(`Coffee Note: http://localhost:${config.port}`)
})
