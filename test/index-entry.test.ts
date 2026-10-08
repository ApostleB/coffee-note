import { spawnSync } from 'node:child_process'
import net from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('서버 진입점', () => {
  let blocker: net.Server
  let port: number

  beforeAll(async () => {
    blocker = net.createServer()
    await new Promise<void>((resolve) => blocker.listen(0, resolve))
    port = (blocker.address() as net.AddressInfo).port
  })

  afterAll(async () => {
    await new Promise((resolve) => blocker.close(resolve))
  })

  it('포트가 이미 사용 중이면 오류를 남기고 종료 코드 1로 끝난다', () => {
    const result = spawnSync('node_modules/.bin/tsx', ['src/index.ts'], {
      encoding: 'utf8',
      timeout: 15_000,
      env: {
        ...process.env,
        // DB에는 연결하지 않는다 (풀은 첫 쿼리 때 연결)
        DATABASE_URL: 'postgres://nobody:nopass@127.0.0.1:1/none',
        ADMIN_PASSWORD: 'test-password-1',
        SESSION_SECRET: 'x'.repeat(32),
        PORT: String(port),
      },
    })
    expect(result.stderr).toContain('서버 시작 실패')
    expect(result.stderr).toContain('EADDRINUSE')
    expect(result.stdout).not.toContain('Coffee Note:')
    expect(result.status).toBe(1)
  })
})
