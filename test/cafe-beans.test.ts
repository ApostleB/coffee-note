import { describe, expect, it } from 'vitest'
import { beanSubtitle, MAX_BEANS, parseBeanRows, validateBeans } from '../src/cafe-beans.js'
import { CAFE_BEAN_FIELDS } from '../src/fields.js'

describe('parseBeanRows', () => {
  it('원두 행이 1개면 문자열 값도 한 행으로 묶는다', () => {
    expect(parseBeanRows({ bean_name: '게이샤', bean_country: '파나마', bean_is_decaf: 'false' })).toEqual([
      { name: '게이샤', country: '파나마', isDecaf: 'false' },
    ])
  })

  it('같은 키의 배열을 인덱스별로 묶는다', () => {
    const rows = parseBeanRows({
      bean_name: ['게이샤', '케냐 AA'],
      bean_brew_method: ['필터', '에스프레소'],
      bean_flavor_tags: ['꽃, 시트러스', ''],
      bean_price: ['9000', '6500'],
    })
    expect(rows).toEqual([
      { name: '게이샤', brewMethod: '필터', flavorTags: '꽃, 시트러스', price: '9000' },
      { name: '케냐 AA', brewMethod: '에스프레소', flavorTags: '', price: '6500' },
    ])
  })

  it('모든 값이 빈 행은 무시하고, 공백만 있어도 빈 행이다', () => {
    const rows = parseBeanRows({
      bean_name: ['게이샤', '', '  ', '케냐'],
      bean_country: ['', '', ' ', ''],
      bean_is_decaf: ['false', 'false', 'false', 'true'],
    })
    expect(rows.map((r) => r.name)).toEqual(['게이샤', '케냐'])
  })

  it('이름만 비고 다른 값이 있는 행은 남겨 검증이 오류를 낸다', () => {
    expect(parseBeanRows({ bean_name: ['', 'a'], bean_country: ['파나마', ''] })).toEqual([
      { name: '', country: '파나마' },
      { name: 'a', country: '' },
    ])
  })

  it('정의에 없는 키·본문이 아닌 값은 무시한다', () => {
    expect(parseBeanRows({ bean_hacked: 'x', name: 'y' })).toEqual([])
    expect(parseBeanRows(undefined)).toEqual([])
    expect(parseBeanRows('oops')).toEqual([])
  })

  it('배열 길이가 달라도 짧은 쪽은 빈 값으로 본다', () => {
    expect(parseBeanRows({ bean_name: ['a', 'b'], bean_country: ['파나마'] })).toEqual([
      { name: 'a', country: '파나마' },
      { name: 'b' },
    ])
  })
})

describe('validateBeans', () => {
  it('행을 CAFE_BEAN_FIELDS 규칙으로 변환한다', () => {
    const result = validateBeans({
      bean_name: ['게이샤 필터', '케냐'],
      bean_variety: ['게이샤, 버번, 게이샤', ''],
      bean_is_decaf: ['false', 'true'],
      bean_price: ['9,000', ''],
      bean_rating: ['5', ''],
      bean_flavor_tags: ['꽃, #시트러스', ''],
    })
    expect(result).toEqual({
      ok: true,
      beans: [
        { name: '게이샤 필터', country: null, variety: ['게이샤', '버번'], process: null, brewMethod: null, isDecaf: false, flavorTags: ['꽃', '시트러스'], price: 9000, rating: 5, memo: null },
        { name: '케냐', country: null, variety: [], process: null, brewMethod: null, isDecaf: true, flavorTags: [], price: null, rating: null, memo: null },
      ],
    })
  })

  it('원두가 하나도 없으면 beans 오류', () => {
    expect(validateBeans({})).toEqual({ ok: false, errors: { beans: '원두를 1개 이상 입력하세요' } })
    expect(validateBeans({ bean_name: ['', ' '] })).toMatchObject({ ok: false, errors: { beans: '원두를 1개 이상 입력하세요' } })
  })

  it(`최대 ${MAX_BEANS}개`, () => {
    const names = Array.from({ length: MAX_BEANS }, (_, i) => `원두${i}`)
    expect(validateBeans({ bean_name: names })).toMatchObject({ ok: true })
    expect(validateBeans({ bean_name: [...names, '하나 더'] })).toEqual({
      ok: false,
      errors: { beans: `원두는 ${MAX_BEANS}개까지 입력할 수 있습니다` },
    })
  })

  it('필드 오류는 beans.<인덱스>.<필드> 키', () => {
    const result = validateBeans({
      bean_name: ['ok', '', 'x'],
      bean_country: ['', '파나마', ''],
      bean_rating: ['', '', '6'],
      bean_price: ['abc', '', ''],
    })
    expect(result).toEqual({
      ok: false,
      errors: {
        'beans.0.price': '숫자를 입력하세요',
        'beans.1.name': '마신 원두·메뉴 항목은 필수입니다',
        'beans.2.rating': '5 이하여야 합니다',
      },
    })
  })

  it('정의 필드 이름이 CAFE_BEAN_FIELDS와 같다', () => {
    expect(CAFE_BEAN_FIELDS.map((f) => f.name)).toEqual([
      'name', 'country', 'variety', 'process', 'brewMethod', 'isDecaf', 'flavorTags', 'price', 'rating', 'memo',
    ])
    expect(CAFE_BEAN_FIELDS[0]).toMatchObject({ required: true, label: '마신 원두·메뉴' })
  })
})

describe('beanSubtitle', () => {
  const beans = (...names: string[]) => names.map((name) => ({ name }))
  it('이름을 · 로 잇고 3개를 넘으면 앞 2개 외 N', () => {
    expect(beanSubtitle(beans('a'))).toBe('a')
    expect(beanSubtitle(beans('a', 'b', 'c'))).toBe('a · b · c')
    expect(beanSubtitle(beans('a', 'b', 'c', 'd', 'e'))).toBe('a · b 외 3')
    expect(beanSubtitle([])).toBe('')
  })
})
