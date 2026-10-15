import { beanSubtitle, type BeanRow } from './cafe-beans.js'
import { allFields, CAFE_BEAN_FIELDS, type FieldType } from './fields.js'
import type { Entity, Kind, ResourceDef } from './resources.js'

/** 브라우저가 검색·정렬에 쓰는 카드 요약 */
export type IndexEntry = {
  key: string
  kind: Kind
  title: string
  subtitle: string
  /** 가게 필터용 (원두: 판매처, 카페: 카페명) */
  shop: string
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

const beansOf = (entity: Entity): BeanRow[] => (Array.isArray(entity.beans) ? (entity.beans as BeanRow[]) : [])

/** 카드·목록 부제목. 원두를 딸린 종류는 원두 이름에서 파생한다 */
export function subtitleOf(def: ResourceDef, entity: Entity): string {
  return def.hasBeans ? beanSubtitle(beansOf(entity)) : String(entity[def.card.subtitle])
}

/** 향미 태그. 원두를 딸린 종류는 원두들의 합집합(고유, 등장 순) */
export function flavorTagsOf(def: ResourceDef, entity: Entity): string[] {
  return def.hasBeans ? [...new Set(beansOf(entity).flatMap((bean) => bean.flavorTags))] : stringList(entity.flavorTags)
}

/** 디카페인 여부. 원두를 딸린 종류는 하나라도 디카페인이면 true */
export const isDecafOf = (def: ResourceDef, entity: Entity): boolean =>
  def.hasBeans ? beansOf(entity).some((bean) => bean.isDecaf) : entity.isDecaf === true

const searchableValues = (fields: { name: string; type: FieldType }[], source: Record<string, unknown>): unknown[] =>
  fields
    .filter((field) => SEARCHABLE.includes(field.type))
    .flatMap((field) => {
      const value = source[field.name]
      return Array.isArray(value) ? value : [value]
    })

export function toIndexEntry(def: ResourceDef, entity: Entity): IndexEntry {
  const score = numberOrNull(entity[def.card.score])
  const beans = def.hasBeans ? beansOf(entity) : []
  const parts: unknown[] = searchableValues(allFields(def.sections), entity)
  for (const bean of beans) parts.push(...searchableValues(CAFE_BEAN_FIELDS, bean))
  const isDecaf = isDecafOf(def, entity)
  if (isDecaf) parts.push(DECAF_WORDS)
  // 원두 필터는 원두 노트에만 쓰므로 카페는 대표값을 두지 않는다. 가격 정렬은 원두 최저가
  const prices = beans.map((bean) => bean.price).filter((price): price is number => typeof price === 'number')
  return {
    key: entryKey(def, entity.id),
    kind: def.kind,
    title: String(entity[def.card.title]),
    subtitle: subtitleOf(def, entity),
    shop: String(entity[def.kind === 'bean' ? 'shop' : 'cafeName']),
    date: textOrNull(entity[def.card.date]) ?? entity.createdAt.toISOString().slice(0, 10),
    createdAt: entity.createdAt.toISOString(),
    score: score === null ? null : score / def.card.scoreMax,
    price: def.hasBeans ? (prices.length > 0 ? Math.min(...prices) : null) : numberOrNull(entity.price),
    country: textOrNull(entity.country),
    process: textOrNull(entity.process),
    roastLevel: def.kind === 'bean' ? textOrNull(entity.roastLevel) : null,
    varieties: stringList(entity.variety),
    brewMethod: textOrNull(entity.brewMethod),
    flavorTags: flavorTagsOf(def, entity),
    roastedAt: textOrNull(entity.roastedAt),
    isDecaf,
    searchText: normalize(parts.filter((p): p is string => typeof p === 'string' && p !== '').join(' ')),
  }
}
