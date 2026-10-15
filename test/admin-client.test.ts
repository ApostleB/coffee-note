// @vitest-environment jsdom
import ejs from 'ejs'
import path from 'node:path'
import { VIEWS_DIR } from '../src/paths.js'
import { cafeVisitDef } from '../src/resources.js'
import { CAFE_BEAN_FIELDS, formValues } from '../src/fields.js'
import { beanInputKey, CAFE_BEAN_SECTION } from '../src/cafe-beans.js'
import * as admin from '../public/js/admin.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initConfirm, initListFilter, initTotalScore } from '../public/js/admin.js'

afterEach(() => { document.body.replaceChildren() })

function mount(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  document.body.append(root)
  return root
}

function choose(select: HTMLSelectElement, value: string) {
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('initTotalScore', () => {
  it('네 점수를 모두 고르면 총점을 보여준다', () => {
    const options = ['', ...Array.from({ length: 10 }, (_, i) => String(i + 1))]
      .map((v) => `<option value="${v}">${v}</option>`)
      .join('')
    const root = mount(
      `${['acidity', 'sweetness', 'body', 'aftertaste'].map((n) => `<select data-score name="${n}">${options}</select>`).join('')}` +
        '<span data-total-score></span>',
    )
    initTotalScore(root)
    const total = () => root.querySelector('[data-total-score]')?.textContent
    const selects = [...root.querySelectorAll('select')]
    expect(total()).toBe('-')
    choose(selects[0], '8')
    choose(selects[1], '7')
    choose(selects[2], '6')
    expect(total()).toBe('-')
    choose(selects[3], '9')
    expect(total()).toBe('30')
  })
})

describe('initConfirm', () => {
  it('확인을 거절하면 제출을 막는다', () => {
    const root = mount('<form data-confirm="삭제할까요?"><button>삭제</button></form><form id="plain"></form>')
    const confirmFn = vi.fn(() => false)
    initConfirm(root, confirmFn)
    const event = new Event('submit', { bubbles: true, cancelable: true })
    root.querySelector('form')!.dispatchEvent(event)
    expect(confirmFn).toHaveBeenCalledWith('삭제할까요?')
    expect(event.defaultPrevented).toBe(true)

    const plain = new Event('submit', { bubbles: true, cancelable: true })
    root.querySelector('#plain')!.dispatchEvent(plain)
    expect(confirmFn).toHaveBeenCalledTimes(1)
    expect(plain.defaultPrevented).toBe(false)
  })

  it('확인하면 그대로 제출한다', () => {
    const root = mount('<form data-confirm="삭제할까요?"></form>')
    initConfirm(root, () => true)
    const event = new Event('submit', { bubbles: true, cancelable: true })
    root.querySelector('form')!.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })
})

describe('initListFilter', () => {
  it('검색어로 목록을 거르고 결과가 없으면 안내한다', () => {
    const root = mount(`
      <input id="admin-search">
      <div id="admin-list">
        <a data-search="에티오피아 구지 커피리브레">구지</a>
        <a data-search="케냐 aa 나무사이로">케냐</a>
      </div>
      <p id="admin-empty" hidden></p>`)
    initListFilter(root)
    const input = root.querySelector<HTMLInputElement>('#admin-search')!
    const visible = () => [...root.querySelectorAll<HTMLElement>('[data-search]')].filter((el) => !el.hidden).map((el) => el.textContent)
    const type = (value: string) => {
      input.value = value
      input.dispatchEvent(new Event('input'))
    }
    type('케냐')
    expect(visible()).toEqual(['케냐'])
    type('  AA  나무 ')
    expect(visible()).toEqual(['케냐'])
    type('없음')
    expect(visible()).toEqual([])
    expect(root.querySelector<HTMLElement>('#admin-empty')!.hidden).toBe(false)
    type('')
    expect(visible()).toEqual(['구지', '케냐'])
    expect(root.querySelector<HTMLElement>('#admin-empty')!.hidden).toBe(true)
  })
})


describe('카페 원두 동적 폼', () => {
  async function form() {
    const html = await ejs.renderFile(path.join(VIEWS_DIR, 'admin/form.ejs'), {
      title: '카페 후기 수정', active: 'cafe-visits', assetVersion: 't', importMapJson: '{"imports":{}}', isAdmin: true,
      def: cafeVisitDef, entity: { id: 1, photos: [] }, values: formValues(cafeVisitDef.sections, { cafeName: '카페' }),
      errors: {}, action: '/admin/cafe-visits/1', listHref: '/admin/cafe-visits', saved: false, copied: false, photoError: null,
      beanFields: CAFE_BEAN_FIELDS, beanInputKey,
      beanRows: [formValues([CAFE_BEAN_SECTION], { name: '기존 원두', isDecaf: true })],
    })
    document.body.innerHTML = html
  }
  const rows = () => [...document.querySelectorAll<HTMLElement>('[data-bean-row]')]
  const add = () => document.querySelector<HTMLButtonElement>('[data-add-bean]')!
  const remove = (row: HTMLElement) => row.querySelector<HTMLButtonElement>('[data-remove-bean]')!

  it('JS 없이 기존 행과 필수가 아닌 빈 여분 행을 렌더링한다', async () => {
    await form()
    expect(rows()).toHaveLength(2)
    const spare = rows()[1].querySelector<HTMLInputElement>('[name="bean_name"]')!
    expect(spare.value).toBe('')
    expect(spare.required).toBe(false)
    expect(document.querySelector<HTMLFormElement>('#entry-form')!.checkValidity()).toBe(true)
  })

  it('추가·삭제·최소 1행·최대 20행과 평탄 전송 키를 유지한다', async () => {
    await form()
    expect(add()).not.toBeNull()
    admin.initBeanRows(document)
    expect(rows()).toHaveLength(1)
    expect(remove(rows()[0]).disabled).toBe(true)
    add().click()
    expect(rows()).toHaveLength(2)
    expect(rows()[1].querySelector<HTMLInputElement>('[name="bean_name"]')!.value).toBe('')
    for (let i = 0; i < 25; i++) add().click()
    expect(rows()).toHaveLength(20)
    expect(add().disabled).toBe(true)
    const names = CAFE_BEAN_FIELDS.map(f => beanInputKey(f.name)).sort()
    for (const row of rows()) {
      const inputs = [...row.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[name]')]
      expect(inputs.map(input => input.name).sort()).toEqual(names)
      expect(inputs.every(input => !input.disabled)).toBe(true)
      expect(row.querySelector('[name="bean_is_decaf"]')!.tagName).toBe('SELECT')
    }
    remove(rows()[5]).click()
    add().click()
    const ids = rows().flatMap(row => [...row.querySelectorAll('[id]')].map(el => el.id))
    expect(new Set(ids).size).toBe(ids.length)
    for (const label of document.querySelectorAll<HTMLLabelElement>('#beans label')) expect(document.getElementById(label.htmlFor)).not.toBeNull()
    const data = new FormData(document.querySelector<HTMLFormElement>('#entry-form')!)
    for (const name of names) expect(data.getAll(name)).toHaveLength(20)
    while (rows().length > 1) remove(rows().at(-1)!).click()
    remove(rows()[0]).click()
    expect(rows()).toHaveLength(1)
    expect(add().disabled).toBe(false)
  })
})
