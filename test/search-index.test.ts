import { describe, expect, it } from 'vitest'
import { beanDef, cafeVisitDef } from '../src/resources.js'
import { normalize, toIndexEntry } from '../src/search-index.js'
import { beanEntity, cafeBean, cafeEntity } from './fixtures.js'

describe('normalize', () => {
  it('소문자, 공백 정리', () => {
    expect(normalize('  Ethiopia   GUJI ')).toBe('ethiopia guji')
  })

  it('조합형 한글을 완성형으로', () => {
    expect(normalize('\u1100\u1161')).toBe('가')
  })
})

describe('toIndexEntry', () => {
  it('원두 노트', () => {
    const entry = toIndexEntry(beanDef, beanEntity())
    expect(entry).toMatchObject({
      key: 'bean-1',
      kind: 'bean',
      title: '에티오피아 구지',
      subtitle: '커피리브레',
      shop: '커피리브레',
      date: '2026-10-01',
      createdAt: '2026-10-01T10:00:00.000Z',
      score: 0.75,
      price: 18000,
      country: '에티오피아',
      process: '내추럴', roastLevel: '라이트', varieties: ['헤어룸'], brewMethod: '핸드드립', flavorTags: ['베리', '자스민'],
      roastedAt: '2026-09-28',
      isDecaf: false,
    })
    expect(entry.searchText).toContain('커피리브레')
    expect(entry.searchText).toContain('자스민')
    expect(entry.searchText).toContain('두 번째 추출')
    expect(entry.searchText).not.toContain('example.com')
    expect(entry.searchText).not.toContain('decaf')
  })

  it('디카페인이면 검색어 "디카페인 decaf"를 포함한다', () => {
    expect(toIndexEntry(beanDef, beanEntity({ isDecaf: true })).searchText).toContain('디카페인 decaf')
  })

  it('날짜가 없으면 생성일, 점수가 없으면 null', () => {
    const entry = toIndexEntry(beanDef, beanEntity({ purchasedAt: null, totalScore: null }))
    expect(entry.date).toBe('2026-10-01')
    expect(entry.score).toBeNull()
  })

  it('카페 후기', () => {
    const entry = toIndexEntry(cafeVisitDef, cafeEntity())
    expect(entry).toMatchObject({
      key: 'cafe-1',
      kind: 'cafe',
      title: '프릳츠',
      subtitle: '게이샤 필터',
      shop: '프릳츠',
      date: '2026-10-05',
      score: 0.8,
      price: 9000,
      country: null,
      process: null, roastLevel: null, varieties: [], brewMethod: null, flavorTags: ['꽃', '시트러스'],
      roastedAt: null,
      isDecaf: false,
    })
    expect(entry.searchText).toContain('서울 마포구')
    expect(entry.searchText).toContain('창가')
    expect(entry.searchText).toContain('게이샤 필터')
    expect(entry.searchText).not.toContain('map.naver')
  })

  describe('카페 원두 여러 개', () => {
    const beans = [
      cafeBean({ name: '게이샤 필터', price: 9000, flavorTags: ['꽃', '시트러스'], isDecaf: false }),
      cafeBean({ name: '케냐 AA', country: '케냐', variety: ['SL28'], process: '워시드', brewMethod: '에스프레소', price: 6500, flavorTags: ['시트러스', '베리'], isDecaf: true, memo: '묵직한 단맛' }),
      cafeBean({ name: '라떼', price: null, flavorTags: [] }),
      cafeBean({ name: '콜드브루', price: 7000, flavorTags: ['초콜릿'] }),
    ]

    it('subtitle은 원두 이름을 · 로 잇고 3개를 넘으면 앞 2개 외 N', () => {
      expect(toIndexEntry(cafeVisitDef, cafeEntity({ beans: beans.slice(0, 3) })).subtitle).toBe('게이샤 필터 · 케냐 AA · 라떼')
      expect(toIndexEntry(cafeVisitDef, cafeEntity({ beans })).subtitle).toBe('게이샤 필터 · 케냐 AA 외 2')
    })

    it('태그는 합집합(고유), 디카페인은 하나라도, 가격은 최저가', () => {
      const entry = toIndexEntry(cafeVisitDef, cafeEntity({ beans }))
      expect(entry.flavorTags).toEqual(['꽃', '시트러스', '베리', '초콜릿'])
      expect(entry.isDecaf).toBe(true)
      expect(entry.price).toBe(6500)
      expect(entry.country).toBeNull()
      expect(entry.varieties).toEqual([])
    })

    it('검색어에 모든 원두의 필드가 들어가고 디카페인이면 "디카페인 decaf"', () => {
      const text = toIndexEntry(cafeVisitDef, cafeEntity({ beans })).searchText
      for (const word of ['케냐 aa', 'sl28', '에스프레소', '묵직한 단맛', '콜드브루', '디카페인 decaf']) expect(text).toContain(word)
    })

    it('가격이 모두 없으면 null', () => {
      expect(toIndexEntry(cafeVisitDef, cafeEntity({ beans: [cafeBean({ price: null })] })).price).toBeNull()
    })
  })
})

it('누락된 원두 필드는 null과 빈 태그 배열', () => {
  expect(toIndexEntry(beanDef, beanEntity({ process: null, roastLevel: null, variety: null, brewMethod: null, flavorTags: null }))).toMatchObject({ process: null, roastLevel: null, varieties: [], brewMethod: null, flavorTags: [] })
})

it('품종이 여러 개면 모두 인덱스와 검색 텍스트에 담는다', () => {
  const entry = toIndexEntry(beanDef, beanEntity({ variety: ['게이샤', '버번'] }))
  expect(entry.varieties).toEqual(['게이샤', '버번'])
  expect(entry.searchText).toContain('게이샤')
  expect(entry.searchText).toContain('버번')
})
