import { prepare, type Entity, type ResourceDef } from '../src/resources.js'

/** 폼 본문을 검증·변환한 저장용 데이터. 검증에 실패하면 테스트를 깨뜨린다. */
export function prepared(def: ResourceDef, body: Record<string, unknown>): Record<string, unknown> {
  const result = prepare(def, body)
  if (!result.ok) throw new Error(`검증 실패: ${JSON.stringify(result.errors)}`)
  return result.data
}

export function beanEntity(overrides: Record<string, unknown> = {}): Entity {
  return {
    id: 1,
    name: '에티오피아 구지',
    shop: '커피리브레',
    summary: '산뜻한 베리 향',
    url: 'https://example.com/guji',
    country: '에티오피아',
    region: '구지',
    variety: ['헤어룸'],
    process: '내추럴',
    roastLevel: '라이트',
    isDecaf: false,
    purchasedAt: '2026-10-01',
    price: 18000,
    weightG: 200,
    brewMethod: '핸드드립',
    roastedAt: '2026-09-28',
    bestFrom: '2026-10-05',
    acidity: 8,
    sweetness: 7,
    body: 6,
    aftertaste: 9,
    totalScore: 30,
    flavorTags: ['베리', '자스민'],
    memo: '두 번째 추출이 더 좋았다',
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    updatedAt: new Date('2026-10-01T10:00:00.000Z'),
    photos: [],
    thumbnailUrl: null,
    ...overrides,
  } as Entity
}

export function cafeEntity(overrides: Record<string, unknown> = {}): Entity {
  return {
    id: 1,
    menu: '게이샤 필터',
    cafeName: '프릳츠',
    visitedAt: '2026-10-05',
    rating: 4,
    price: 9000,
    brewMethod: '필터',
    country: '파나마',
    variety: ['게이샤'],
    process: '워시드',
    isDecaf: false,
    flavorTags: ['꽃', '시트러스'],
    address: '서울 마포구',
    mapUrl: 'https://map.naver.com/p/fritz',
    moodMemo: '창가 자리가 좋다',
    memo: '산미가 깔끔하다',
    createdAt: new Date('2026-10-05T10:00:00.000Z'),
    updatedAt: new Date('2026-10-05T10:00:00.000Z'),
    photos: [],
    thumbnailUrl: null,
    ...overrides,
  } as Entity
}
