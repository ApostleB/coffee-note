import { describe, expect, it } from 'vitest'
import { applyQuery, DEFAULT_QUERY, normalize, shopOptions, updateQuery, type Query } from '../public/js/query.js'
import type { IndexEntry } from '../src/search-index.js'

function entry(key: string, overrides: Partial<IndexEntry> = {}): IndexEntry {
  return {
    key,
    kind: 'bean',
    title: key,
    subtitle: '가게',
    date: '2026-10-01',
    createdAt: '2026-10-01T00:00:00.000Z',
    score: null,
    price: null,
    country: null,
    roastedAt: null,
    isDecaf: false,
    searchText: key,
    ...overrides,
  }
}

const query = (patch: Partial<Query> = {}): Query => ({ ...DEFAULT_QUERY, ...patch })
const keys = (entries: IndexEntry[]) => entries.map((e) => e.key)

describe('normalize', () => {
  it('서버와 같은 규칙', () => {
    expect(normalize('  Ethiopia   GUJI ')).toBe('ethiopia guji')
    expect(normalize('가')).toBe('가')
  })
})

describe('applyQuery 필터', () => {
  const entries = [
    entry('a', { searchText: '에티오피아 구지 베리 berry', date: '2026-10-03' }),
    entry('b', { searchText: '케냐 aa 베리', date: '2026-10-02', subtitle: '나무사이로', isDecaf: true }),
    entry('c', { searchText: '콜롬비아', date: '2026-10-01' }),
    entry('d', { kind: 'cafe', searchText: '게이샤 베리', date: '2026-10-04', subtitle: '프릳츠' }),
  ]

  it('기본은 원두만', () => {
    expect(keys(applyQuery(entries, query()))).toEqual(['a', 'b', 'c'])
  })

  it('범위: 전체, 카페', () => {
    expect(keys(applyQuery(entries, query({ scope: 'all' })))).toEqual(['d', 'a', 'b', 'c'])
    expect(keys(applyQuery(entries, query({ scope: 'cafe' })))).toEqual(['d'])
  })

  it('검색어 토큰을 모두 포함해야 한다 (대소문자 무시)', () => {
    expect(keys(applyQuery(entries, query({ text: '베리' })))).toEqual(['a', 'b'])
    expect(keys(applyQuery(entries, query({ text: '베리  케냐' })))).toEqual(['b'])
    expect(keys(applyQuery(entries, query({ text: ' BERRY ' })))).toEqual(['a'])
    expect(keys(applyQuery(entries, query({ text: '없는말' })))).toEqual([])
  })

  it('가게, 디카페인', () => {
    expect(keys(applyQuery(entries, query({ shop: '나무사이로' })))).toEqual(['b'])
    expect(keys(applyQuery(entries, query({ decafOnly: true })))).toEqual(['b'])
  })

  it('원본 배열을 바꾸지 않는다', () => {
    const before = keys(entries)
    applyQuery(entries, query({ sort: 'oldest' }))
    expect(keys(entries)).toEqual(before)
  })
})

describe('applyQuery 정렬', () => {
  it('최신순은 날짜, 같으면 생성 시각', () => {
    const entries = [
      entry('old', { date: '2026-09-01' }),
      entry('same-early', { date: '2026-10-01', createdAt: '2026-10-01T01:00:00.000Z' }),
      entry('same-late', { date: '2026-10-01', createdAt: '2026-10-01T05:00:00.000Z' }),
    ]
    expect(keys(applyQuery(entries, query({ sort: 'newest' })))).toEqual(['same-late', 'same-early', 'old'])
    expect(keys(applyQuery(entries, query({ sort: 'oldest' })))).toEqual(['old', 'same-early', 'same-late'])
  })

  it('점수 높은순, 점수 없으면 뒤로', () => {
    const entries = [entry('none'), entry('low', { score: 0.5 }), entry('high', { score: 0.9 })]
    expect(keys(applyQuery(entries, query({ sort: 'score' })))).toEqual(['high', 'low', 'none'])
  })

  it('이름순은 가나다, 숫자는 자연 정렬', () => {
    const entries = [entry('k1', { title: '다방' }), entry('k2', { title: '가비' }), entry('k3', { title: '나무' })]
    expect(keys(applyQuery(entries, query({ sort: 'name' })))).toEqual(['k2', 'k3', 'k1'])
    const numbered = [entry('n10', { title: '원두 10' }), entry('n2', { title: '원두 2' })]
    expect(keys(applyQuery(numbered, query({ sort: 'name' })))).toEqual(['n2', 'n10'])
  })

  it('가격순, 가격 없으면 항상 뒤로', () => {
    const entries = [entry('none'), entry('cheap', { price: 9000 }), entry('pricey', { price: 30000 })]
    expect(keys(applyQuery(entries, query({ sort: 'priceAsc' })))).toEqual(['cheap', 'pricey', 'none'])
    expect(keys(applyQuery(entries, query({ sort: 'priceDesc' })))).toEqual(['pricey', 'cheap', 'none'])
  })

  it('최신 로스팅순, 로스팅일 없으면 뒤로', () => {
    const entries = [
      entry('none'),
      entry('early', { roastedAt: '2026-09-01' }),
      entry('late', { roastedAt: '2026-09-28' }),
    ]
    expect(keys(applyQuery(entries, query({ sort: 'roasted' })))).toEqual(['late', 'early', 'none'])
  })

  it('원두 국가순, 같은 국가는 이름순, 국가 없으면 뒤로', () => {
    const entries = [
      entry('none', { title: '가' }),
      entry('kenya', { country: '케냐', title: '나' }),
      entry('eth-b', { country: '에티오피아', title: '시다모' }),
      entry('eth-a', { country: '에티오피아', title: '구지' }),
    ]
    expect(keys(applyQuery(entries, query({ sort: 'country' })))).toEqual(['eth-a', 'eth-b', 'kenya', 'none'])
  })
})

describe('updateQuery', () => {
  it('범위가 바뀌면 가게 필터를 비운다', () => {
    expect(updateQuery(query({ shop: '리브레' }), { scope: 'cafe' })).toMatchObject({ scope: 'cafe', shop: '' })
  })

  it('원두가 아닌 범위로 가면 로스팅순을 최신순으로 되돌린다', () => {
    expect(updateQuery(query({ sort: 'roasted' }), { scope: 'all' }).sort).toBe('newest')
    expect(updateQuery(query({ sort: 'roasted' }), { scope: 'bean' }).sort).toBe('roasted')
    expect(updateQuery(query({ scope: 'all', sort: 'priceAsc' }), { scope: 'cafe' }).sort).toBe('priceAsc')
  })

  it('범위가 그대로면 가게·정렬을 유지한다', () => {
    const next = updateQuery(query({ shop: '리브레', sort: 'roasted' }), { text: '베리' })
    expect(next).toMatchObject({ shop: '리브레', sort: 'roasted', text: '베리' })
  })
})

describe('shopOptions', () => {
  it('범위 안의 가게 이름을 중복 없이 가나다순으로', () => {
    const entries = [
      entry('a', { subtitle: '커피리브레' }),
      entry('b', { subtitle: '나무사이로' }),
      entry('c', { subtitle: '커피리브레' }),
      entry('d', { kind: 'cafe', subtitle: '프릳츠' }),
    ]
    expect(shopOptions(entries, 'bean')).toEqual(['나무사이로', '커피리브레'])
    expect(shopOptions(entries, 'cafe')).toEqual(['프릳츠'])
    expect(shopOptions(entries, 'all')).toEqual(['나무사이로', '커피리브레', '프릳츠'])
  })
})
