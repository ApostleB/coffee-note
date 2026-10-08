import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { processImage } from '../src/images.js'

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
})
