// @ts-check
import { normalize } from './query.js'

/**
 * 커핑 점수 4개를 모두 고르면 총점을 미리 보여준다
 * @param {ParentNode} root
 */
export function initTotalScore(root) {
  const output = root.querySelector('[data-total-score]')
  const selects = /** @type {HTMLSelectElement[]} */ ([...root.querySelectorAll('select[data-score]')])
  if (!output || selects.length === 0) return
  const update = () => {
    const values = selects.map((select) => select.value)
    output.textContent = values.every((v) => v !== '') ? String(values.reduce((sum, v) => sum + Number(v), 0)) : '-'
  }
  for (const select of selects) select.addEventListener('change', update)
  update()
}

/**
 * data-confirm 속성이 있는 폼은 제출 전에 확인을 받는다
 * @param {Document | HTMLElement} root
 * @param {(message: string) => boolean} [confirmFn]
 */
export function initConfirm(root, confirmFn = (message) => window.confirm(message)) {
  root.addEventListener('submit', (event) => {
    const form = event.target
    if (!(form instanceof HTMLFormElement)) return
    const message = form.dataset.confirm
    if (message && !confirmFn(message)) event.preventDefault()
  })
}

/**
 * 관리자 목록 즉시 검색
 * @param {ParentNode} root
 */
export function initListFilter(root) {
  const input = /** @type {HTMLInputElement | null} */ (root.querySelector('#admin-search'))
  const list = root.querySelector('#admin-list')
  const empty = /** @type {HTMLElement | null} */ (root.querySelector('#admin-empty'))
  if (!input || !list) return
  const items = /** @type {HTMLElement[]} */ ([...list.querySelectorAll('[data-search]')])
  input.addEventListener('input', () => {
    const tokens = normalize(input.value).split(' ').filter(Boolean)
    let shown = 0
    for (const item of items) {
      const text = item.dataset.search ?? ''
      const match = tokens.every((token) => text.includes(token))
      item.hidden = !match
      if (match) shown += 1
    }
    if (empty) empty.hidden = shown > 0
  })
}
