import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

const valid = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  ADMIN_PASSWORD: 'password123',
  SESSION_SECRET: 'x'.repeat(32),
}

describe('loadConfig', () => {
  it('선택 항목은 기본값을 쓴다', () => {
    const config = loadConfig(valid)
    expect(config.port).toBe(4000)
    expect(config.cookieSecure).toBe(false)
    expect(path.isAbsolute(config.uploadDir)).toBe(true)
    expect(path.basename(config.uploadDir)).toBe('uploads')
  })

  it('지정한 값을 읽는다', () => {
    const config = loadConfig({ ...valid, PORT: '8080', COOKIE_SECURE: 'true', UPLOAD_DIR: '/data/photos' })
    expect(config).toMatchObject({ port: 8080, cookieSecure: true, uploadDir: '/data/photos' })
  })

  it('누락되거나 짧은 값은 변수 이름을 알려준다', () => {
    expect(() => loadConfig({ DATABASE_URL: 'x', ADMIN_PASSWORD: 'short' })).toThrow(
      '환경변수를 확인하세요: ADMIN_PASSWORD, SESSION_SECRET',
    )
  })
})
