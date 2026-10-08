import { describe, expect, it } from 'vitest'
import { beanDef, cafeVisitDef } from '../src/resources.js'
import { buildDetailModel, buildHomeModel, toCardModel } from '../src/view-models.js'
import { beanEntity, cafeEntity } from './fixtures.js'

const TODAY = '2026-10-08'

describe('toCardModel', () => {
  it('원두 카드', () => {
    expect(toCardModel(beanDef, beanEntity(), TODAY)).toEqual({
      key: 'bean-1',
      kind: 'bean',
      kindLabel: '원두',
      href: '/beans/1',
      title: '에티오피아 구지',
      subtitle: '커피리브레',
      meta: '에티오피아 · 내추럴 · 라이트',
      summary: '산뜻한 베리 향',
      tags: ['베리', '자스민'],
      thumbnailUrl: null,
      isDecaf: false,
      ready: true,
      score: { type: 'total', value: 30, max: 40 },
      hidden: false,
    })
  })

  it('최적 시음일 전이면 시음 적기가 아니다', () => {
    expect(toCardModel(beanDef, beanEntity(), '2026-10-04').ready).toBe(false)
  })

  it('태그는 4개까지, 점수가 없으면 null', () => {
    const card = toCardModel(beanDef, beanEntity({ flavorTags: ['a', 'b', 'c', 'd', 'e'], totalScore: null }), TODAY)
    expect(card.tags).toEqual(['a', 'b', 'c', 'd'])
    expect(card.score).toBeNull()
  })

  it('카페 카드는 기본 범위가 아니라 처음에 숨긴다', () => {
    expect(toCardModel(cafeVisitDef, cafeEntity(), TODAY)).toMatchObject({
      key: 'cafe-1',
      kindLabel: '카페',
      href: '/cafe-visits/1',
      meta: '2026.10.05 · 필터',
      summary: null,
      ready: false,
      score: { type: 'rating', value: 4 },
      hidden: true,
    })
  })
})

describe('buildHomeModel 품종 선택지', () => {
  it('모든 품종을 펼쳐 고유·가나다순, 카페 제외', () => {
    const model = buildHomeModel(
      [beanEntity({ id: 1, variety: ['버번', '게이샤'] }), beanEntity({ id: 2, variety: ['버번', '티피카'] }), beanEntity({ id: 3, variety: [] })],
      [cafeEntity({ variety: ['카페전용'] })],
    )
    expect(model.beanOptions.variety).toEqual(['게이샤', '버번', '티피카'])
  })
})

describe('buildHomeModel', () => {
  it('카드·인덱스·개수·가게 목록', () => {
    const model = buildHomeModel(
      [
        beanEntity({ id: 1, shop: '커피리브레' }),
        beanEntity({ id: 2, shop: '나무사이로' }),
        beanEntity({ id: 3, shop: '커피리브레', name: '</script>' }),
      ],
      [cafeEntity()],
      TODAY,
    )
    expect(model.title).toBe('')
    expect(model.cards.map((c) => c.key)).toEqual(['bean-1', 'bean-2', 'bean-3', 'cafe-1'])
    expect(model.counts).toEqual({ bean: 3, cafe: 1 })
    expect(model.shops).toEqual(['나무사이로', '커피리브레'])
    expect(model.indexJson).not.toContain('</script>')
    expect(JSON.parse(model.indexJson)).toHaveLength(4)
  })
})

describe('buildDetailModel', () => {
  it('원두 상세', () => {
    const model = buildDetailModel(beanDef, beanEntity())
    expect(model).toMatchObject({
      title: '에티오피아 구지',
      heading: '에티오피아 구지',
      key: 'bean-1',
      kindLabel: '원두 노트',
      subtitle: '커피리브레',
      tags: ['베리', '자스민'],
      editHref: '/admin/beans/1/edit',
      photos: [],
    })
    expect(model.rows).toEqual(
      expect.arrayContaining([
        { label: '산지 국가', value: '에티오피아' },
        { label: '가격', value: '18,000원' },
        { label: '용량', value: '200g' },
        { label: '산미', value: '8 / 10' },
        { label: '최적 시음 시작일', value: '2026.10.05' },
        { label: '커핑 총점', value: '30 / 40' },
      ]),
    )
    const labels = model.rows.map((r) => r.label)
    for (const hidden of ['원두명', '판매처(로스터리)', '간략 메모', '상품 URL', '향미 노트', '메모', '디카페인']) {
      expect(labels).not.toContain(hidden)
    }
    expect(model.memos).toEqual([
      { label: '간략 메모', text: '산뜻한 베리 향' },
      { label: '메모', text: '두 번째 추출이 더 좋았다' },
    ])
    expect(model.links).toEqual([{ label: '상품 페이지', href: 'https://example.com/guji' }])
  })

  it('품종은 여러 개를 쉼표로 이어 행에 표시하고 태그 배지에는 넣지 않는다', () => {
    const model = buildDetailModel(beanDef, beanEntity({ variety: ['게이샤', '버번'] }))
    expect(model.rows).toContainEqual({ label: '품종', value: '게이샤, 버번' })
    expect(model.tags).toEqual(['베리', '자스민'])
    expect(buildDetailModel(beanDef, beanEntity({ variety: [] })).rows.map((r) => r.label)).not.toContain('품종')
    expect(buildDetailModel(cafeVisitDef, cafeEntity({ variety: ['게이샤', '버번'] })).rows).toContainEqual({ label: '품종', value: '게이샤, 버번' })
  })

  it('디카페인이면 행에 표시', () => {
    expect(buildDetailModel(beanDef, beanEntity({ isDecaf: true })).rows).toContainEqual({ label: '디카페인', value: '예' })
  })

  it('카페 상세', () => {
    const model = buildDetailModel(cafeVisitDef, cafeEntity())
    expect(model.kindLabel).toBe('카페 후기')
    expect(model.rows).toEqual(
      expect.arrayContaining([
        { label: '방문일', value: '2026.10.05' },
        { label: '별점', value: '★★★★☆' },
        { label: '주소', value: '서울 마포구' },
      ]),
    )
    expect(model.memos.map((m) => m.label)).toEqual(['분위기 메모', '메모'])
    expect(model.links).toEqual([{ label: '지도에서 보기', href: 'https://map.naver.com/p/fritz' }])
    expect(model.editHref).toBe('/admin/cafe-visits/1/edit')
  })
})
