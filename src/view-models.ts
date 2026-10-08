import { allFields, findField, type FieldType } from './fields.js'
import { beanDef, cafeVisitDef, type Entity, type Kind, type PhotoDto, type ResourceDef } from './resources.js'
import { entryKey, toIndexEntry } from './search-index.js'
import { displayValue, isReadyToDrink, jsonForScript, todayString } from './view-helpers.js'

/** 홈 화면 첫 탭 */
export const DEFAULT_SCOPE: Kind = 'bean'

export type CardScore = { type: 'total'; value: number; max: number } | { type: 'rating'; value: number }

export type CardModel = {
  key: string
  kind: Kind
  kindLabel: string
  href: string
  title: string
  subtitle: string
  meta: string
  summary: string | null
  tags: string[]
  thumbnailUrl: string | null
  isDecaf: boolean
  ready: boolean
  score: CardScore | null
  hidden: boolean
}

export type HomeModel = {
  title: string
  cards: CardModel[]
  indexJson: string
  counts: Record<Kind, number>
  shops: string[]
  beanOptions: Record<'country' | 'process' | 'roastLevel' | 'variety' | 'brewMethod' | 'flavorTag', string[]>
}

export type DetailModel = {
  title: string
  heading: string
  key: string
  kindLabel: string
  subtitle: string
  tags: string[]
  rows: { label: string; value: string }[]
  memos: { label: string; text: string }[]
  links: { label: string; href: string }[]
  photos: PhotoDto[]
  editHref: string
}

const collator = new Intl.Collator('ko')
const listOf = (value: unknown) => (Array.isArray(value) ? (value as string[]) : [])
const tagsOf = (entity: Entity) => listOf(entity.flavorTags)

export function toCardModel(def: ResourceDef, entity: Entity, today: string): CardModel {
  const scoreValue = entity[def.card.score]
  const meta = def.card.meta
    .map((name) => {
      const field = findField(def.sections, name)
      return field ? displayValue(field, entity[name]) : null
    })
    .filter((value): value is string => value !== null)
  const summary = def.card.summary ? entity[def.card.summary] : null
  let score: CardScore | null = null
  if (typeof scoreValue === 'number') {
    score = def.kind === 'bean' ? { type: 'total', value: scoreValue, max: def.card.scoreMax } : { type: 'rating', value: scoreValue }
  }
  return {
    key: entryKey(def, entity.id),
    kind: def.kind,
    kindLabel: def.shortLabel,
    href: `/${def.path}/${entity.id}`,
    title: String(entity[def.card.title]),
    subtitle: String(entity[def.card.subtitle]),
    meta: meta.join(' · '),
    summary: typeof summary === 'string' && summary !== '' ? summary : null,
    tags: tagsOf(entity).slice(0, 4),
    thumbnailUrl: entity.thumbnailUrl,
    isDecaf: entity.isDecaf === true,
    ready: def.kind === 'bean' && isReadyToDrink(entity.bestFrom, today),
    score,
    hidden: def.kind !== DEFAULT_SCOPE,
  }
}

export function buildHomeModel(beans: Entity[], cafes: Entity[], today: string = todayString()): HomeModel {
  const pairs: [ResourceDef, Entity][] = [
    ...beans.map((entity): [ResourceDef, Entity] => [beanDef, entity]),
    ...cafes.map((entity): [ResourceDef, Entity] => [cafeVisitDef, entity]),
  ]
  return {
    // public/js/query.js의 beanFilterOptions와 같은 원두 한정·고유값 정렬 규칙.
    beanOptions: {
      ...Object.fromEntries(['country', 'process', 'roastLevel', 'brewMethod'].map((key) => [
        key,
        [...new Set(beans.map((bean) => bean[key]).filter((value): value is string => typeof value === 'string' && value !== ''))].sort(collator.compare),
      ])) as Record<'country' | 'process' | 'roastLevel' | 'brewMethod', string[]>,
      variety: [...new Set(beans.flatMap((bean) => listOf(bean.variety)))].sort(collator.compare),
      flavorTag: [...new Set(beans.flatMap(tagsOf))].sort(collator.compare),
    },
    title: '',
    cards: pairs.map(([def, entity]) => toCardModel(def, entity, today)),
    indexJson: jsonForScript(pairs.map(([def, entity]) => toIndexEntry(def, entity))),
    counts: { bean: beans.length, cafe: cafes.length },
    shops: [...new Set(beans.map((bean) => String(bean.shop)))].sort((a, b) => collator.compare(a, b)),
  }
}

/** 상세 표의 행에서 빼는 타입 (메모·링크는 따로 보여준다) */
const NOT_IN_ROWS: FieldType[] = ['textarea', 'url']
/** 배지로 따로 보여주므로 상세 표의 행에서 빼는 필드 */
const BADGE_FIELD = 'flavorTags'

export function buildDetailModel(def: ResourceDef, entity: Entity): DetailModel {
  const fields = allFields(def.sections)
  const skip = new Set([def.card.title, def.card.subtitle, def.card.summary])
  const rows = fields
    .filter((field) => !skip.has(field.name) && field.name !== BADGE_FIELD && !NOT_IN_ROWS.includes(field.type))
    .flatMap((field) => {
      const value = displayValue(field, entity[field.name])
      return value === null ? [] : [{ label: field.label, value }]
    })
  if (def.kind === 'bean' && typeof entity.totalScore === 'number') {
    rows.push({ label: '커핑 총점', value: `${entity.totalScore} / ${def.card.scoreMax}` })
  }
  const memos = fields
    .filter((field) => field.name === def.card.summary || field.type === 'textarea')
    .flatMap((field) => {
      const text = entity[field.name]
      return typeof text === 'string' && text !== '' ? [{ label: field.label, text }] : []
    })
  const links = fields
    .filter((field) => field.type === 'url')
    .flatMap((field) => {
      const href = entity[field.name]
      return typeof href === 'string' && href !== '' ? [{ label: field.linkText ?? field.label, href }] : []
    })
  const heading = String(entity[def.card.title])
  return {
    title: heading,
    heading,
    key: entryKey(def, entity.id),
    kindLabel: def.label,
    subtitle: String(entity[def.card.subtitle]),
    tags: tagsOf(entity),
    rows,
    memos,
    links,
    photos: entity.photos,
    editHref: `/admin/${def.path}/${entity.id}/edit`,
  }
}
