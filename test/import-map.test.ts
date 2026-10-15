// @vitest-environment jsdom
import { readdirSync } from 'node:fs'
import path from 'node:path'
import type { Pool } from 'pg'
import request from 'supertest'
import { expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { PUBLIC_DIR } from '../src/paths.js'
import { testConfig, TEST_PASSWORD } from './helpers.js'

// HTML 검증에는 데이터가 필요 없으므로 DB 경계에서 빈 SELECT 결과만 제공한다.
const pool = { query: async () => ({ rows: [] }) } as unknown as Pool

it.each([
  ['/', 'home-main.js'],
  ['/admin/beans', 'admin-main.js'],
])('%s는 모든 모듈을 버전화하고 진입 스크립트보다 먼저 importmap을 출력한다', async (url, entry) => {
  const app = createApp({ config: testConfig(), pool })
  const agent = request.agent(app)
  if (url.startsWith('/admin')) {
    await agent.post('/admin/login').type('form').send({ password: TEST_PASSWORD }).expect(303)
  }
  const res = await agent.get(url).expect(200)
  const document = new DOMParser().parseFromString(res.text, 'text/html')
  const maps = document.querySelectorAll('script[type="importmap"]')
  expect(maps).toHaveLength(1)
  const map = maps[0]
  expect(map.closest('head')).not.toBeNull()
  const imports = JSON.parse(map.textContent!).imports
  const files = readdirSync(path.join(PUBLIC_DIR, 'js')).filter((file) => file.endsWith('.js') && file !== 'theme.js')
  for (const file of files) {
    expect(imports[`/js/${file}`]).toBe(`/js/${file}?v=${app.locals.assetVersion}`)
  }
  const modules = [...document.querySelectorAll('script[type="module"]')]
  expect(modules.length).toBeGreaterThan(0)
  for (const module of modules) {
    expect(map.compareDocumentPosition(module) & 4).toBe(4)
  }
  expect(modules.some((module) => module.getAttribute('src') === `/js/${entry}?v=${app.locals.assetVersion}`)).toBe(true)
})
