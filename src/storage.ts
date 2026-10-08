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
      await Promise.all([
        fs.writeFile(fullPath(saved.fileName), image.main),
        fs.writeFile(fullPath(saved.thumbName), image.thumb),
      ])
      return saved
    },

    async remove(names) {
      await Promise.all(names.map((name) => fs.rm(fullPath(name), { force: true })))
    },
  }
}
