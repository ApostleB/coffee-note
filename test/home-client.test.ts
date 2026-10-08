// @vitest-environment jsdom
import path from 'node:path'
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

  it('전체 범위는 카페도 보여주고 종류 배지를 켠다', () => {
    setControl('scope', 'all')
    expect(visibleKeys()).toEqual(['cafe-1', 'bean-2', 'bean-1'])
    expect($('#card-grid').dataset.scope).toBe('all')
  })

  it('카페 탭: 가게 목록이 바뀌고 로스팅순은 고를 수 없다', () => {
    $('[data-scope-tab="cafe"]').click()
    expect(visibleKeys()).toEqual(['cafe-1'])
    expect($<HTMLSelectElement>('select[name="scope"]').value).toBe('cafe')
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
