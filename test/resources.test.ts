import { describe, expect, it } from 'vitest'
import { beanDef, cafeVisitDef, columnsOf, prepare, toEntity, type PhotoRow } from '../src/resources.js'

const required = { name: '에티오피아 구지', shop: '커피리브레' }

function prepared(def: typeof beanDef, body: Record<string, unknown>) {
  const result = prepare(def, body)
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.data
}

function errorsOf(def: typeof beanDef, body: Record<string, unknown>) {
  const result = prepare(def, body)
  if (result.ok) throw new Error('검증 실패를 기대했습니다')
  return result.errors
}

describe('prepare(beanDef)', () => {
  it('필수값만 있으면 나머지는 null·기본값', () => {
    expect(prepared(beanDef, required)).toMatchObject({
      name: '에티오피아 구지',
      shop: '커피리브레',
      country: null,
      price: null,
      roastedAt: null,
      isDecaf: false,
      flavorTags: [],
      totalScore: null,
    })
  })

  it('폼 문자열을 알맞은 타입으로 바꾼다', () => {
    const data = prepared(beanDef, {
      ...required,
      name: '  에티오피아 구지  ',
      country: '   ',
      price: '18,000',
      weightG: '200',
      isDecaf: 'on',
      flavorTags: '베리, 자스민',
      purchasedAt: '2026-10-01',
      url: 'https://example.com/guji',
    })
    expect(data).toMatchObject({
      name: '에티오피아 구지',
      country: null,
      price: 18000,
      weightG: 200,
      isDecaf: true,
      flavorTags: ['베리', '자스민'],
      purchasedAt: '2026-10-01',
      url: 'https://example.com/guji',
    })
  })

  it('네 점수가 모두 있으면 총점을 계산한다', () => {
    const data = prepared(beanDef, { ...required, acidity: '8', sweetness: '7', body: '6', aftertaste: '9' })
    expect(data).toMatchObject({ acidity: 8, sweetness: 7, body: 6, aftertaste: 9, totalScore: 30 })
  })

  it('점수가 하나라도 비면 총점은 null', () => {
    expect(prepared(beanDef, { ...required, acidity: '8', sweetness: '7', body: '6' }).totalScore).toBeNull()
  })

  it('필드별 오류 메시지를 돌려준다', () => {
    const errors = errorsOf(beanDef, {
      shop: '리브레',
      acidity: '11',
      price: 'abc',
      purchasedAt: '2026/10/01',
      url: 'javascript:alert(1)',
    })
    expect(errors).toEqual({
      name: '원두명 항목은 필수입니다',
      acidity: '10 이하여야 합니다',
      price: '숫자를 입력하세요',
      purchasedAt: '날짜는 YYYY-MM-DD 형식이어야 합니다',
      url: 'http:// 또는 https:// 로 시작하는 주소를 입력하세요',
    })
  })

  it('알 수 없는 필드는 버린다', () => {
    expect(prepared(beanDef, { ...required, id: 99, hacked: true })).not.toHaveProperty('hacked')
  })
})

describe('prepare 잘못된 타입 입력', () => {
  it('선택 문자열·날짜에 문자열이 아닌 값이 오면 한국어 메시지', () => {
    expect(errorsOf(beanDef, { ...required, country: 123, purchasedAt: 123 })).toEqual({
      country: '문자열을 입력하세요',
      purchasedAt: '문자열을 입력하세요',
    })
  })

  it('필수 문자열에 문자열이 아닌 값이 와도 한국어 메시지', () => {
    expect(errorsOf(beanDef, { name: 123, shop: '리브레' })).toEqual({ name: '원두명 항목은 필수입니다' })
  })

  it('본문이 객체가 아니면 _ 키로 한국어 메시지', () => {
    expect(errorsOf(beanDef, 'oops' as unknown as Record<string, unknown>)).toEqual({ _: '잘못된 입력입니다' })
    expect(errorsOf(beanDef, [] as unknown as Record<string, unknown>)).toEqual({ _: '잘못된 입력입니다' })
  })
})

describe('prepare(cafeVisitDef)', () => {
  it('정상 입력', () => {
    expect(
      prepared(cafeVisitDef, { menu: '게이샤 필터', cafeName: '프릳츠', rating: '4', mapUrl: 'https://map.naver.com/x' }),
    ).toMatchObject({ menu: '게이샤 필터', cafeName: '프릳츠', rating: 4, mapUrl: 'https://map.naver.com/x' })
  })

  it('별점은 1~5', () => {
    expect(errorsOf(cafeVisitDef, { menu: 'a', cafeName: 'b', rating: '6' })).toEqual({ rating: '5 이하여야 합니다' })
  })
})

describe('columnsOf', () => {
  it('폼 필드와 계산 필드를 컬럼으로 매핑한다', () => {
    const columns = new Map(columnsOf(beanDef))
    expect(columns.get('roastLevel')).toBe('roast_level')
    expect(columns.get('totalScore')).toBe('total_score')
    expect(columns.has('id')).toBe(false)
  })
})

describe('toEntity', () => {
  const row = {
    id: 3,
    name: '구지',
    shop: '리브레',
    roast_level: '라이트',
    flavor_tags: ['베리'],
    is_decaf: false,
    total_score: null,
    created_at: new Date('2026-10-01T00:00:00Z'),
    updated_at: new Date('2026-10-02T00:00:00Z'),
  }
  const photo = (id: number, isThumbnail = false): PhotoRow => ({
    id,
    bean_id: 3,
    cafe_visit_id: null,
    file_name: `p${id}.webp`,
    thumb_name: `p${id}-thumb.webp`,
    sort_order: id,
    is_thumbnail: isThumbnail,
    created_at: new Date(),
  })

  it('snake_case 행을 camelCase 엔티티로 바꾸고 없는 컬럼은 null', () => {
    const entity = toEntity(beanDef, row, [])
    expect(entity).toMatchObject({ id: 3, name: '구지', roastLevel: '라이트', flavorTags: ['베리'], country: null })
    expect(entity.createdAt).toEqual(row.created_at)
    expect(entity.thumbnailUrl).toBeNull()
  })

  it('썸네일로 지정한 사진을 우선한다', () => {
    const entity = toEntity(beanDef, row, [photo(1), photo(2, true)])
    expect(entity.photos.map((p) => p.url)).toEqual(['/uploads/p1.webp', '/uploads/p2.webp'])
    expect(entity.thumbnailUrl).toBe('/uploads/p2-thumb.webp')
  })

  it('지정이 없으면 첫 사진이 썸네일', () => {
    expect(toEntity(beanDef, row, [photo(1), photo(2)]).thumbnailUrl).toBe('/uploads/p1-thumb.webp')
  })
})
