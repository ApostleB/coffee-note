import { describe, expect, it } from 'vitest'
import { createLoginGuard } from '../src/login-guard.js'

const MIN = 60_000

function setup() {
  const clock = { t: 1_000_000 }
  const guard = createLoginGuard({ now: () => clock.t })
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
})
