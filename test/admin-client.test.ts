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

  it('원두 행의 그룹 이름과 삭제 버튼 이름이 번호와 함께 재정렬된다', async () => {
    await form()
    admin.initBeanRows(document)
    add().click()
    add().click()
    const accName = (el: Element, attr: string) => {
      const ids = el.getAttribute(attr)
      return el.getAttribute('aria-label') ?? document.getElementById(ids!)?.textContent?.trim()
    }
    const removeNames = () => rows().map(row => remove(row).getAttribute('aria-label'))
    expect(removeNames()).toEqual(['원두 1 삭제', '원두 2 삭제', '원두 3 삭제'])
    const groupNames = () => rows().map(row => {
      const legend = document.getElementById(row.getAttribute('aria-labelledby')!)
      return legend?.textContent?.replace(/\s+/g, ' ').trim()
    })
    expect(groupNames()).toEqual(['원두 1', '원두 2', '원두 3'])
    expect(accName(rows()[0], 'aria-labelledby')).toBe('원두 1')
    remove(rows()[1]).click()
    expect(removeNames()).toEqual(['원두 1 삭제', '원두 2 삭제'])
    expect(groupNames()).toEqual(['원두 1', '원두 2'])
    const legendIds = rows().map(row => row.getAttribute('aria-labelledby'))
    expect(new Set(legendIds).size).toBe(2)
    expect(legendIds).toEqual(['bean-legend-0', 'bean-legend-1'])
  })
})

describe('사진 자동 업로드', () => {
  function photoForm() {
    const root = mount(`<form data-photo-upload action="/admin/beans/1/photos">
      <input type="file" name="photos" multiple><button type="submit">업로드</button>
      <p data-photo-progress aria-live="polite"></p>
      <div data-photo-errors class="alert alert-danger" hidden></div>
    </form>`)
    const input = root.querySelector<HTMLInputElement>('input')!
    const select = (names = ['a.png', 'b.png', 'c.png']) => {
      Object.defineProperty(input, 'files', { configurable: true, value: names.map(name => new File(['image'], name, { type: 'image/png' })) })
      input.dispatchEvent(new Event('change'))
    }
    return { root, input, select }
  }
  const ok = () => new Response(JSON.stringify({ ok: true }), { status: 201, headers: { 'Content-Type': 'application/json' } })

  it('세 장을 한 장씩 순차 전송하고 진행 상태와 입력 잠금을 갱신한 뒤 새로고침한다', async () => {
    const { root, input, select } = photoForm()
    const pending: ((response: Response) => void)[] = []
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(resolve => pending.push(resolve)))
    const resize = vi.fn(async (file: File) => new File(['small'], file.name.replace('.png', '.jpg'), { type: 'image/jpeg' }))
    const reload = vi.fn()
    admin.initPhotoUpload(root, { fetch, resize, reload })
    expect(root.querySelector<HTMLButtonElement>('button')!.hidden).toBe(true)
    select()
    expect(input.disabled).toBe(true)
    for (let i = 0; i < 3; i++) {
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(i + 1))
      expect(root.querySelector('[data-photo-progress]')!.textContent).toContain(`${i + 1}/3`)
      const [url, options] = fetch.mock.calls[i]
      expect(url).toContain('/admin/beans/1/photos')
      expect(options).toMatchObject({ method: 'POST', headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      const files = (options!.body as FormData).getAll('photos') as File[]
      expect(files).toHaveLength(1)
      expect(files[0].name).toBe(['a.jpg', 'b.jpg', 'c.jpg'][i])
      expect(reload).not.toHaveBeenCalled()
      pending[i](ok())
    }
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce())
    expect(input.disabled).toBe(false)
    expect(input.value).toBe('')
  })

  it('중간 400 오류 이후에도 계속하고 실패 파일과 서버 메시지, 성공 수, 새로고침을 보여준다', async () => {
    const { root, input, select } = photoForm()
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: '<지원 불가>' }), { status: 400 }))
      .mockResolvedValueOnce(ok())
    const reload = vi.fn()
    admin.initPhotoUpload(root, { fetch, resize: async f => f, reload })
    select()
    await vi.waitFor(() => expect(input.disabled).toBe(false))
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(reload).not.toHaveBeenCalled()
    const errors = root.querySelector<HTMLElement>('[data-photo-errors]')!
    expect(errors.hidden).toBe(false)
    expect(errors.textContent).toContain('b.png')
    expect(errors.textContent).toContain('<지원 불가>')
    expect(errors.textContent).toContain('2장은 올라갔습니다')
    expect(errors.querySelector('지원')).toBeNull()
    errors.querySelector<HTMLButtonElement>('button')!.click()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('빈 선택은 전송하지 않고 HTML 응답과 네트워크 오류, 로그인 만료는 실패로 표시한다', async () => {
    const { root, input, select } = photoForm()
    const login = new Response('<html>login</html>')
    Object.defineProperties(login, { redirected: { value: true }, url: { value: 'http://localhost/admin/login' } })
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(new Response('<html>Error</html>'))
      .mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(login)
    const reload = vi.fn()
    admin.initPhotoUpload(root, { fetch, resize: async f => f, reload })
    select([])
    expect(fetch).not.toHaveBeenCalled()
    select()
    await vi.waitFor(() => expect(input.disabled).toBe(false))
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(reload).not.toHaveBeenCalled()
    expect(root.textContent).toContain('업로드하지 못했습니다')
    expect(root.textContent).toContain('다시 로그인하세요')
    expect(root.querySelector('[data-photo-errors] button')).toBeNull()
  })

  it('createImageBitmap이 없으면 원본을 반환한다', async () => {
    vi.stubGlobal('createImageBitmap', undefined)
    try {
      const file = new File(['image'], 'a.png', { type: 'image/png' })
      expect(await admin.resizePhoto(file)).toBe(file)
    } finally { vi.unstubAllGlobals() }
  })
})
