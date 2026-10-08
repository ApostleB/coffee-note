import { z } from 'zod'

export type FieldType = 'text' | 'textarea' | 'url' | 'date' | 'int' | 'score' | 'rating' | 'tags' | 'bool'

export type FieldDef = {
  /** 폼·엔티티 키 (camelCase). DB 컬럼은 toColumn(name) */
  name: string
  label: string
  type: FieldType
  required?: boolean
  /** text: 최대 글자 수 / int: 최댓값 */
  max?: number
  /** int: 최솟값 (기본 0) */
  min?: number
  /** 표시 단위 (예: '원', 'g') */
  unit?: string
  placeholder?: string
  /** 폼에서 한 줄 전체를 쓴다 */
  wide?: boolean
  /** url 필드의 상세 화면 링크 문구 */
  linkText?: string
}

export type Section = { title: string; fields: FieldDef[]; showTotal?: boolean }

export const BEAN_SECTIONS: Section[] = [
  {
    title: '기본 정보',
    fields: [
      { name: 'name', label: '원두명', type: 'text', required: true, placeholder: '에티오피아 구지 함벨라' },
      { name: 'shop', label: '판매처(로스터리)', type: 'text', required: true },
      { name: 'summary', label: '간략 메모', type: 'text', max: 300, wide: true, placeholder: '카드에 보이는 한 줄 메모' },
      { name: 'url', label: '상품 URL', type: 'url', wide: true, linkText: '상품 페이지' },
    ],
  },
  {
    title: '원두',
    fields: [
      { name: 'country', label: '산지 국가', type: 'text', max: 100, placeholder: '에티오피아' },
      { name: 'region', label: '산지 지역·농장', type: 'text' },
      { name: 'variety', label: '품종', type: 'text', placeholder: '헤어룸' },
      { name: 'process', label: '가공', type: 'text', max: 100, placeholder: '내추럴' },
      { name: 'roastLevel', label: '로스팅 포인트', type: 'text', max: 50, placeholder: '라이트' },
      { name: 'isDecaf', label: '디카페인', type: 'bool' },
    ],
  },
  {
    title: '구매·로스팅',
    fields: [
      { name: 'purchasedAt', label: '구매일', type: 'date' },
      { name: 'price', label: '가격', type: 'int', unit: '원' },
      { name: 'weightG', label: '용량', type: 'int', min: 1, max: 100_000, unit: 'g' },
      { name: 'brewMethod', label: '추출방식', type: 'text', max: 100, placeholder: '핸드드립' },
      { name: 'roastedAt', label: '로스팅일', type: 'date' },
      { name: 'bestFrom', label: '최적 시음 시작일', type: 'date' },
    ],
  },
  {
    title: '커핑',
    showTotal: true,
    fields: [
      { name: 'acidity', label: '산미', type: 'score' },
      { name: 'sweetness', label: '단맛', type: 'score' },
      { name: 'body', label: '바디', type: 'score' },
      { name: 'aftertaste', label: '여운', type: 'score' },
      { name: 'flavorTags', label: '향미 노트', type: 'tags', wide: true, placeholder: '베리, 자스민, 꿀' },
      { name: 'memo', label: '메모', type: 'textarea', wide: true },
    ],
  },
]

export const CAFE_SECTIONS: Section[] = [
  {
    title: '기본 정보',
    fields: [
      { name: 'menu', label: '메뉴·원두명', type: 'text', required: true, placeholder: '게이샤 필터' },
      { name: 'cafeName', label: '카페명', type: 'text', required: true },
      { name: 'visitedAt', label: '방문일', type: 'date' },
      { name: 'rating', label: '별점', type: 'rating' },
      { name: 'price', label: '가격', type: 'int', unit: '원' },
      { name: 'brewMethod', label: '추출방식', type: 'text', max: 100, placeholder: '필터, 에스프레소, 라떼' },
    ],
  },
  {
    title: '원두',
    fields: [
      { name: 'country', label: '산지 국가', type: 'text', max: 100 },
      { name: 'variety', label: '품종', type: 'text' },
      { name: 'process', label: '가공', type: 'text', max: 100 },
      { name: 'isDecaf', label: '디카페인', type: 'bool' },
      { name: 'flavorTags', label: '향미 노트', type: 'tags', wide: true, placeholder: '꽃, 시트러스' },
    ],
  },
  {
    title: '카페',
    fields: [
      { name: 'address', label: '주소', type: 'text', max: 300, wide: true },
      { name: 'mapUrl', label: '지도 URL', type: 'url', wide: true, linkText: '지도에서 보기' },
      { name: 'moodMemo', label: '분위기 메모', type: 'textarea', max: 1000, wide: true },
    ],
  },
  {
    title: '후기',
    fields: [{ name: 'memo', label: '메모', type: 'textarea', wide: true }],
  },
]

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const NOT_STRING = '문자열을 입력하세요'

/** YYYY-MM-DD가 달력에 실제 있는 날짜인지 (윤년 포함) */
function isRealDate(value: string): boolean {
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

export const toColumn = (name: string) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
export const allFields = (sections: Section[]) => sections.flatMap((s) => s.fields)
export const findField = (sections: Section[], name: string) => allFields(sections).find((f) => f.name === name)

function blankToNull(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }
  return value ?? null
}

function toNumberOrNull(value: unknown): unknown {
  if (typeof value === 'number') return value
  const v = blankToNull(value)
  return v === null ? null : Number(String(v).replaceAll(',', ''))
}

export function toTagList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.map(String) : typeof value === 'string' ? value.split(',') : []
  const tags = raw.map((t) => t.trim().replace(/^#/, '').trim()).filter(Boolean)
  return [...new Set(tags)]
}

function numberRange(field: FieldDef): [number, number] {
  if (field.type === 'score') return [1, 10]
  if (field.type === 'rating') return [1, 5]
  return [field.min ?? 0, field.max ?? 100_000_000]
}

function fieldSchema(field: FieldDef): z.ZodType {
  switch (field.type) {
    case 'text':
    case 'textarea': {
      const max = field.max ?? (field.type === 'textarea' ? 5000 : 200)
      const tooLong = `${max}자 이하로 입력하세요`
      if (field.required) {
        return z.preprocess(blankToNull, z.string({ error: `${field.label} 항목은 필수입니다` }).max(max, tooLong))
      }
      return z.preprocess(blankToNull, z.string({ error: NOT_STRING }).max(max, tooLong).nullable())
    }
    case 'url':
      return z.preprocess(
        blankToNull,
        z
          .url({ protocol: /^https?$/, error: 'http:// 또는 https:// 로 시작하는 주소를 입력하세요' })
          .max(2000, '주소가 너무 깁니다')
          .nullable(),
      )
    case 'date':
      return z.preprocess(
        blankToNull,
        z
          .string({ error: NOT_STRING })
          .regex(DATE_RE, '날짜는 YYYY-MM-DD 형식이어야 합니다')
          .refine(isRealDate, '존재하지 않는 날짜입니다')
          .nullable(),
      )
    case 'int':
    case 'score':
    case 'rating': {
      const [min, max] = numberRange(field)
      return z.preprocess(
        toNumberOrNull,
        z
          .number({ error: '숫자를 입력하세요' })
          .int('정수를 입력하세요')
          .min(min, `${min} 이상이어야 합니다`)
          .max(max, `${max} 이하여야 합니다`)
          .nullable(),
      )
    }
    case 'tags':
      return z.preprocess(
        toTagList,
        z
          .array(z.string({ error: NOT_STRING }).max(30, '태그는 30자 이하로 입력하세요'))
          .max(20, '태그는 20개까지 입력할 수 있습니다'),
      )
    case 'bool':
      return z.preprocess((v) => v === true || v === 'on' || v === 'true', z.boolean())
  }
}

/** 섹션 정의로 폼 입력 검증 스키마를 만든다. 정의에 없는 키는 버린다. */
export function buildSchema(sections: Section[]) {
  return z.object(Object.fromEntries(allFields(sections).map((f) => [f.name, fieldSchema(f)])), {
    error: '잘못된 입력입니다',
  })
}

/** 필드 이름 → 첫 번째 오류 메시지 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_')
    errors[key] ??= issue.message
  }
  return errors
}

/** 폼을 다시 그릴 값. 저장된 엔티티와 제출된 본문 모두 받는다. */
export function formValues(sections: Section[], source: Record<string, unknown> | null): Record<string, string | boolean> {
  const values: Record<string, string | boolean> = {}
  for (const field of allFields(sections)) {
    const v = source?.[field.name]
    if (field.type === 'bool') values[field.name] = v === true || v === 'on' || v === 'true'
    else if (Array.isArray(v)) values[field.name] = v.join(', ')
    else values[field.name] = v === null || v === undefined ? '' : String(v)
  }
  return values
}
