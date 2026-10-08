import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup-env.ts'],
    // DB 테스트들이 같은 테스트 스키마를 쓰므로 파일 단위 병렬 실행을 끈다
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
