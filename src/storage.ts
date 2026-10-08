import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ProcessedImage } from './images.js'

export type SavedImage = { fileName: string; thumbName: string }

export type Storage = {
  save(image: ProcessedImage): Promise<SavedImage>
  remove(names: string[]): Promise<void>
}

export function createStorage(dir: string): Storage {
  // 파일 이름만 쓰므로 '../' 같은 경로가 들어와도 저장 폴더 밖으로 나가지 않는다
  const fullPath = (name: string) => path.join(dir, path.basename(name))
  return {
    async save(image) {
      await fs.mkdir(dir, { recursive: true })
      const id = randomUUID()
      const saved = { fileName: `${id}.webp`, thumbName: `${id}-thumb.webp` }
      // 한쪽이 실패해도 다른 쓰기가 끝날 때까지 기다린 뒤 둘 다 지워야 파일이 되살아나지 않는다
      const results = await Promise.allSettled([
        fs.writeFile(fullPath(saved.fileName), image.main),
        fs.writeFile(fullPath(saved.thumbName), image.thumb),
      ])
      const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
      if (failed) {
        const names = [saved.fileName, saved.thumbName]
        const cleanup = await Promise.allSettled(names.map((name) => fs.rm(fullPath(name), { force: true })))
        cleanup.forEach((result, i) => {
          if (result.status === 'rejected') console.error('사진 파일 정리 실패', names[i], result.reason)
        })
        throw failed.reason
      }
      return saved
    },

    async remove(names) {
      const results = await Promise.allSettled(names.map((name) => fs.rm(fullPath(name), { force: true })))
      const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
      if (failed) throw failed.reason
    },
  }
}
