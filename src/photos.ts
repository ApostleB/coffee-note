import type { Request, Response } from 'express'
import multer from 'multer'
import type { Pool } from 'pg'
import { withTransaction } from './db.js'
import { HttpError } from './errors.js'
import { processImage } from './images.js'
import type { Kind, PhotoRow, ResourceDef } from './resources.js'
import type { SavedImage, Storage } from './storage.js'

const MAX_PHOTO_BYTES = 15 * 1024 * 1024
const MAX_PHOTOS_PER_UPLOAD = 20
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])

const MULTER_MESSAGES: Record<string, string> = {
  LIMIT_FILE_SIZE: '사진 한 장은 15MB 이하여야 합니다.',
  LIMIT_FILE_COUNT: `사진은 한 번에 ${MAX_PHOTOS_PER_UPLOAD}장까지 올릴 수 있습니다.`,
  LIMIT_UNEXPECTED_FILE: `사진은 한 번에 ${MAX_PHOTOS_PER_UPLOAD}장까지 올릴 수 있습니다.`,
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_PHOTOS_PER_UPLOAD },
  fileFilter: (_req, file, callback) => {
    if (ALLOWED_TYPES.has(file.mimetype)) callback(null, true)
    else callback(new HttpError(400, 'JPG, PNG, WebP, AVIF 이미지만 올릴 수 있습니다.'))
  },
}).array('photos', MAX_PHOTOS_PER_UPLOAD)

/** multipart 요청에서 사진 파일을 꺼낸다. 형식·용량 오류는 HttpError(400) */
export function receivePhotos(req: Request, res: Response): Promise<Express.Multer.File[]> {
  return new Promise((resolve, reject) => {
    upload(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        reject(new HttpError(400, MULTER_MESSAGES[err.code] ?? '사진을 올리지 못했습니다.'))
        return
      }
      if (err) {
        reject(err)
        return
      }
      resolve((req.files as Express.Multer.File[] | undefined) ?? [])
    })
  })
}

export type PhotoOwner = { kind: Kind; id: number }

export type PhotoService = {
  add(def: ResourceDef, ownerId: number, files: Express.Multer.File[]): Promise<void>
  /** 사진 행과 파일을 지우고 소유 글을 돌려준다. 없으면 null */
  remove(photoId: number): Promise<PhotoOwner | null>
  /** 같은 글의 다른 썸네일 지정을 풀고 이 사진을 썸네일로 지정한다. 없으면 null */
  setThumbnail(photoId: number): Promise<PhotoOwner | null>
  removeFiles(rows: PhotoRow[]): Promise<void>
}

const ownerOf = (row: PhotoRow): PhotoOwner =>
  row.bean_id !== null ? { kind: 'bean', id: row.bean_id } : { kind: 'cafe', id: row.cafe_visit_id as number }

const fileNamesOf = (rows: PhotoRow[]) => rows.flatMap((row) => [row.file_name, row.thumb_name])

export function createPhotoService(pool: Pool, storage: Storage): PhotoService {
  return {
    async add(def, ownerId, files) {
      if (files.length === 0) throw new HttpError(400, '올릴 사진을 선택하세요.')
      const saved: SavedImage[] = []
      try {
        for (const file of files) saved.push(await storage.save(await processImage(file.buffer)))
        await withTransaction(pool, async (client) => {
          // 부모 행을 잠가 동시 업로드의 정렬 번호 충돌과 글 삭제와의 경합을 막는다
          const { rowCount: found } = await client.query(`SELECT id FROM ${def.table} WHERE id = $1 FOR UPDATE`, [ownerId])
          if (!found) throw new HttpError(404, '기록을 찾을 수 없습니다')
          const { rows } = await client.query<{ next: number }>(
            `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM photos WHERE ${def.photoFk} = $1`,
            [ownerId],
          )
          for (const [i, image] of saved.entries()) {
            await client.query(
              `INSERT INTO photos (${def.photoFk}, file_name, thumb_name, sort_order) VALUES ($1, $2, $3, $4)`,
              [ownerId, image.fileName, image.thumbName, rows[0].next + i],
            )
          }
        })
      } catch (err) {
        // DB에 남지 않은 파일은 지운다
        await storage.remove(saved.flatMap((image) => [image.fileName, image.thumbName]))
        throw err
      }
    },

    async remove(photoId) {
      const { rows } = await pool.query<PhotoRow>('DELETE FROM photos WHERE id = $1 RETURNING *', [photoId])
      if (!rows[0]) return null
      await storage.remove(fileNamesOf(rows))
      return ownerOf(rows[0])
    },

    async setThumbnail(photoId) {
      return withTransaction(pool, async (client) => {
        const { rows } = await client.query<PhotoRow>('SELECT * FROM photos WHERE id = $1 FOR UPDATE', [photoId])
        const photo = rows[0]
        if (!photo) return null
        const fk = photo.bean_id !== null ? 'bean_id' : 'cafe_visit_id'
        await client.query(`UPDATE photos SET is_thumbnail = false WHERE ${fk} = $1 AND is_thumbnail`, [photo[fk]])
        await client.query('UPDATE photos SET is_thumbnail = true WHERE id = $1', [photoId])
        return ownerOf(photo)
      })
    },

    removeFiles: (rows) => storage.remove(fileNamesOf(rows)),
  }
}
