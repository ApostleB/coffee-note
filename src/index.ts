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

createApp({ config, pool }).listen(config.port, () => {
  console.log(`Coffee Note: http://localhost:${config.port}`)
})
