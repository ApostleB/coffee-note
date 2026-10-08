// @ts-check

/**
 * 터치 스와이프가 바로 동작하도록 캐러셀 인스턴스를 만든다 (자동 넘김 없음)
 * @param {ParentNode} root
 * @param {any} bootstrap
 */
export function initCarousels(root, bootstrap) {
  if (!bootstrap) return
  for (const el of root.querySelectorAll('.carousel')) {
    bootstrap.Carousel.getOrCreateInstance(el, { interval: false, ride: false })
  }
}
