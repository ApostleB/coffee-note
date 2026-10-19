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
      remove.setAttribute('aria-label', `원두 ${index + 1} 삭제`)
      const legend = row.querySelector('legend')
      if (legend) {
        legend.id = `bean-legend-${index}`
        row.setAttribute('aria-labelledby', legend.id)
      }
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

/**
 * 큰 사진만 축소한다. 지원하지 않는 환경이나 변환 실패 시 원본을 보낸다.
 * @param {File} file
 * @returns {Promise<File>}
 */
export async function resizePhoto(file) {
  if (typeof createImageBitmap !== 'function') return file
  /** @type {ImageBitmap | undefined} */
  let bitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const longest = Math.max(bitmap.width, bitmap.height)
    if (longest <= 2400 && file.size <= 4 * 1024 * 1024) return file
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 2400 / longest)
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!blob || blob.type !== 'image/jpeg' || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]*$/, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  } finally {
    bitmap?.close()
  }
}

/**
 * 선택한 사진을 한 장씩 보내고 실패한 파일을 안내한다.
 * @param {ParentNode} root
 * @param {{fetch?: typeof fetch, resize?: (file: File) => Promise<File>, reload?: () => void}} [deps]
 */
export function initPhotoUpload(root, deps = {}) {
  const form = /** @type {HTMLFormElement | null} */ (root.querySelector('[data-photo-upload]'))
  const input = /** @type {HTMLInputElement | null | undefined} */ (form?.querySelector('input[name="photos"]'))
  const submit = /** @type {HTMLButtonElement | null | undefined} */ (form?.querySelector('button[type="submit"]'))
  const progress = root.querySelector('[data-photo-progress]')
  const errors = /** @type {HTMLElement | null} */ (root.querySelector('[data-photo-errors]'))
  if (!form || !input || !submit || !progress || !errors) return
  const send = deps.fetch ?? ((...args) => fetch(...args))
  const resize = deps.resize ?? resizePhoto
  const reload = deps.reload ?? (() => location.reload())
  submit.hidden = true
  const help = /** @type {HTMLElement | null} */ (root.querySelector('[data-photo-help]'))
  if (help) help.hidden = false
  // Enter 키로 기존 일괄 업로드가 중복 실행되지 않게 한다.
  form.addEventListener('submit', event => event.preventDefault())
  input.addEventListener('change', async () => {
    if (input.disabled) return
    const files = [...(input.files ?? [])]
    if (files.length === 0) return
    input.disabled = true
    errors.replaceChildren()
    errors.hidden = true
    const failures = document.createElement('ul')
    let succeeded = 0
    for (const [index, file] of files.entries()) {
      progress.textContent = `사진 올리는 중 ${index + 1}/${files.length}`
      let error = '업로드하지 못했습니다'
      try {
        const body = new FormData()
        body.append('photos', await resize(file))
        const response = await send(form.action, { method: 'POST', body, headers: { Accept: 'application/json' }, credentials: 'same-origin' })
        if (response.redirected && new URL(response.url, location.href).pathname === '/admin/login') {
          error = '로그인이 만료되었습니다. 다시 로그인하세요.'
        } else {
          const result = await response.json()
          if (response.ok && result?.ok === true) {
            succeeded += 1
            continue
          }
          if (typeof result?.error === 'string') error = result.error
        }
      } catch {
        // 네트워크 오류나 HTML 응답도 해당 파일만 실패 처리한다.
      }
      const item = document.createElement('li')
      item.textContent = `${file.name}: ${error}`
      failures.append(item)
    }
    input.value = ''
    input.disabled = false
    progress.textContent = '사진 업로드가 끝났습니다.'
    if (failures.childElementCount === 0) {
      reload()
      return
    }
    errors.append(failures)
    if (succeeded > 0) {
      const summary = document.createElement('p')
      summary.textContent = `${succeeded}장은 올라갔습니다`
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'btn btn-outline-secondary'
      button.textContent = '새로고침'
      button.addEventListener('click', reload)
      errors.append(summary, button)
    }
    errors.hidden = false
  })
}
