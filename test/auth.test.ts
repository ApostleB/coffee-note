import type { Express } from 'express'
import type { Pool } from 'pg'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { checkPassword } from '../src/auth.js'
import { createLoginGuard } from '../src/login-guard.js'
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

  describe('로그인 10회 실패 시 10분 차단', () => {
    const clock = { t: Date.now() }
    const wrong = (a: Express) => request(a).post('/admin/login').type('form').send({ password: 'wrong-password' })

    beforeEach(() => {
      clock.t = Date.now()
      app = createApp({ config: testConfig(), pool: {} as Pool, loginGuard: createLoginGuard({ now: () => clock.t }) })
    })

    it('10번 틀리면 올바른 비밀번호와 로그인 화면 조회도 429 + Retry-After', async () => {
      for (let i = 0; i < 10; i += 1) await wrong(app).expect(401)
      const res = await request(app).post('/admin/login').type('form').send({ password: TEST_PASSWORD })
      expect(res.status).toBe(429)
      expect(res.headers['retry-after']).toBe('600')
      expect(res.text).toContain('로그인 시도가 너무 많아 차단되었습니다. 10분 후 다시 시도하세요.')
      expect(res.headers['set-cookie']).toBeUndefined()
      const page = await request(app).get('/admin/login')
      expect(page.status).toBe(429)
      expect(page.headers['retry-after']).toBe('600')
      expect((await request(app).get('/admin')).status).toBe(429)
    })

    it('차단 중에도 공개 페이지와 /healthz는 영향 없다', async () => {
      for (let i = 0; i < 10; i += 1) await wrong(app).expect(401)
      await request(app).get('/healthz').expect(200)
    })

    it('남은 시간은 분 단위로 올림해 안내한다', async () => {
      for (let i = 0; i < 10; i += 1) await wrong(app).expect(401)
      clock.t += 9 * 60_000 + 1000
      const res = await request(app).get('/admin/login')
      expect(res.status).toBe(429)
      expect(res.headers['retry-after']).toBe('59')
      expect(res.text).toContain('1분 후 다시 시도하세요.')
    })

    it('10분이 지나면 다시 로그인할 수 있다', async () => {
      for (let i = 0; i < 10; i += 1) await wrong(app).expect(401)
      clock.t += 10 * 60_000
      await request(app).post('/admin/login').type('form').send({ password: TEST_PASSWORD }).expect(303)
    })

    it('9번 틀린 뒤 성공하면 횟수가 리셋된다', async () => {
      for (let i = 0; i < 9; i += 1) await wrong(app).expect(401)
      await request(app).post('/admin/login').type('form').send({ password: TEST_PASSWORD }).expect(303)
      for (let i = 0; i < 9; i += 1) await wrong(app).expect(401)
    })
  })

  it.each(['https://evil.example', 'null'])('다른 출처(%s)의 POST는 403', async (origin) => {
    const res = await request(app).post('/admin/login').set('Origin', origin).type('form').send({ password: TEST_PASSWORD })
    expect(res.status).toBe(403)
    expect(res.text).toContain('허용되지 않은 요청입니다')
  })

  it('같은 호스트라도 프로토콜이 다른 Origin은 403', async () => {
    const res = await request(app)
      .post('/admin/login')
      .set('Host', 'coffee.example')
      .set('Origin', 'https://coffee.example')
      .type('form')
      .send({ password: TEST_PASSWORD })
    expect(res.status).toBe(403)
  })

  it('같은 출처의 POST는 통과한다', async () => {
    const res = await request(app)
      .post('/admin/login')
      .set('Host', 'coffee.example')
      .set('Origin', 'http://coffee.example')
      .type('form')
      .send({ password: TEST_PASSWORD })
    expect(res.status).toBe(303)
  })

  it('리버스 프록시(HTTPS) 뒤: X-Forwarded-Proto가 https면 https Origin의 POST가 통과한다', async () => {
    const res = await request(app)
      .post('/admin/login')
      .set('X-Forwarded-Proto', 'https')
      .set('Host', 'coffee.example')
      .set('Origin', 'https://coffee.example')
      .type('form')
      .send({ password: TEST_PASSWORD })
    expect(res.status).toBe(303)
  })

  it('프록시가 X-Forwarded-Proto를 넘기지 않으면(nginx 설정 누락) https Origin의 로그인이 403으로 막힌다', async () => {
    const res = await request(app)
      .post('/admin/login')
      .set('Host', 'coffee.example')
      .set('Origin', 'https://coffee.example')
      .type('form')
      .send({ password: TEST_PASSWORD })
    expect(res.status).toBe(403)
  })
})
