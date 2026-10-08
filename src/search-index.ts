import { allFields, type FieldType } from './fields.js'
import type { Entity, Kind, ResourceDef } from './resources.js'

/** 브라우저가 검색·정렬에 쓰는 카드 요약 */
export type IndexEntry = {
  key: string
  kind: Kind
  title: string
  subtitle: string
  /** 정렬용 날짜 (원두: 구매일, 카페: 방문일, 없으면 생성일) */
  date: string
  createdAt: string
  /** 0~1 비율 (원두 총점/40, 카페 별점/5) */
  score: number | null
  price: number | null
  country: string | null
  process: string | null
  roastLevel: string | null
  varieties: string[]
  brewMethod: string | null
  flavorTags: string[]
  roastedAt: string | null
  isDecaf: boolean
  searchText: string
}

const SEARCHABLE: FieldType[] = ['text', 'textarea', 'tags']
const DECAF_WORDS = '디카페인 decaf'

/** 검색용 정규화. 브라우저 public/js/query.js 의 normalize 와 같은 규칙이어야 한다. */
export function normalize(value: string): string {
  return value.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
}

export const entryKey = (def: ResourceDef, id: number) => `${def.kind}-${id}`

const textOrNull = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null)
const stringList = (value: unknown) => (Array.isArray(value) ? (value as string[]) : [])
const numberOrNull = (value: unknown) => (typeof value === 'number' ? value : null)

export function toIndexEntry(def: ResourceDef, entity: Entity): IndexEntry {
  const score = numberOrNull(entity[def.card.score])
  const parts: unknown[] = allFields(def.sections)
    .filter((field) => SEARCHABLE.includes(field.type))
    .flatMap((field) => {
      const value = entity[field.name]
      return Array.isArray(value) ? value : [value]
    })
  if (entity.isDecaf === true) parts.push(DECAF_WORDS)
  return {
    key: entryKey(def, entity.id),
    kind: def.kind,
    title: String(entity[def.card.title]),
    subtitle: String(entity[def.card.subtitle]),
    date: textOrNull(entity[def.card.date]) ?? entity.createdAt.toISOString().slice(0, 10),
    createdAt: entity.createdAt.toISOString(),
    score: score === null ? null : score / def.card.scoreMax,
    price: numberOrNull(entity.price),
    country: textOrNull(entity.country),
    process: textOrNull(entity.process),
    roastLevel: def.kind === 'bean' ? textOrNull(entity.roastLevel) : null,
    varieties: stringList(entity.variety),
    brewMethod: textOrNull(entity.brewMethod),
    flavorTags: stringList(entity.flavorTags),
    roastedAt: textOrNull(entity.roastedAt),
    isDecaf: entity.isDecaf === true,
    searchText: normalize(parts.filter((p): p is string => typeof p === 'string' && p !== '').join(' ')),
  }
}
