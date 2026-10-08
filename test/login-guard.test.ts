import { describe, expect, it } from 'vitest'
import { clientKey, createLoginGuard } from '../src/login-guard.js'

const MIN = 60_000

function setup(maxEntries?: number) {
  const clock = { t: 1_000_000 }
  const guard = createLoginGuard({ now: () => clock.t, maxEntries })
  const fail = (ip: string, times: number) => {
    for (let i = 0; i < times; i += 1) guard.recordFailure(ip)
  }
  return { clock, guard, fail }
}

describe('createLoginGuard', () => {
  it('9회 실패까지는 차단하지 않는다', () => {
    const { guard, fail } = setup()
    fail('1.1.1.1', 9)
    expect(guard.check('1.1.1.1')).toEqual({ blocked: false })
  })

  it('10회째 실패 직후 10분간 차단한다', () => {
    const { guard, fail } = setup()
    fail('1.1.1.1', 10)
    expect(guard.check('1.1.1.1')).toEqual({ blocked: true, retryAfterMs: 10 * MIN })
  })

  it('차단 중에는 남은 시간이 줄어든다', () => {
    const { clock, guard, fail } = setup()
    fail('1.1.1.1', 10)
    clock.t += 4 * MIN
    expect(guard.check('1.1.1.1')).toEqual({ blocked: true, retryAfterMs: 6 * MIN })
  })

  it('10분이 지나면 풀리고 실패 횟수도 0부터 다시 센다', () => {
    const { clock, guard, fail } = setup()
    fail('1.1.1.1', 10)
    clock.t += 10 * MIN
    expect(guard.check('1.1.1.1')).toEqual({ blocked: false })
    fail('1.1.1.1', 9)
    expect(guard.check('1.1.1.1')).toEqual({ blocked: false })
    fail('1.1.1.1', 1)
    expect(guard.check('1.1.1.1').blocked).toBe(true)
  })

  it('성공하면 실패 횟수를 0으로 되돌린다', () => {
    const { guard, fail } = setup()
    fail('1.1.1.1', 9)
    guard.recordSuccess('1.1.1.1')
    fail('1.1.1.1', 9)
    expect(guard.check('1.1.1.1')).toEqual({ blocked: false })
  })

  it('마지막 실패로부터 10분이 지나면 실패 횟수가 리셋된다', () => {
    const { clock, guard, fail } = setup()
    fail('1.1.1.1', 9)
    clock.t += 10 * MIN
    fail('1.1.1.1', 9)
    expect(guard.check('1.1.1.1')).toEqual({ blocked: false })
  })

  it('IP마다 독립적으로 센다', () => {
    const { guard, fail } = setup()
    fail('1.1.1.1', 10)
    expect(guard.check('1.1.1.1').blocked).toBe(true)
    expect(guard.check('2.2.2.2')).toEqual({ blocked: false })
  })

  describe('클라이언트 키 정규화', () => {
    it('IPv4는 그대로, IPv4-mapped IPv6는 IPv4와 같은 키', () => {
      expect(clientKey('1.2.3.4')).toBe('1.2.3.4')
      expect(clientKey('::ffff:1.2.3.4')).toBe('1.2.3.4')
      expect(clientKey('::FFFF:102:304')).toBe('1.2.3.4')
      expect(clientKey('0:0:0:0:0:ffff:1.2.3.4')).toBe('1.2.3.4')
    })

    it('같은 /56 IPv6는 같은 키, 다른 /56은 다른 키', () => {
      const base = clientKey('2001:db8:abcd:1200::1')
      expect(clientKey('2001:DB8:abcd:12ff:ffff:ffff:ffff:ffff')).toBe(base)
      expect(clientKey('2001:db8:abcd:1234::9%eth0')).toBe(base)
      expect(clientKey('2001:db8:abcd:1300::1')).not.toBe(base)
      expect(clientKey('2001:db8:abce:1200::1')).not.toBe(base)
    })

    it('같은 /56의 서로 다른 IPv6 주소로 10회 실패하면 차단', () => {
      const { guard } = setup()
      for (let i = 0; i < 10; i += 1) guard.recordFailure(`2001:db8:abcd:12${i.toString(16).padStart(2, '0')}::${i + 1}`)
      expect(guard.check('2001:db8:abcd:12aa::99').blocked).toBe(true)
      expect(guard.check('2001:db8:abcd:1300::1')).toEqual({ blocked: false })
    })

    it('::ffff:1.2.3.4와 1.2.3.4는 실패 횟수를 공유한다', () => {
      const { guard } = setup()
      for (let i = 0; i < 5; i += 1) guard.recordFailure('1.2.3.4')
      for (let i = 0; i < 5; i += 1) guard.recordFailure('::ffff:1.2.3.4')
      expect(guard.check('1.2.3.4').blocked).toBe(true)
    })
  })

  describe('항목 수 상한', () => {
    it('상한을 넘겨도 차단 중인 항목은 지우지 않는다', () => {
      const { guard, fail } = setup(5)
      fail('9.9.9.9', 10)
      for (let i = 1; i <= 20; i += 1) guard.recordFailure(`10.0.0.${i}`)
      expect(guard.check('9.9.9.9').blocked).toBe(true)
    })

    it('미차단 항목 중 가장 오래된 것부터 지운다', () => {
      const { guard, fail } = setup(3)
      fail('1.1.1.1', 9)
      guard.recordFailure('2.2.2.2')
      guard.recordFailure('3.3.3.3')
      guard.recordFailure('4.4.4.4') // 1.1.1.1이 밀려난다
      guard.recordFailure('1.1.1.1')
      expect(guard.check('1.1.1.1')).toEqual({ blocked: false })
      fail('1.1.1.1', 8)
      expect(guard.check('1.1.1.1')).toEqual({ blocked: false })
    })

    it('차단 항목만으로 가득 차면 새 IP의 실패는 저장하지 않고 기존 차단은 유지한다', () => {
      const { guard, fail } = setup(2)
      fail('1.1.1.1', 10)
      fail('2.2.2.2', 10)
      fail('3.3.3.3', 10)
      expect(guard.check('3.3.3.3')).toEqual({ blocked: false })
      expect(guard.check('1.1.1.1').blocked).toBe(true)
      expect(guard.check('2.2.2.2').blocked).toBe(true)
    })
  })
})
