import fs from 'node:fs'
import path from 'node:path'
import type { Express } from 'express'
import type { Pool } from 'pg'
import sharp from 'sharp'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createRepos, type Repos } from '../src/repository.js'
import { beanDef, cafeVisitDef } from '../src/resources.js'
import { createTestPool, describeDb, resetData } from './db.js'
import { prepared } from './fixtures.js'
import { TEST_PASSWORD, testConfig } from './helpers.js'

const png = (color: string) =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: color } }).png().toBuffer()

describeDb('관리자 사진', () => {
  let pool: Pool
  let repos: Repos
  let app: Express
  let uploadDir: string
  // 로그인 시도 제한(분당 10회)에 걸리지 않도록 로그인은 한 번만 한다
  let agent: ReturnType<typeof request.agent>

  const fileExists = (url: string) => fs.existsSync(path.join(uploadDir, path.basename(url)))

  async function upload(target: string, ...images: Buffer[]) {
    let req = agent.post(target)
    images.forEach((image, i) => {
      req = req.attach('photos', image, { filename: `p${i}.png`, contentType: 'image/png' })
    })
    return req
  }

  beforeAll(async () => {
    pool = await createTestPool()
    repos = createRepos(pool)
    const config = testConfig()
    uploadDir = config.uploadDir
    app = createApp({ config, pool })
    agent = request.agent(app)
    await agent.post('/admin/login').type('form').send({ password: TEST_PASSWORD }).expect(303)
  })

  afterAll(async () => {
    await pool.end()
    fs.rmSync(uploadDir, { recursive: true, force: true })
  })

  beforeEach(async () => {
    await resetData(pool)
    await repos.bean.create(prepared(beanDef, { name: '에티오피아 구지', shop: '커피리브레' }))
  })

  it('여러 장을 올리면 변환해 저장하고 수정 화면으로 돌아간다', async () => {
    const res = await upload('/admin/beans/1/photos', await png('#c08040'), await png('#4080c0'))
    expect(res.status).toBe(303)
    expect(res.headers.location).toBe('/admin/beans/1/edit#photos')

    const bean = await repos.bean.get(1)
    expect(bean?.photos).toHaveLength(2)
    expect(bean?.thumbnailUrl).toBe(bean?.photos[0].thumbUrl)
    for (const photo of bean!.photos) {
      expect(fileExists(photo.url)).toBe(true)
      expect(fileExists(photo.thumbUrl)).toBe(true)
    }

    const image = await request(app).get(bean!.photos[0].url)
    expect(image.status).toBe(200)
    expect(image.type).toBe('image/webp')

    const home = await request(app).get('/')
    expect(home.text).toContain(bean!.photos[0].thumbUrl)

    const edit = await agent.get('/admin/beans/1/edit')
    expect(edit.text).toContain(bean!.photos[1].thumbUrl)
    expect(edit.text).toContain('썸네일')
  })

  it('썸네일은 한 장만 지정된다', async () => {
    await upload('/admin/beans/1/photos', await png('#c08040'), await png('#4080c0'))
    const [first, second] = (await repos.bean.get(1))!.photos

    const res = await agent.post(`/admin/photos/${second.id}/thumbnail`)
    expect(res.status).toBe(303)
    expect(res.headers.location).toBe('/admin/beans/1/edit#photos')
    expect((await repos.bean.get(1))?.thumbnailUrl).toBe(second.thumbUrl)

    await agent.post(`/admin/photos/${first.id}/thumbnail`).expect(303)
    const after = await repos.bean.get(1)
    expect(after?.photos.filter((p) => p.isThumbnail).map((p) => p.id)).toEqual([first.id])
  })

  it('사진을 지우면 파일도 지운다', async () => {
    await upload('/admin/beans/1/photos', await png('#c08040'))
    const [photo] = (await repos.bean.get(1))!.photos
    const res = await agent.post(`/admin/photos/${photo.id}/delete`)
    expect(res.status).toBe(303)
    expect(res.headers.location).toBe('/admin/beans/1/edit#photos')
    expect((await repos.bean.get(1))?.photos).toHaveLength(0)
    expect(fileExists(photo.url)).toBe(false)
    expect(fileExists(photo.thumbUrl)).toBe(false)
  })

  it('글을 지우면 사진 파일도 지운다', async () => {
    await upload('/admin/beans/1/photos', await png('#c08040'))
    const [photo] = (await repos.bean.get(1))!.photos
    await agent.post('/admin/beans/1/delete').expect(303)
    expect(fileExists(photo.url)).toBe(false)
    expect(fileExists(photo.thumbUrl)).toBe(false)
  })

  it('없는 사진은 404', async () => {
    expect((await agent.post('/admin/photos/999/delete')).status).toBe(404)
    expect((await agent.post('/admin/photos/999/thumbnail')).status).toBe(404)
  })

  it('이미지가 아니면 400과 함께 폼을 다시 보여준다', async () => {
    const res = await agent
      .post('/admin/beans/1/photos')
      .attach('photos', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' })
    expect(res.status).toBe(400)
    expect(res.text).toContain('JPG, PNG, WebP, AVIF 이미지만 올릴 수 있습니다.')
    expect(res.text).toContain('value="에티오피아 구지"')
  })

  it('사진 없이 올리면 400', async () => {
    const res = await agent.post('/admin/beans/1/photos').field('note', 'empty')
    expect(res.status).toBe(400)
    expect(res.text).toContain('올릴 사진을 선택하세요.')
  })

  it('없는 글에는 올릴 수 없다', async () => {
    const res = await upload('/admin/beans/999/photos', await png('#c08040'))
    expect(res.status).toBe(404)
  })

  it('카페 후기에도 올릴 수 있다', async () => {
    await repos.cafe.create(prepared(cafeVisitDef, { menu: '게이샤 필터', cafeName: '프릳츠' }))
    const res = await upload('/admin/cafe-visits/1/photos', await png('#c08040'))
    expect(res.headers.location).toBe('/admin/cafe-visits/1/edit#photos')
    expect((await repos.cafe.get(1))?.photos).toHaveLength(1)
  })

  it('로그인하지 않으면 올릴 수 없다', async () => {
    const res = await request(app)
      .post('/admin/beans/1/photos')
      .attach('photos', await png('#c08040'), { filename: 'a.png', contentType: 'image/png' })
    expect(res.status).toBe(303)
    expect(res.headers.location).toBe('/admin/login')
    expect((await repos.bean.get(1))?.photos).toHaveLength(0)
  })
})
