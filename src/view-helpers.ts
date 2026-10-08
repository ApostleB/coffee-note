import type { FieldDef } from './fields.js'

export function todayString(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 최적 시음 시작일이 오늘이거나 지났으면 true */
export function isReadyToDrink(bestFrom: unknown, today: string): boolean {
  return typeof bestFrom === 'string' && bestFrom <= today
}

export const formatDate = (date: string) => date.replaceAll('-', '.')

export const formatNumber = (value: number) => value.toLocaleString('ko-KR')

export const stars = (rating: number) => '★'.repeat(rating) + '☆'.repeat(Math.max(0, 5 - rating))

/** <script type="application/json"> 안에 넣어도 태그가 닫히지 않는 JSON */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/** 상세 화면에 보여줄 문자열. 비어 있으면 null */
export function displayValue(field: FieldDef, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  switch (field.type) {
    case 'date':
      return formatDate(String(value))
    case 'int':
      return `${formatNumber(Number(value))}${field.unit ?? ''}`
    case 'score':
      return `${value} / 10`
    case 'rating':
      return stars(Number(value))
    case 'bool':
      return value === true ? '예' : null
    case 'tags':
      return Array.isArray(value) && value.length > 0 ? value.join(', ') : null
    default:
      return String(value)
  }
}
