import { describe, expect, it } from 'vitest'
import { beanDef, cafeVisitDef } from '../src/resources.js'
import { normalize, toIndexEntry } from '../src/search-index.js'
import { beanEntity, cafeEntity } from './fixtures.js'

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
      date: '2026-10-01',
      createdAt: '2026-10-01T10:00:00.000Z',
      score: 0.75,
      price: 18000,
      country: '에티오피아',
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
      title: '게이샤 필터',
      subtitle: '프릳츠',
      date: '2026-10-05',
      score: 0.8,
      price: 9000,
      country: '파나마',
      roastedAt: null,
    })
    expect(entry.searchText).toContain('서울 마포구')
    expect(entry.searchText).toContain('창가')
    expect(entry.searchText).not.toContain('map.naver')
  })
})
