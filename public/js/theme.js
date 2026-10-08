// @ts-check
// 시스템 다크 모드를 따라 Bootstrap 색상 모드를 정한다. 첫 렌더링 전에 실행해 깜빡임을 막는다.
;(() => {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = () => document.documentElement.setAttribute('data-bs-theme', media.matches ? 'dark' : 'light')
  apply()
  media.addEventListener('change', apply)
})()
