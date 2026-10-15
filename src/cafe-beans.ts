import { buildSchema, CAFE_BEAN_FIELDS, fieldErrors, toColumn, type Section } from './fields.js'

/** 카페 후기에 딸린 원두 한 행 (저장·조회 공용) */
export type BeanRow = {
  name: string
  country: string | null
  variety: string[]
  process: string | null
  brewMethod: string | null
  isDecaf: boolean
  flavorTags: string[]
  price: number | null
  rating: number | null
  memo: string | null
}

export const MAX_BEANS = 20
/** 폼 입력의 평탄한 키 접두사: bean_name, bean_brew_method, ... (urlencoded extended: false 라서 중첩 이름을 쓰지 않는다) */
const KEY_PREFIX = 'bean_'

export const CAFE_BEAN_SECTION: Section = { title: '원두', fields: CAFE_BEAN_FIELDS }
const rowSchema = buildSchema([CAFE_BEAN_SECTION])

export const beanInputKey = (field: string) => `${KEY_PREFIX}${toColumn(field)}`

const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === undefined ? [] : [value])
// 체크하지 않은 스위치는 전송되지 않으므로 행마다 'true'/'false' 를 보내는 폼을 전제한다
const isBlank = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && (value.trim() === '' || value === 'false'))

/** 평탄한 반복 키를 행 단위 원본 값({ name, brewMethod, ... })으로 묶는다. 모든 값이 빈 행은 버린다. */
export function parseBeanRows(body: unknown): Record<string, unknown>[] {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return []
  const source = body as Record<string, unknown>
  const columns = CAFE_BEAN_FIELDS.map((field) => [field.name, asList(source[beanInputKey(field.name)])] as const)
  const count = Math.max(0, ...columns.map(([, list]) => list.length))
  const rows: Record<string, unknown>[] = []
  for (let i = 0; i < count; i += 1) {
    const row: Record<string, unknown> = {}
    for (const [name, list] of columns) if (i < list.length) row[name] = list[i]
    if (!Object.values(row).every(isBlank)) rows.push(row)
  }
  return rows
}

export type ValidatedBeans = { ok: true; beans: BeanRow[] } | { ok: false; errors: Record<string, string> }

/** 원두 행을 검증한다. 필드 오류는 `beans.<인덱스>.<필드>`, 개수 오류는 `beans` 키. */
export function validateBeans(body: unknown): ValidatedBeans {
  const rows = parseBeanRows(body)
  if (rows.length === 0) return { ok: false, errors: { beans: '원두를 1개 이상 입력하세요' } }
  if (rows.length > MAX_BEANS) return { ok: false, errors: { beans: `원두는 ${MAX_BEANS}개까지 입력할 수 있습니다` } }
  const errors: Record<string, string> = {}
  const beans: BeanRow[] = []
  rows.forEach((row, index) => {
    const result = rowSchema.safeParse(row)
    if (result.success) beans.push(result.data as BeanRow)
    else for (const [field, message] of Object.entries(fieldErrors(result.error))) errors[`beans.${index}.${field}`] = message
  })
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, beans }
}

/** 카드·목록 부제목: 원두 이름을 ' · ' 로 잇고, 3개를 넘으면 '앞 2개 외 N' */
export function beanSubtitle(beans: { name: string }[]): string {
  const names = beans.map((bean) => bean.name)
  if (names.length <= 3) return names.join(' · ')
  return `${names.slice(0, 2).join(' · ')} 외 ${names.length - 2}`
}
