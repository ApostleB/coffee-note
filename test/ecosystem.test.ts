import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

describe('PM2 ecosystem', () => {
  const { apps } = require('../ecosystem.config.cjs')
  const app = apps[0]

  it('coffee-note 앱을 dist/index.js로 실행한다', () => {
    expect(app.name).toBe('coffee-note')
    expect(app.script).toBe('dist/index.js')
  })

  it('로그인 시도 제한이 메모리 저장소이므로 단일 fork 프로세스로 돌린다', () => {
    expect(app.exec_mode).toBe('fork')
    expect(app.instances).toBe(1)
  })

  it('업로드 한도(메모리 버퍼 최대 300MB)보다 넉넉한 메모리 한도를 둔다', () => {
    // 한도 끝까지 업로드해도 RSS 때문에 PM2가 요청 도중 재시작하지 않아야 한다
    expect(app.max_memory_restart).toBe('1G')
  })

  it('운영 환경과 포트 3070을 지정한다', () => {
    expect(app.env).toEqual({ NODE_ENV: 'production', PORT: 3070 })
  })
})
