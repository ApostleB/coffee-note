// @vitest-environment jsdom
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import ejs from 'ejs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initHome } from '../public/js/home.js'
import { VIEWS_DIR } from '../src/paths.js'
import { buildHomeModel } from '../src/view-models.js'
import { beanEntity, cafeEntity } from './fixtures.js'

const beans = [
  beanEntity({ id: 1, name: '에티오피아 구지', shop: '커피리브레', purchasedAt: '2026-10-01' }),
  beanEntity({
    id: 2,
    name: '케냐 AA',
    shop: '나무사이로',
    country: '케냐',
    flavorTags: ['자몽'],
    memo: null,
    summary: null,
    purchasedAt: '2026-10-03',
    isDecaf: true,
  }),
]
const cafes = [cafeEntity({ id: 1, menu: '게이샤 필터', cafeName: '프릳츠', visitedAt: '2026-10-05' })]

let show: ReturnType<typeof vi.fn>
let fetchMock: ReturnType<typeof vi.fn>

const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector(selector) as T
const visibleKeys = () =>
  [...document.querySelectorAll<HTMLElement>('#card-grid [data-key]')].filter((el) => !el.hidden).map((el) => el.dataset.key)

function setControl(name: string, value: string | boolean) {
  const control = $<HTMLFormElement>('#toolbar').elements.namedItem(name) as HTMLInputElement | HTMLSelectElement
  if (control instanceof HTMLInputElement && control.type === 'checkbox') {
    control.checked = value === true
    control.dispatchEvent(new Event('change', { bubbles: true }))
  } else if (control instanceof HTMLSelectElement) {
    control.value = String(value)
    control.dispatchEvent(new Event('change', { bubbles: true }))
  } else {
    control.value = String(value)
    control.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

beforeEach(async () => {
  const html = await ejs.renderFile(path.join(VIEWS_DIR, 'home.ejs'), {
    ...buildHomeModel(beans, cafes, '2026-10-08'),
    assetVersion: 't',
    isAdmin: false,
  })
  document.body.innerHTML = html
  show = vi.fn()
  fetchMock = vi.fn(async () => new Response('<h2 id="detail-title">상세 본문</h2>'))
  const bootstrap = {
    Modal: { getOrCreateInstance: vi.fn(() => ({ show })) },
    Carousel: { getOrCreateInstance: vi.fn() },
  }
  initHome(document, { bootstrap, fetch: fetchMock as unknown as typeof fetch })
})

describe('홈 화면 스크립트', () => {
  it('상세 모달은 마지막으로 연 기록의 응답만 반영한다', async () => {
    const resolvers: Array<(html: string) => void> = []
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => resolvers.push((html) => resolve(new Response(html)))),
    )
    $('[data-key="bean-1"] a[data-detail]').click()
    $('[data-key="bean-2"] a[data-detail]').click()
    expect(resolvers).toHaveLength(2)
    resolvers[1]('<p>두 번째</p>')
    await vi.waitFor(() => expect($('#detail-body').innerHTML).toContain('두 번째'))
    resolvers[0]('<p>첫 번째</p>')
    await new Promise((r) => setTimeout(r, 10))
    expect($('#detail-body').innerHTML).toContain('두 번째')
    expect($('#detail-body').innerHTML).not.toContain('첫 번째')
  })

  it('처음에는 원두만 최신순', () => {
    expect(visibleKeys()).toEqual(['bean-2', 'bean-1'])
    expect($('#result-count').textContent).toBe('2개')
    expect($('#empty-state').hidden).toBe(true)
  })

  it('검색어를 입력하면 즉시 거른다', () => {
    setControl('text', '자스민')
    expect(visibleKeys()).toEqual(['bean-1'])
    expect($('#result-count').textContent).toBe('1개')
  })

  it('범위 셀렉트와 전체 탭을 렌더링하지 않는다', () => {
    expect(document.querySelector('select[name=scope]')).toBeNull()
    expect([...document.querySelectorAll<HTMLElement>('[data-scope-tab]')].map(tab => tab.dataset.scopeTab)).toEqual(['bean', 'cafe'])
  })

  it('카페 탭: 가게 목록이 바뀌고 로스팅순은 고를 수 없다', () => {
    $('[data-scope-tab="cafe"]').click()
    expect(visibleKeys()).toEqual(['cafe-1'])
    expect($('#card-grid').dataset.scope).toBe('cafe')
    expect($('[data-scope-tab="cafe"]').getAttribute('aria-current')).toBe('true')
    expect($('[data-scope-tab="bean"]').hasAttribute('aria-current')).toBe(false)
    expect($('[data-scope-tab="cafe"]').classList.contains('active')).toBe(true)
    expect($('[data-scope-tab="bean"]').classList.contains('active')).toBe(false)
    const shopOptions = [...$<HTMLSelectElement>('select[name="shop"]').options].map((o) => o.textContent)
    expect(shopOptions).toEqual(['모든 카페', '프릳츠'])
    expect($<HTMLOptionElement>('option[value="roasted"]').disabled).toBe(true)
  })

  it('로스팅순에서 카페로 가면 최신순으로 돌아간다', () => {
    setControl('sort', 'roasted')
    $('[data-scope-tab="cafe"]').click()
    expect($<HTMLSelectElement>('select[name="sort"]').value).toBe('newest')
  })

  it('가게·디카페인 필터', () => {
    setControl('shop', '나무사이로')
    expect(visibleKeys()).toEqual(['bean-2'])
    setControl('shop', '')
    setControl('decafOnly', true)
    expect(visibleKeys()).toEqual(['bean-2'])
  })

  it('정렬하면 카드 순서가 바뀐다', () => {
    setControl('sort', 'name')
    expect(visibleKeys()).toEqual(['bean-1', 'bean-2'])
  })

  it('결과가 없으면 안내를 보여준다', () => {
    setControl('text', '없는검색어')
    expect(visibleKeys()).toEqual([])
    expect($('#empty-state').hidden).toBe(false)
    expect($('#result-count').textContent).toBe('0개')
  })

  it('카드를 누르면 상세 조각을 모달로 연다', async () => {
    $('[data-key="bean-1"] a[data-detail]').click()
    expect(show).toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith('/beans/1?fragment=1')
    await vi.waitFor(() => expect($('#detail-body').innerHTML).toContain('상세 본문'))
  })

  it('상세를 못 불러오면 안내 문구', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }))
    $('[data-key="bean-1"] a[data-detail]').click()
    await vi.waitFor(() => expect($('#detail-body').textContent).toContain('상세 정보를 불러오지 못했습니다.'))
  })
})


describe('홈 원두 옵션 필터', () => {
  it('선택 변경, 두 조건 AND, 적용 개수, 초기화', () => {
    setControl('bf-country', '에티오피아')
    expect(visibleKeys()).toEqual(['bean-1'])
    expect($('#bean-filter-count').textContent).toBe('1')
    expect($('#bean-filter-count').hidden).toBe(false)
    setControl('bf-flavorTag', '자몽')
    expect(visibleKeys()).toEqual([])
    expect($('#bean-filter-count').textContent).toBe('2')
    $('#bean-filter-reset').click()
    expect(visibleKeys()).toEqual(['bean-2', 'bean-1'])
    expect($('#bean-filter-count').hidden).toBe(true)
    expect($<HTMLSelectElement>('[name="bf-country"]').value).toBe('')
  })
  it('카페 전환하면 영역 숨김·값 초기화, 원두 복귀 시 표시', () => {
    setControl('bf-country', '케냐')
    setControl('shop', '나무사이로')
    $('[data-scope-tab="cafe"]').click()
    expect($<HTMLSelectElement>('[name=shop]').value).toBe('')
    expect(visibleKeys()).toEqual(['cafe-1'])
    expect($('#bean-filters').hidden).toBe(true)
    for (const select of document.querySelectorAll<HTMLSelectElement>('#bean-filters select')) expect(select.value).toBe('')
    $('[data-scope-tab="bean"]').click()
    expect([...$<HTMLSelectElement>('[name=shop]').options].map(o => o.textContent)).toEqual(['모든 가게', '나무사이로', '커피리브레'])
    expect($<HTMLOptionElement>('option[value=roasted]').disabled).toBe(false)
    expect($('[data-scope-tab="bean"]').getAttribute('aria-current')).toBe('true')
    expect($('[data-scope-tab="cafe"]').hasAttribute('aria-current')).toBe(false)
    expect($('#bean-filters').hidden).toBe(false)
    expect(visibleKeys()).toEqual(['bean-2', 'bean-1'])
  })
  it('JS 없이도 선택지 렌더링·빈 필드 숨김·HTML escaping', async () => {
    document.body.innerHTML = await ejs.renderFile(path.join(VIEWS_DIR, 'home.ejs'), {
      ...buildHomeModel([beanEntity({ country: '<산지>', process: null, roastLevel: null, variety: null, brewMethod: null, flavorTags: [] })], cafes), assetVersion: 't', isAdmin: false,
    })
    expect([...$<HTMLSelectElement>('[name="bf-country"]').options].map(o => o.value)).toEqual(['', '<산지>'])
    expect($<HTMLSelectElement>('[name="bf-process"]').parentElement!.hidden).toBe(true)
    expect($('#bean-filter-panel').classList.contains('collapse')).toBe(true)
    expect($('#bean-filter-toggle').hidden).toBe(false)
    expect($('#bean-filter-toggle').getAttribute('aria-expanded')).toBe('false')
    expect($('#bean-filter-toggle').getAttribute('data-bs-target')).toBe('#bean-filter-panel')
  })
  it('초기 컨트롤 복원값으로 필터링', async () => {
    document.body.innerHTML = await ejs.renderFile(path.join(VIEWS_DIR, 'home.ejs'), { ...buildHomeModel(beans, cafes), assetVersion: 't', isAdmin: false })
    $<HTMLSelectElement>('[name="bf-flavorTag"]').value = '자스민'
    initHome(document, { bootstrap: { Modal: { getOrCreateInstance: () => ({ show }) } }, fetch: fetchMock as unknown as typeof fetch })
    expect(visibleKeys()).toEqual(['bean-1'])
    expect($('#bean-filter-count').textContent).toBe('1')
  })
})


describe('초기 탭과 필터 레이아웃', () => {
  it.each(['cafe', 'none'])('초기 활성 탭 %s에서 범위를 읽고 없으면 원두를 쓴다', async (active) => {
    document.body.innerHTML = await ejs.renderFile(path.join(VIEWS_DIR, 'home.ejs'), { ...buildHomeModel(beans, cafes), assetVersion: 't', isAdmin: false })
    $('[data-scope-tab="bean"]').classList.remove('active')
    if (active === 'cafe') $('[data-scope-tab="cafe"]').classList.add('active')
    initHome(document, { bootstrap: { Modal: { getOrCreateInstance: () => ({ show }) } }, fetch: fetchMock as unknown as typeof fetch })
    expect(visibleKeys()).toEqual(active === 'cafe' ? ['cafe-1'] : ['bean-2', 'bean-1'])
    expect($('#bean-filters').hidden).toBe(active === 'cafe')
  })

  it.each([{ emptyBeans: [] }, { emptyBeans: [beanEntity({ country: null, process: null, roastLevel: null, variety: null, brewMethod: null, flavorTags: [] })] }])('원두 선택지가 모두 비면 SSR과 탭 왕복 후에도 패널과 토글을 숨긴다', async ({ emptyBeans }) => {
    document.body.innerHTML = await ejs.renderFile(path.join(VIEWS_DIR, 'home.ejs'), { ...buildHomeModel(emptyBeans, cafes), assetVersion: 't', isAdmin: false })
    expect($('#bean-filters').hidden).toBe(true)
    expect($('#bean-filter-toggle').hidden).toBe(true)
    initHome(document, { bootstrap: { Modal: { getOrCreateInstance: () => ({ show }) } }, fetch: fetchMock as unknown as typeof fetch })
    $('[data-scope-tab="cafe"]').click()
    $('[data-scope-tab="bean"]').click()
    expect($('#bean-filters').hidden).toBe(true)
    expect($('#bean-filter-toggle').hidden).toBe(true)
  })

  it('데스크톱에서는 JS 없이 접힘 패널을 표시하고 필터 열을 자동으로 채운다', async () => {
    const style = document.createElement('style')
    style.textContent = await readFile(path.resolve('public/css/app.css'), 'utf8')
    document.head.append(style)
    try {
      const desktop = [...style.sheet!.cssRules].filter((rule): rule is CSSMediaRule => rule instanceof CSSMediaRule && rule.conditionText === '(min-width: 992px)')
      const rules = desktop.flatMap(media => [...media.cssRules]).filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
      expect(rules.find(rule => rule.selectorText.split(',').map(selector => selector.trim()).includes('#bean-filter-panel.collapse'))?.style.getPropertyValue('display')).toBe('block')
      expect(rules.find(rule => rule.selectorText === '.coffee-bean-filter-grid')?.style.getPropertyValue('grid-template-columns')).toBe('repeat(auto-fit, minmax(10rem, 1fr))')
    } finally { style.remove() }
  })
})
