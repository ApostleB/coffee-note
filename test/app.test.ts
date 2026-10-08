import type { Pool } from 'pg'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { testConfig } from './helpers.js'

const app = createApp({ config: testConfig(), pool: {} as Pool })

describe('app', () => {
  it('GET /healthz', async () => {
    const res = await request(app).get('/healthz')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('없는 페이지는 404 오류 페이지', async () => {
    const res = await request(app).get('/nope')
    expect(res.status).toBe(404)
    expect(res.type).toBe('text/html')
    expect(res.text).toContain('페이지를 찾을 수 없습니다')
    expect(res.text).toContain('/vendor/bootstrap/css/bootstrap.min.css')
  })

  it.each([
    ['/vendor/bootstrap/css/bootstrap.min.css', 'text/css'],
    ['/vendor/bootstrap/js/bootstrap.bundle.min.js', 'text/javascript'],
    ['/vendor/bootstrap-icons/bootstrap-icons.min.css', 'text/css'],
    ['/vendor/pretendard/pretendardvariable-dynamic-subset.css', 'text/css'],
    ['/css/app.css', 'text/css'],
    ['/js/theme.js', 'text/javascript'],
  ])('정적 파일 %s', async (url, type) => {
    const res = await request(app).get(url)
    expect(res.status).toBe(200)
    expect(res.type).toBe(type)
  })

  it('본문이 너무 크면 오류 페이지로 응답한다', async () => {
    const res = await request(app).post('/healthz').type('form').send('x=' + 'a'.repeat(102401))
    expect(res.status).toBe(413)
    expect(res.type).toBe('text/html')
    expect(res.text).toContain('잘못된 요청입니다')
    expect(res.text).toContain('처음으로')
  })
})
