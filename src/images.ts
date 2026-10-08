import sharp from 'sharp'
import { HttpError } from './errors.js'

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif'])
export const UNSUPPORTED_FORMAT_MESSAGE = 'JPG, PNG, WebP, AVIF 이미지만 올릴 수 있습니다.'

export type ProcessedImage = { main: Buffer; thumb: Buffer }

/** EXIF 방향을 바로잡고 본 이미지(긴 변 1600px)와 썸네일(긴 변 480px)을 WebP로 만든다 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  let format: string | undefined
  try {
    format = (await sharp(input).metadata()).format
  } catch {
    throw new HttpError(400, '이미지를 읽을 수 없습니다.')
  }
  // 클라이언트가 보낸 MIME은 믿지 않고 실제 파일 형식(heif는 AVIF)으로 거른다
  if (!format || !ALLOWED_FORMATS.has(format)) throw new HttpError(400, UNSUPPORTED_FORMAT_MESSAGE)
  try {
    const base = sharp(input, { failOn: 'error' }).rotate()
    const [main, thumb] = await Promise.all([
      base.clone().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
      base.clone().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer(),
    ])
    return { main, thumb }
  } catch {
    throw new HttpError(400, '이미지를 읽을 수 없습니다.')
  }
}
