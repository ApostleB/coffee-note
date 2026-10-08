// @ts-check
import { initCarousels } from './carousel.js'
import { applyQuery, BEAN_FILTER_KEYS, DEFAULT_QUERY, shopOptions, updateQuery } from './query.js'

/** @typedef {import('./query.js').Query} Query */
/** @typedef {import('./query.js').IndexEntry} IndexEntry */

const SPINNER =
  '<div class="p-5 text-center"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">불러오는 중</span></div></div>'
const LOAD_ERROR = '<p class="p-4 text-center text-body-secondary mb-0">상세 정보를 불러오지 못했습니다.</p>'

/**
 * 홈 화면: 서버가 그려 둔 카드를 검색·필터·정렬 결과에 맞춰 숨기고 재배치한다.
 * @param {Document} doc
 * @param {{ bootstrap?: any, fetch?: typeof fetch }} [deps]
 */
export function initHome(doc, deps = {}) {
  const bootstrap = deps.bootstrap ?? /** @type {any} */ (window).bootstrap
  const fetchFn = deps.fetch ?? window.fetch.bind(window)

  /** @type {IndexEntry[]} */
  const entries = JSON.parse(doc.getElementById('coffee-index')?.textContent ?? '[]')
  const grid = /** @type {HTMLElement} */ (doc.getElementById('card-grid'))
  const form = /** @type {HTMLFormElement} */ (doc.getElementById('toolbar'))
  const countEl = /** @type {HTMLElement} */ (doc.getElementById('result-count'))
  const emptyEl = /** @type {HTMLElement} */ (doc.getElementById('empty-state'))
  const textInput = /** @type {HTMLInputElement} */ (form.elements.namedItem('text'))
  const sortSelect = /** @type {HTMLSelectElement} */ (form.elements.namedItem('sort'))
  const shopSelect = /** @type {HTMLSelectElement} */ (form.elements.namedItem('shop'))
  const decafInput = /** @type {HTMLInputElement} */ (form.elements.namedItem('decafOnly'))
  const beanFiltersEl = /** @type {HTMLElement} */ (doc.getElementById('bean-filters'))
  const beanToggle = /** @type {HTMLButtonElement} */ (doc.getElementById('bean-filter-toggle'))
  const beanCount = /** @type {HTMLElement} */ (doc.getElementById('bean-filter-count'))
  const beanReset = /** @type {HTMLButtonElement} */ (doc.getElementById('bean-filter-reset'))
  const beanSelects = BEAN_FILTER_KEYS.map((key) => ({ key, select: /** @type {HTMLSelectElement} */ (form.elements.namedItem(`bf-${key}`)) }))
  const hasBeanOptions = beanSelects.some(({ select }) => select.options.length > 1)
  beanToggle.hidden = !hasBeanOptions
  const tabs = /** @type {HTMLElement[]} */ ([...doc.querySelectorAll('[data-scope-tab]')])

  /** @type {Map<string, HTMLElement>} */
  const cards = new Map()
  for (const el of grid.querySelectorAll('[data-key]')) {
    const card = /** @type {HTMLElement} */ (el)
    cards.set(card.dataset.key ?? '', card)
  }

  // 활성 탭과 브라우저가 복원한 나머지 컨트롤 값으로 시작한다
  /** @type {Query} */
  let query = {
    scope: doc.querySelector('[data-scope-tab].active')?.getAttribute('data-scope-tab') === 'cafe' ? 'cafe' : 'bean',
    text: textInput.value,
    sort: /** @type {Query['sort']} */ (sortSelect.value),
    shop: shopSelect.value,
    decafOnly: decafInput.checked,
    beanFilters: { ...DEFAULT_QUERY.beanFilters },
  }

  for (const { key, select } of beanSelects) query.beanFilters[key] = select.value
  if (query.scope !== 'bean') query.beanFilters = { ...DEFAULT_QUERY.beanFilters }

  /**
   * @param {string} value
   * @param {string} label
   */
  function option(value, label) {
    const el = doc.createElement('option')
    el.value = value
    el.textContent = label
    return el
  }

  /** 범위가 바뀌었을 때 탭·정렬·가게 컨트롤을 맞춘다 */
  function syncControls() {
    for (const tab of tabs) {
      const active = tab.dataset.scopeTab === query.scope
      tab.classList.toggle('active', active)
      if (active) tab.setAttribute('aria-current', 'true')
      else tab.removeAttribute('aria-current')
    }
    for (const sortOption of sortSelect.options) {
      // iOS 사파리는 hidden 옵션을 숨기지 않으므로 disabled도 함께 건다
      const unavailable = sortOption.hasAttribute('data-bean-only') && query.scope !== 'bean'
      sortOption.hidden = unavailable
      sortOption.disabled = unavailable
    }
    sortSelect.value = query.sort
    const placeholder = option('', query.scope === 'cafe' ? '모든 카페' : '모든 가게')
    shopSelect.replaceChildren(placeholder, ...shopOptions(entries, query.scope).map((shop) => option(shop, shop)))
    shopSelect.value = query.shop
    if (shopSelect.value !== query.shop) query = { ...query, shop: shopSelect.value }
  }

  function render() {
    beanFiltersEl.hidden = query.scope !== 'bean' || !hasBeanOptions
    let appliedCount = 0
    for (const { key, select } of beanSelects) {
      select.value = query.beanFilters[key]
      if (query.beanFilters[key]) appliedCount++
    }
    beanCount.textContent = String(appliedCount)
    beanCount.hidden = appliedCount === 0
    beanReset.hidden = appliedCount === 0
    const results = applyQuery(entries, query)
    const visible = new Set(results.map((entry) => entry.key))
    for (const [key, card] of cards) card.hidden = !visible.has(key)
    // 결과 순서대로 다시 붙여서 정렬을 화면에 반영한다
    for (const entry of results) {
      const card = cards.get(entry.key)
      if (card) grid.append(card)
    }
    grid.dataset.scope = query.scope
    countEl.textContent = `${results.length}개`
    emptyEl.hidden = results.length > 0
  }

  /** @param {import('./query.js').QueryPatch} patch */
  function update(patch) {
    const scopeChanged = patch.scope !== undefined && patch.scope !== query.scope
    query = updateQuery(query, patch)
    if (scopeChanged) syncControls()
    render()
  }

  for (const { key, select } of beanSelects) {
    select.addEventListener('change', () => update({ beanFilters: { [key]: select.value } }))
  }
  beanReset.addEventListener('click', () => update({ beanFilters: { ...DEFAULT_QUERY.beanFilters } }))

  textInput.addEventListener('input', () => update({ text: textInput.value }))
  sortSelect.addEventListener('change', () => update({ sort: /** @type {Query['sort']} */ (sortSelect.value) }))
  shopSelect.addEventListener('change', () => update({ shop: shopSelect.value }))
  decafInput.addEventListener('change', () => update({ decafOnly: decafInput.checked }))
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    textInput.blur()
  })
  for (const tab of tabs) {
    tab.addEventListener('click', () => update({ scope: /** @type {Query['scope']} */ (tab.dataset.scopeTab) }))
  }

  const modalEl = doc.getElementById('detail-modal')
  const modalBody = /** @type {HTMLElement} */ (doc.getElementById('detail-body'))
  const modal = bootstrap && modalEl ? bootstrap.Modal.getOrCreateInstance(modalEl) : null

  let detailRequest = 0

  /** @param {string} href */
  async function openDetail(href) {
    // 느린 응답이 뒤늦게 도착해 다른 기록을 덮어쓰지 않도록 마지막 요청만 반영한다
    const token = ++detailRequest
    modalBody.innerHTML = SPINNER
    modal.show()
    try {
      const res = await fetchFn(`${href}?fragment=1`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const html = await res.text()
      if (token !== detailRequest) return
      modalBody.innerHTML = html
      initCarousels(modalBody, bootstrap)
    } catch {
      if (token === detailRequest) modalBody.innerHTML = LOAD_ERROR
    }
  }

  grid.addEventListener('click', (event) => {
    const link = /** @type {Element} */ (event.target).closest('a[data-detail]')
    // 새 탭으로 열기(수정키 클릭)는 상세 페이지로 그대로 이동시킨다
    if (!link || !modal || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    void openDetail(link.getAttribute('href') ?? '')
  })

  syncControls()
  render()
}
