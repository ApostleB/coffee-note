import { describe, expect, it } from 'vitest'
import { BEAN_SECTIONS, CAFE_SECTIONS, findField } from '../src/fields.js'
import {
  displayValue,
  formatDate,
  formatNumber,
  isReadyToDrink,
  jsonForScript,
  stars,
  todayString,
} from '../src/view-helpers.js'

const beanField = (name: string) => findField(BEAN_SECTIONS, name)!
const cafeField = (name: string) => findField(CAFE_SECTIONS, name)!

describe('날짜·숫자', () => {
  it('todayString은 로컬 날짜', () => {
    expect(todayString(new Date(2026, 9, 8, 23, 30))).toBe('2026-10-08')
  })

  it('isReadyToDrink', () => {
    expect(isReadyToDrink('2026-10-05', '2026-10-08')).toBe(true)
    expect(isReadyToDrink('2026-10-08', '2026-10-08')).toBe(true)
    expect(isReadyToDrink('2026-10-09', '2026-10-08')).toBe(false)
    expect(isReadyToDrink(null, '2026-10-08')).toBe(false)
  })

  it('formatDate, formatNumber, stars', () => {
    expect(formatDate('2026-10-01')).toBe('2026.10.01')
    expect(formatNumber(18000)).toBe('18,000')
    expect(stars(4)).toBe('★★★★☆')
  })
})

describe('jsonForScript', () => {
  it('<script>를 닫지 못하게 < 를 이스케이프한다', () => {
    const json = jsonForScript({ name: '</script><b>' })
    expect(json).not.toContain('</script>')
    expect(json).toContain('\\u003c/script>')
    expect(JSON.parse(json)).toEqual({ name: '</script><b>' })
  })
})

describe('displayValue', () => {
  it.each([
    ['price', 18000, '18,000원'],
    ['weightG', 200, '200g'],
    ['acidity', 8, '8 / 10'],
    ['purchasedAt', '2026-10-01', '2026.10.01'],
    ['isDecaf', true, '예'],
    ['isDecaf', false, null],
    ['flavorTags', ['베리', '꿀'], '베리, 꿀'],
    ['country', '에티오피아', '에티오피아'],
    ['country', '', null],
    ['country', null, null],
  ])('원두 %s = %j → %j', (name, value, expected) => {
    expect(displayValue(beanField(name), value)).toBe(expected)
  })

  it('별점은 별 문자로', () => {
    expect(displayValue(cafeField('rating'), 4)).toBe('★★★★☆')
  })
})
