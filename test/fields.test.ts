import { describe, expect, it } from 'vitest'
import { BEAN_SECTIONS, formValues, toColumn, toTagList } from '../src/fields.js'

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
