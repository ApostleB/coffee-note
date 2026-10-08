import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStorage } from '../src/storage.js'

describe('createStorage', () => {
  const tempDirs: string[] = []
  const makeTempDir = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coffee-storage-'))
    tempDirs.push(dir)
    return dir
  }
  afterEach(() => {
    vi.restoreAllMocks()
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

  it('썸네일 쓰기만 실패하면 본 이미지 파일도 남기지 않고 원래 오류를 던진다', async () => {
    const dir = path.join(makeTempDir(), 'uploads')
    const storage = createStorage(dir)
    const original = fsp.writeFile.bind(fsp)
    const failure = new Error('disk full')
    vi.spyOn(fsp, 'writeFile').mockImplementation(async (file, data, options) => {
      if (String(file).endsWith('-thumb.webp')) throw failure
      // 본 이미지 쓰기는 실패보다 늦게 끝나도 정리 대상에 들어와야 한다
      await new Promise((resolve) => setTimeout(resolve, 30))
      return original(file, data, options)
    })

    await expect(storage.save({ main: Buffer.from('main'), thumb: Buffer.from('thumb') })).rejects.toBe(failure)
    // 늦게 끝나는 쓰기가 있어도 정리 이후 파일이 되살아나지 않아야 한다
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(fs.readdirSync(dir)).toEqual([])
  })

  it('실패 후 정리까지 실패하면 파일명을 기록하고 원래 오류를 던진다', async () => {
    const dir = path.join(makeTempDir(), 'uploads')
    const storage = createStorage(dir)
    const failure = new Error('disk full')
    const cleanupFailure = new Error('EBUSY')
    const original = fsp.writeFile.bind(fsp)
    vi.spyOn(fsp, 'writeFile').mockImplementation(async (file, data, options) => {
      if (String(file).endsWith('-thumb.webp')) throw failure
      return original(file, data, options)
    })
    vi.spyOn(fsp, 'rm').mockRejectedValue(cleanupFailure)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(storage.save({ main: Buffer.from('main'), thumb: Buffer.from('thumb') })).rejects.toBe(failure)
    expect(logged).toHaveBeenCalledTimes(2)
    for (const [message, name, err] of logged.mock.calls) {
      expect(message).toBe('사진 파일 정리 실패')
      expect(name).toMatch(/^[0-9a-f-]{36}(-thumb)?\.webp$/)
      expect(err).toBe(cleanupFailure)
    }
  })
})
