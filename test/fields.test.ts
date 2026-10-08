import { describe, expect, it } from 'vitest'
import { BEAN_SECTIONS, CAFE_SECTIONS, buildSchema, findField, fieldErrors, formValues, toColumn, toTagList } from '../src/fields.js'

describe('toColumn', () => {
  it.each([
    ['name', 'name'],
    ['roastLevel', 'roast_level'],
    ['weightG', 'weight_g'],
    ['isDecaf', 'is_decaf'],
    ['cafeName', 'cafe_name'],
  ])('%s → %s', (name, column) => {
    expect(toColumn(name)).toBe(column)
  })
})

describe('toTagList', () => {
  it('쉼표로 나누고 공백·# 제거, 중복 제거', () => {
    expect(toTagList(' 베리, #자스민,, 베리 ,꿀 ')).toEqual(['베리', '자스민', '꿀'])
  })

  it('배열도 받는다', () => {
    expect(toTagList(['꽃', ' 꽃 ', '시트러스'])).toEqual(['꽃', '시트러스'])
  })

  it('값이 없으면 빈 배열', () => {
    expect(toTagList(undefined)).toEqual([])
  })
})

describe('품종 필드', () => {
  it('원두·카페 모두 쉼표 구분 tags 타입', () => {
    for (const sections of [BEAN_SECTIONS, CAFE_SECTIONS]) {
      expect(findField(sections, 'variety')).toMatchObject({ type: 'tags', label: '품종' })
    }
    expect(findField(BEAN_SECTIONS, 'variety')?.placeholder).toBe('게이샤, 버번')
  })

  it('폼 값은 쉼표로 이은 문자열', () => {
    expect(formValues(BEAN_SECTIONS, { variety: ['게이샤', '버번'] })).toMatchObject({ variety: '게이샤, 버번' })
  })
})

describe('formValues', () => {
  it('엔티티 값을 폼 문자열로 바꾼다', () => {
    const values = formValues(BEAN_SECTIONS, {
      name: '구지',
      price: 18000,
      flavorTags: ['베리', '자스민'],
      isDecaf: true,
      memo: null,
    })
    expect(values).toMatchObject({ name: '구지', price: '18000', flavorTags: '베리, 자스민', isDecaf: true, memo: '' })
  })

  it('제출된 본문(체크박스 on)도 그대로 다시 채운다', () => {
    const values = formValues(BEAN_SECTIONS, { name: '구지', isDecaf: 'on', flavorTags: '베리, 꿀' })
    expect(values).toMatchObject({ name: '구지', isDecaf: true, flavorTags: '베리, 꿀', shop: '' })
  })

  it('source가 null이면 빈 폼', () => {
    const values = formValues(BEAN_SECTIONS, null)
    expect(values.name).toBe('')
    expect(values.isDecaf).toBe(false)
  })
})

describe('날짜 검증', () => {
  const schema = buildSchema(BEAN_SECTIONS)
  const base = { name: 'a', shop: 'b' }
  const errorOf = (purchasedAt: unknown) => {
    const result = schema.safeParse({ ...base, purchasedAt })
    return result.success ? null : fieldErrors(result.error).purchasedAt
  }

  it('윤년 2/29는 허용', () => expect(errorOf('2028-02-29')).toBeNull())
  it('평년 2/29는 거부', () => expect(errorOf('2026-02-29')).toBe('존재하지 않는 날짜입니다'))
  it('2/30은 거부', () => expect(errorOf('2026-02-30')).toBe('존재하지 않는 날짜입니다'))
  it('13월은 거부', () => expect(errorOf('2026-13-01')).toBe('존재하지 않는 날짜입니다'))
  it('4월 31일은 거부', () => expect(errorOf('2026-04-31')).toBe('존재하지 않는 날짜입니다'))
  it('12월 31일은 허용', () => expect(errorOf('2026-12-31')).toBeNull())
})
