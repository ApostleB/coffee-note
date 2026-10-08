import type { Express } from 'express'
import type { Pool } from 'pg'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { checkPassword } from '../src/auth.js'
import { TEST_PASSWORD, testConfig } from './helpers.js'

// 이 테스트들은 DB를 쓰지 않는 경로만 호출한다
let app: Express

beforeEach(() => {
  app = createApp({ config: testConfig(), pool: {} as Pool })
})

async function loggedInAgent() {
  const agent = request.agent(app)
  await agent.post('/admin/login').type('form').send({ password: TEST_PASSWORD }).expect(303)
  return agent
}

describe('checkPassword', () => {
  it('같을 때만 true', () => {
    expect(checkPassword('secret-pass', 'secret-pass')).toBe(true)
    expect(checkPassword('secret-pas', 'secret-pass')).toBe(false)
    expect(checkPassword(undefined, 'secret-pass')).toBe(false)
    expect(checkPassword(['secret-pass'], 'secret-pass')).toBe(false)
  })
})

describe('관리자 로그인', () => {
  it('미로그인은 로그인 화면으로 보낸다', async () => {
    const res = await request(app).get('/admin')
    expect(res.status).toBe(303)
    expect(res.headers.location).toBe('/admin/login')
  })

  it('로그인 화면', async () => {
    const res = await request(app).get('/admin/login')
    expect(res.status).toBe(200)
    expect(res.text).toContain('name="password"')
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('틀린 비밀번호는 401', async () => {
    const res = await request(app).post('/admin/login').type('form').send({ password: 'wrong-password' })
    expect(res.status).toBe(401)
    expect(res.text).toContain('비밀번호가 올바르지 않습니다.')
  })

  it('맞는 비밀번호는 서명 쿠키를 주고 관리자 화면으로', async () => {
    const res = await request(app).post('/admin/login').type('form').send({ password: TEST_PASSWORD })
    expect(res.status).toBe(303)
    expect(res.headers.location).toBe('/admin')
    const cookie = String(res.headers['set-cookie'])
    expect(cookie).toContain('coffee_admin=s%3A')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
  })

  it('로그인 후에는 관리자 화면으로 이동한다', async () => {
    const agent = await loggedInAgent()
    const login = await agent.get('/admin/login')
    expect(login.status).toBe(303)
    expect(login.headers.location).toBe('/admin')
    const home = await agent.get('/admin')
    expect(home.status).toBe(303)
    expect(home.headers.location).toBe('/admin/beans')
  })

  it('관리자면 공개 헤더에 관리 링크가 보인다', async () => {
    const agent = await loggedInAgent()
    const res = await agent.get('/nope')
    expect(res.status).toBe(404)
    expect(res.text).toContain('href="/admin"')
    const anonymous = await request(app).get('/nope')
    expect(anonymous.text).not.toContain('href="/admin"')
  })

  it('위조한 쿠키는 무시한다', async () => {
    const res = await request(app).get('/admin').set('Cookie', 'coffee_admin=s%3A9999999999999.forged')
    expect(res.status).toBe(303)
    expect(res.headers.location).toBe('/admin/login')
  })

  it('로그아웃하면 다시 로그인해야 한다', async () => {
    const agent = await loggedInAgent()
    const out = await agent.post('/admin/logout')
    expect(out.status).toBe(303)
    expect(out.headers.location).toBe('/')
    expect((await agent.get('/admin')).headers.location).toBe('/admin/login')
  })

  it('1분에 10번을 넘게 시도하면 429', async () => {
    for (let i = 0; i < 10; i += 1) {
      await request(app).post('/admin/login').type('form').send({ password: 'wrong-password' }).expect(401)
    }
    const res = await request(app).post('/admin/login').type('form').send({ password: TEST_PASSWORD })
    expect(res.status).toBe(429)
    expect(res.text).toContain('로그인 시도가 너무 많습니다.')
  })

  it.each(['https://evil.example', 'null'])('다른 출처(%s)의 POST는 403', async (origin) => {
    const res = await request(app).post('/admin/login').set('Origin', origin).type('form').send({ password: TEST_PASSWORD })
    expect(res.status).toBe(403)
    expect(res.text).toContain('허용되지 않은 요청입니다')
  })
})
