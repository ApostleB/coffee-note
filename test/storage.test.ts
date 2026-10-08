import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createStorage } from '../src/storage.js'

describe('createStorage', () => {
  const tempDirs: string[] = []
  const makeTempDir = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coffee-storage-'))
    tempDirs.push(dir)
    return dir
  }
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('UUID 이름으로 저장하고 지운다', async () => {
    const dir = path.join(makeTempDir(), 'nested')
    const storage = createStorage(dir)
    const saved = await storage.save({ main: Buffer.from('main'), thumb: Buffer.from('thumb') })
    expect(saved.fileName).toMatch(/^[0-9a-f-]{36}\.webp$/)
    expect(saved.thumbName).toBe(saved.fileName.replace('.webp', '-thumb.webp'))
    expect(fs.readFileSync(path.join(dir, saved.fileName), 'utf8')).toBe('main')
    expect(fs.readFileSync(path.join(dir, saved.thumbName), 'utf8')).toBe('thumb')

    await storage.remove([saved.fileName, saved.thumbName, 'missing.webp'])
    expect(fs.existsSync(path.join(dir, saved.fileName))).toBe(false)
    expect(fs.existsSync(path.join(dir, saved.thumbName))).toBe(false)
  })

  it('경로 조작이 들어와도 저장 폴더 밖은 지우지 않는다', async () => {
    const base = makeTempDir()
    const outside = path.join(base, 'outside.txt')
    fs.writeFileSync(outside, 'keep')
    const storage = createStorage(path.join(base, 'uploads'))
    await storage.remove(['../outside.txt'])
    expect(fs.existsSync(outside)).toBe(true)
  })
})
