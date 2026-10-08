import sharp from 'sharp'
import { HttpError } from './errors.js'

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp'])

/** 업로드를 허용하는 실제 파일 형식인지. heif 컨테이너는 AV1(AVIF)만 허용하고 HEIC(hevc)는 거부한다 */
export function isAllowedFormat({ format, compression }: { format?: string; compression?: string }): boolean {
  if (format === 'heif') return compression === 'av1'
  return format !== undefined && ALLOWED_FORMATS.has(format)
}
export const UNSUPPORTED_FORMAT_MESSAGE = 'JPG, PNG, WebP, AVIF 이미지만 올릴 수 있습니다.'

export type ProcessedImage = { main: Buffer; thumb: Buffer }

/** EXIF 방향을 바로잡고 본 이미지(긴 변 1600px)와 썸네일(긴 변 480px)을 WebP로 만든다 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  let metadata: sharp.Metadata
  try {
    metadata = await sharp(input).metadata()
  } catch {
    throw new HttpError(400, '이미지를 읽을 수 없습니다.')
  }
  // 클라이언트가 보낸 MIME은 믿지 않고 실제 파일 형식으로 거른다
  if (!isAllowedFormat(metadata)) throw new HttpError(400, UNSUPPORTED_FORMAT_MESSAGE)
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
