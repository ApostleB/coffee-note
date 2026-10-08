import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { isAllowedFormat, processImage } from '../src/images.js'

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#8b4a2b' } }).png().toBuffer()

describe('processImage', () => {
  it('긴 변 기준으로 줄이고 WebP로 바꾼다', async () => {
    const { main, thumb } = await processImage(await png(3000, 2000))
    const [mainMeta, thumbMeta] = await Promise.all([sharp(main).metadata(), sharp(thumb).metadata()])
    expect(mainMeta.format).toBe('webp')
    expect(mainMeta.width).toBe(1600)
    expect(thumbMeta.format).toBe('webp')
    expect(thumbMeta.width).toBe(480)
  })

  it('작은 사진은 키우지 않는다', async () => {
    const { main, thumb } = await processImage(await png(400, 300))
    expect((await sharp(main).metadata()).width).toBe(400)
    expect((await sharp(thumb).metadata()).width).toBe(400)
  })

  it('이미지가 아니면 400', async () => {
    await expect(processImage(Buffer.from('not an image'))).rejects.toMatchObject({
      status: 400,
      message: '이미지를 읽을 수 없습니다.',
    })
  })

  it('GIF처럼 허용하지 않는 형식은 400', async () => {
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#8b4a2b' } }).gif().toBuffer()
    await expect(processImage(gif)).rejects.toMatchObject({
      status: 400,
      message: 'JPG, PNG, WebP, AVIF 이미지만 올릴 수 있습니다.',
    })
  })

  it('AVIF는 통과한다', async () => {
    const avif = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#8b4a2b' } }).avif().toBuffer()
    expect((await sharp(avif).metadata()).compression).toBe('av1')
    const { main } = await processImage(avif)
    expect((await sharp(main).metadata()).format).toBe('webp')
  })
})

describe('isAllowedFormat', () => {
  it('heif는 AV1(AVIF)만 허용하고 HEIC(hevc)는 거부한다', () => {
    expect(isAllowedFormat({ format: 'heif', compression: 'av1' })).toBe(true)
    expect(isAllowedFormat({ format: 'heif', compression: 'hevc' })).toBe(false)
    expect(isAllowedFormat({ format: 'heif' })).toBe(false)
  })

  it('JPEG, PNG, WebP는 허용하고 그 밖은 거부한다', () => {
    for (const format of ['jpeg', 'png', 'webp']) expect(isAllowedFormat({ format })).toBe(true)
    for (const format of ['gif', 'svg', 'tiff', undefined]) expect(isAllowedFormat({ format })).toBe(false)
  })
})
