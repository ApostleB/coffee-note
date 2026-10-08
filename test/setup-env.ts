// .env의 TEST_DATABASE_URL 등을 테스트에서도 읽는다
try {
  process.loadEnvFile()
} catch (err) {
  // .env 파일이 없을 때만 무시하고(환경변수만 사용), 그 외 오류는 그대로 던진다
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
}
