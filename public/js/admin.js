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

/**
 * 카페 원두 행을 추가·삭제한다. 반복 키는 유지하고 id/label만 행 순서에 맞춘다.
 * @param {ParentNode} root
 */
export function initBeanRows(root) {
  const section = root.querySelector('#beans')
  const list = section?.querySelector('[data-bean-list]')
  const template = /** @type {HTMLTemplateElement | null | undefined} */ (section?.querySelector('[data-bean-template]'))
  const add = /** @type {HTMLButtonElement | null | undefined} */ (section?.querySelector('[data-add-bean]'))
  if (!section || !list || !template || !add) return
  const max = Number(section.getAttribute('data-max-beans'))
  const rows = () => [...list.querySelectorAll('[data-bean-row]')]
  // JS 없는 환경을 위한 빈 여분 행만 제거한다. 제출값/검증 오류 행은 보존한다.
  for (const spare of list.querySelectorAll('[data-bean-spare]')) spare.remove()
  const sync = () => {
    const current = rows()
    add.disabled = current.length >= max
    current.forEach((row, index) => {
      const number = row.querySelector('[data-bean-number]')
      if (number) number.textContent = String(index + 1)
      const remove = /** @type {HTMLButtonElement} */ (row.querySelector('[data-remove-bean]'))
      remove.disabled = current.length <= 1
      const inputs = /** @type {(HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[]} */ ([...row.querySelectorAll('[name]')])
      const hasValue = inputs.some(input => input.name === 'bean_is_decaf' ? input.value === 'true' : input.value.trim() !== '')
      for (const input of inputs) {
        const label = [...row.querySelectorAll('label')].find(label => label.htmlFor === input.id)
        input.id = `f-bean-${index}-${input.name.slice(5)}`
        if (label) label.htmlFor = input.id
        if (input.name === 'bean_name') input.required = current.length === 1 || hasValue
      }
    })
  }
  add.hidden = false
  add.addEventListener('click', () => {
    if (rows().length >= max) return
    const fragment = template.content.cloneNode(true)
    list.append(fragment)
    sync()
    const name = /** @type {HTMLInputElement | null | undefined} */ (rows().at(-1)?.querySelector('[name="bean_name"]'))
    name?.focus()
  })
  list.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return
    const button = event.target.closest('[data-remove-bean]')
    if (!button || rows().length <= 1) return
    button.closest('[data-bean-row]')?.remove()
    sync()
  })
  list.addEventListener('input', sync)
  list.addEventListener('change', sync)
  sync()
}
