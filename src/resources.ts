import { allFields, BEAN_SECTIONS, buildSchema, CAFE_SECTIONS, fieldErrors, toColumn, type Section } from './fields.js'

export type Kind = 'bean' | 'cafe'

export type PhotoRow = {
  id: number
  bean_id: number | null
  cafe_visit_id: number | null
  file_name: string
  thumb_name: string
  sort_order: number
  is_thumbnail: boolean
  created_at: Date
}

export type PhotoDto = { id: number; url: string; thumbUrl: string; isThumbnail: boolean; sortOrder: number }

export type Entity = Record<string, unknown> & {
  id: number
  createdAt: Date
  updatedAt: Date
  photos: PhotoDto[]
  thumbnailUrl: string | null
}

export type ResourceDef = {
  kind: Kind
  /** '원두 노트' | '카페 후기' */
  label: string
  /** 카드 배지용 짧은 이름 */
  shortLabel: string
  table: 'beans' | 'cafe_visits'
  /** URL 경로 조각 */
  path: 'beans' | 'cafe-visits'
  photoFk: 'bean_id' | 'cafe_visit_id'
  sections: Section[]
  schema: ReturnType<typeof buildSchema>
  /** 카드·검색 인덱스에 쓰는 필드 이름 */
  card: { title: string; subtitle: string; date: string; score: string; scoreMax: number; summary?: string; meta: string[] }
  /** 폼에는 없고 서버가 계산해 저장하는 필드 */
  derived: string[]
  derive: (data: Record<string, unknown>) => Record<string, unknown>
}

export function computeTotalScore(data: Record<string, unknown>): number | null {
  const scores = ['acidity', 'sweetness', 'body', 'aftertaste'].map((key) => data[key])
  return scores.every((s): s is number => typeof s === 'number') ? scores.reduce((sum, s) => sum + s, 0) : null
}

export const beanDef: ResourceDef = {
  kind: 'bean',
  label: '원두 노트',
  shortLabel: '원두',
  table: 'beans',
  path: 'beans',
  photoFk: 'bean_id',
  sections: BEAN_SECTIONS,
  schema: buildSchema(BEAN_SECTIONS),
  card: {
    title: 'name',
    subtitle: 'shop',
    date: 'purchasedAt',
    score: 'totalScore',
    scoreMax: 40,
    summary: 'summary',
    meta: ['country', 'process', 'roastLevel'],
  },
  derived: ['totalScore'],
  derive: (data) => ({ totalScore: computeTotalScore(data) }),
}

export const cafeVisitDef: ResourceDef = {
  kind: 'cafe',
  label: '카페 후기',
  shortLabel: '카페',
  table: 'cafe_visits',
  path: 'cafe-visits',
  photoFk: 'cafe_visit_id',
  sections: CAFE_SECTIONS,
  schema: buildSchema(CAFE_SECTIONS),
  card: { title: 'menu', subtitle: 'cafeName', date: 'visitedAt', score: 'rating', scoreMax: 5, meta: ['visitedAt', 'brewMethod'] },
  derived: [],
  derive: () => ({}),
}

export const DEFS: Record<Kind, ResourceDef> = { bean: beanDef, cafe: cafeVisitDef }

export function columnsOf(def: ResourceDef): [key: string, column: string][] {
  return [...allFields(def.sections).map((f) => f.name), ...def.derived].map((key) => [key, toColumn(key)])
}

export type Prepared = { ok: true; data: Record<string, unknown> } | { ok: false; errors: Record<string, string> }

/** 폼 본문을 검증·변환하고 계산 필드를 붙인다 */
export function prepare(def: ResourceDef, body: unknown): Prepared {
  const result = def.schema.safeParse(body ?? {})
  if (!result.success) return { ok: false, errors: fieldErrors(result.error) }
  return { ok: true, data: { ...result.data, ...def.derive(result.data) } }
}

export function toPhotoDto(row: PhotoRow): PhotoDto {
  return {
    id: row.id,
    url: `/uploads/${row.file_name}`,
    thumbUrl: `/uploads/${row.thumb_name}`,
    isThumbnail: row.is_thumbnail,
    sortOrder: row.sort_order,
  }
}

export function toEntity(def: ResourceDef, row: Record<string, unknown>, photos: PhotoRow[]): Entity {
  const fields: Record<string, unknown> = {}
  for (const [key, column] of columnsOf(def)) fields[key] = row[column] ?? null
  const photoDtos = photos.map(toPhotoDto)
  const thumbnail = photoDtos.find((p) => p.isThumbnail) ?? photoDtos[0]
  return {
    ...fields,
    id: row.id as number,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
    photos: photoDtos,
    thumbnailUrl: thumbnail?.thumbUrl ?? null,
  }
}
