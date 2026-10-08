// .env의 TEST_DATABASE_URL 등을 테스트에서도 읽는다
try {
  process.loadEnvFile()
} catch {
  // .env가 없으면 환경변수만 사용
}
