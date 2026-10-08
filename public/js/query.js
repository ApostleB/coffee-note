// @ts-check

/** @typedef {import('../../src/search-index.js').IndexEntry} IndexEntry */
/** @typedef {'all' | 'bean' | 'cafe'} Scope */
/** @typedef {'newest' | 'oldest' | 'score' | 'name' | 'priceAsc' | 'priceDesc' | 'roasted' | 'country'} SortKey */
/** @typedef {'country' | 'process' | 'roastLevel' | 'variety' | 'brewMethod' | 'flavorTag'} BeanFilterKey */
/** @typedef {Record<BeanFilterKey, string>} BeanFilters */
/** @typedef {Partial<Omit<Query, 'beanFilters'>> & { beanFilters?: Partial<BeanFilters> }} QueryPatch */
/** @typedef {{ beanFilters: BeanFilters, scope: Scope, text: string, sort: SortKey, shop: string, decafOnly: boolean }} Query */

/** @type {readonly BeanFilterKey[]} */
export const BEAN_FILTER_KEYS = Object.freeze(['country', 'process', 'roastLevel', 'variety', 'brewMethod', 'flavorTag'])

/** @type {Readonly<BeanFilters>} */
const EMPTY_BEAN_FILTERS = Object.freeze({ country: '', process: '', roastLevel: '', variety: '', brewMethod: '', flavorTag: '' })

/** @type {Readonly<Query>} */
export const DEFAULT_QUERY = Object.freeze({ scope: 'bean', text: '', sort: 'newest', shop: '', decafOnly: false, beanFilters: EMPTY_BEAN_FILTERS })

/**
 * 원두 범위에서만 고를 수 있는 정렬
 * @type {readonly SortKey[]}
 */
export const BEAN_ONLY_SORTS = ['roasted']

/**
 * 검색용 정규화. 서버 src/search-index.ts 의 normalize 와 같은 규칙이어야 한다.
 * @param {string} value
 * @returns {string}
 */
export function normalize(value) {
  return value.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
}

const collator = new Intl.Collator('ko', { numeric: true })

/**
 * @param {string} a
 * @param {string} b
 */
const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * 값이 없는 쪽을 항상 뒤로 보낸다
 * @template T
 * @param {T | null} a
 * @param {T | null} b
 * @param {(x: T, y: T) => number} compare
 * @returns {number}
 */
function nullsLast(a, b, compare) {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return compare(a, b)
}

/** @type {Record<SortKey, (a: IndexEntry, b: IndexEntry) => number>} */
const COMPARATORS = {
  newest: (a, b) => compareText(b.date, a.date) || compareText(b.createdAt, a.createdAt),
  oldest: (a, b) => compareText(a.date, b.date) || compareText(a.createdAt, b.createdAt),
  score: (a, b) => nullsLast(a.score, b.score, (x, y) => y - x),
  name: (a, b) => collator.compare(a.title, b.title),
  priceAsc: (a, b) => nullsLast(a.price, b.price, (x, y) => x - y),
  priceDesc: (a, b) => nullsLast(a.price, b.price, (x, y) => y - x),
  roasted: (a, b) => nullsLast(a.roastedAt, b.roastedAt, (x, y) => compareText(y, x)),
  country: (a, b) =>
    nullsLast(a.country, b.country, (x, y) => collator.compare(x, y)) || collator.compare(a.title, b.title),
}

/**
 * 범위·가게·디카페인·검색어로 거르고 정렬한 새 배열을 돌려준다
 * @param {readonly IndexEntry[]} entries
 * @param {Query} query
 * @returns {IndexEntry[]}
 */
export function applyQuery(entries, query) {
  const activeFilters = BEAN_FILTER_KEYS.filter((key) => query.beanFilters[key] !== '')
  const tokens = normalize(query.text).split(' ').filter(Boolean)
  const compare = COMPARATORS[query.sort] ?? COMPARATORS.newest
  return entries
    .filter(
      (entry) =>
        (query.scope === 'all' || entry.kind === query.scope) &&
        (!query.shop || entry.subtitle === query.shop) &&
        (!query.decafOnly || entry.isDecaf) &&
        (activeFilters.length === 0 || (entry.kind === 'bean' && activeFilters.every((key) =>
          key === 'flavorTag' ? entry.flavorTags.includes(query.beanFilters[key]) : entry[key] === query.beanFilters[key],
        ))) &&
        tokens.every((token) => entry.searchText.includes(token)),
    )
    .sort((a, b) => compare(a, b) || COMPARATORS.newest(a, b))
}

/**
 * 조건 일부를 바꾼다. 범위가 바뀌면 가게 필터를 비우고, 원두 전용 정렬은 최신순으로 되돌린다.
 * @param {Query} query
 * @param {QueryPatch} patch
 * @returns {Query}
 */
export function updateQuery(query, patch) {
  const next = { ...query, ...patch, beanFilters: { ...query.beanFilters, ...patch.beanFilters } }
  if (patch.scope !== undefined && patch.scope !== query.scope) {
    next.shop = ''
    next.beanFilters = { ...EMPTY_BEAN_FILTERS }
    if (next.scope !== 'bean' && BEAN_ONLY_SORTS.includes(next.sort)) next.sort = 'newest'
  }
  return next
}

/**
 * 범위 안의 가게(로스터리·카페) 이름, 가나다순
 * @param {readonly IndexEntry[]} entries
 * @param {Scope} scope
 * @returns {string[]}
 */
export function shopOptions(entries, scope) {
  const shops = new Set(entries.filter((e) => scope === 'all' || e.kind === scope).map((e) => e.subtitle))
  return [...shops].sort((a, b) => collator.compare(a, b))
}

/**
 * 원두 엔트리의 고유 필터 선택지, 한국어 정렬
 * @param {readonly IndexEntry[]} entries
 * @returns {Record<BeanFilterKey, string[]>}
 */
export function beanFilterOptions(entries) {
  const beans = entries.filter((entry) => entry.kind === 'bean')
  const compare = new Intl.Collator('ko').compare
  return /** @type {Record<BeanFilterKey, string[]>} */ (Object.fromEntries(BEAN_FILTER_KEYS.map((key) => {
    const values = beans.flatMap((entry) => key === 'flavorTag' ? entry.flavorTags : entry[key] === null ? [] : [entry[key]])
    return [key, [...new Set(values)].sort(compare)]
  })))
}
