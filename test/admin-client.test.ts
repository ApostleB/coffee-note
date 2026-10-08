// @vitest-environment jsdom
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
